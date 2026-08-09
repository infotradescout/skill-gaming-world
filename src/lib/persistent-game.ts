import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  competitionEntries,
  competitions,
  deals,
  gameDefinitions,
  gameSessions,
  moveEvents,
  rulesetVersions,
  scores,
} from "@/db/schema";
import {
  applyAuthoritativeMove,
  canonicalJson,
  createCuratedSolvableKlondikeDeal,
  createKlondikeGameState,
  createServerActivityClock,
  finalizeActivityClock,
  hashKlondikeGameState,
  hashMoveRequest,
  isKlondikeDrawThreeRules,
  KLONDIKE_DRAW_THREE_RULES,
  KLONDIKE_DRAW_THREE_RULESET,
  OFFICIAL_SCORE_VERSION,
  type AcceptedMoveOutcome,
  type KlondikeGameState,
  type MoveIntent,
  type MoveRejectionCode,
  type ServerActivityClock,
} from "@/domain";

import type { DemoGameSession, DemoUser } from "./demo-store";
import { appendPersistentAuditEvent } from "./audit";
import { getRuntimeEnv } from "./env";
import { GameServiceError } from "./game-service";
import {
  assertPersistentPlayerAccess,
  type PersistentPlayerAccessTransaction,
} from "./persistent-player-access";

function encryptionKey(): Buffer {
  const secret = getRuntimeEnv().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET_REQUIRED");
  return createHash("sha256")
    .update("MONETAIRE_PERSISTED_SEED_V1\0")
    .update(secret)
    .digest();
}

function encryptSeed(seed: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(seed, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptSeed(value: string): string {
  const [version, nonce, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext) {
    throw new Error("INVALID_SEED_CIPHERTEXT");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function assertPersistentAccess(
  user: DemoUser,
  transaction?: PersistentPlayerAccessTransaction,
): Promise<void> {
  if (transaction) {
    await assertPersistentPlayerAccess(transaction, user);
    return;
  }
  await getDatabase().transaction((accessTransaction) =>
    assertPersistentPlayerAccess(accessTransaction, user),
  );
}

type PersistentGameTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

async function ensureRuleset(database: PersistentGameTransaction) {
  await database
    .insert(gameDefinitions)
    .values({ key: "MONETAIRE_SOLITAIRE", publicName: "Monetaire" })
    .onConflictDoNothing();
  const [definition] = await database
    .select({ id: gameDefinitions.id })
    .from(gameDefinitions)
    .where(eq(gameDefinitions.key, "MONETAIRE_SOLITAIRE"))
    .limit(1);
  if (!definition) throw new Error("GAME_DEFINITION_MISSING");
  await database
    .insert(rulesetVersions)
    .values({
      gameDefinitionId: definition.id,
      version: KLONDIKE_DRAW_THREE_RULESET,
      rules: KLONDIKE_DRAW_THREE_RULES,
      scoring: { version: OFFICIAL_SCORE_VERSION },
      immutableAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing();
  const [ruleset] = await database
    .select({
      id: rulesetVersions.id,
      rules: rulesetVersions.rules,
      scoring: rulesetVersions.scoring,
    })
    .from(rulesetVersions)
    .where(
      and(
        eq(rulesetVersions.gameDefinitionId, definition.id),
        eq(rulesetVersions.version, KLONDIKE_DRAW_THREE_RULESET),
      ),
    )
    .limit(1);
  if (!ruleset) throw new Error("RULESET_MISSING");
  if (
    !isKlondikeDrawThreeRules(ruleset.rules) ||
    ruleset.scoring.version !== OFFICIAL_SCORE_VERSION
  ) {
    throw new Error("RULESET_CONTRACT_MISMATCH");
  }
  return ruleset.id;
}

function fromRecord(record: typeof gameSessions.$inferSelect): DemoGameSession {
  return {
    id: record.id,
    userId: record.userId,
    mode: record.sessionMode as DemoGameSession["mode"],
    competitionEntryId: record.competitionEntryId ?? undefined,
    seed:
      record.sessionMode === "PRACTICE"
        ? decryptSeed(record.seedCiphertext)
        : "SERVER_HELD_UNTIL_COMPETITION_CLOSE",
    state: record.stateSnapshot as unknown as KlondikeGameState,
    activityClock:
      record.activityClockSnapshot as unknown as ServerActivityClock,
    createdAt: record.createdAt.toISOString(),
  };
}

type PersistentMoveInput = {
  user: DemoUser;
  sessionId: string;
  actionId: string;
  sequence: number;
  priorStateHash: string;
  intent: MoveIntent;
  auditRequestId?: string;
};

type PersistedMovePayload = {
  command: {
    sequence: number;
    priorStateHash: string;
    intent: MoveIntent;
  };
  outcome?: AcceptedMoveOutcome;
  rejection?: {
    state: KlondikeGameState;
    code: MoveRejectionCode;
    message: string;
    requestHash: string;
    stateHashBefore: string;
  };
};

class ConcurrentGameCommandError extends Error {}

type PersistedRejectedMoveResult = {
  accepted: false;
  state: KlondikeGameState;
  code: MoveRejectionCode;
  message: string;
  requestHash: string;
  stateHashBefore: string;
};

function rejectedPersistentMove(
  record: typeof gameSessions.$inferSelect,
  input: PersistentMoveInput,
  code: "IDEMPOTENCY_CONFLICT" | "REPLAYED_SEQUENCE",
  message: string,
) {
  const state = record.stateSnapshot as unknown as KlondikeGameState;
  return {
    session: fromRecord(record),
    result: {
      accepted: false as const,
      state,
      code,
      message,
      requestHash: hashMoveRequest({
        gameId: record.id,
        actionId: input.actionId,
        sequence: input.sequence,
        priorStateHash: input.priorStateHash,
        intent: input.intent,
      }),
      stateHashBefore: hashKlondikeGameState(state),
    },
  };
}

function rejectedMoveEventValues(
  record: typeof gameSessions.$inferSelect,
  input: PersistentMoveInput,
  rejection: PersistedRejectedMoveResult,
  idempotencyKey = input.actionId,
  serverReceivedAt?: Date,
) {
  return {
    gameSessionId: record.id,
    sequence: input.sequence,
    idempotencyKey,
    moveType: input.intent.type,
    movePayload: {
      command: {
        sequence: input.sequence,
        priorStateHash: input.priorStateHash,
        intent: input.intent,
      },
      rejection,
    },
    stateHashBefore: rejection.stateHashBefore,
    stateHashAfter: rejection.stateHashBefore,
    serverReceivedAt,
    accepted: false,
    rejectionCode: rejection.code,
    createdAt: serverReceivedAt,
  };
}

function idempotencyConflictEventValues(
  record: typeof gameSessions.$inferSelect,
  input: PersistentMoveInput,
  rejection: PersistedRejectedMoveResult,
  serverReceivedAt?: Date,
) {
  const values = rejectedMoveEventValues(
    record,
    input,
    rejection,
    `rejected:${randomUUID()}`,
    serverReceivedAt,
  );
  return {
    ...values,
    movePayload: {
      ...values.movePayload,
      conflictOfActionId: input.actionId,
    },
  };
}

function persistedIdempotencyConflictWhere(
  input: PersistentMoveInput,
  rejection: PersistedRejectedMoveResult,
) {
  return and(
    eq(moveEvents.gameSessionId, input.sessionId),
    eq(moveEvents.rejectionCode, "IDEMPOTENCY_CONFLICT"),
    sql`${moveEvents.movePayload} ->> 'conflictOfActionId' = ${input.actionId}`,
    sql`${moveEvents.movePayload} -> 'rejection' ->> 'requestHash' = ${rejection.requestHash}`,
  );
}

function isSamePersistedCommand(
  payload: PersistedMovePayload,
  input: PersistentMoveInput,
): boolean {
  return (
    canonicalJson(payload.command.intent) === canonicalJson(input.intent) &&
    payload.command.sequence === input.sequence &&
    payload.command.priorStateHash === input.priorStateHash
  );
}

function replayPersistedMove(
  record: typeof gameSessions.$inferSelect,
  move: typeof moveEvents.$inferSelect,
  input: PersistentMoveInput,
) {
  const payload = move.movePayload as unknown as PersistedMovePayload;
  if (!isSamePersistedCommand(payload, input)) {
    return rejectedPersistentMove(
      record,
      input,
      "IDEMPOTENCY_CONFLICT",
      "The action id was already used for a different command.",
    );
  }

  if (move.accepted) {
    if (!payload.outcome) {
      throw new Error("PERSISTED_ACCEPTED_MOVE_OUTCOME_MISSING");
    }
    return {
      session: fromRecord(record),
      result: {
        accepted: true as const,
        idempotentReplay: true,
        state: record.stateSnapshot as unknown as KlondikeGameState,
        event: payload.outcome.event,
        outcome: payload.outcome,
      },
    };
  }

  const rejection = payload.rejection;
  const code = rejection?.code ?? (move.rejectionCode as MoveRejectionCode);
  if (!code) throw new Error("PERSISTED_REJECTED_MOVE_CODE_MISSING");
  const state =
    rejection?.state ??
    (record.stateSnapshot as unknown as KlondikeGameState);
  return {
    session: fromRecord(record),
    result: {
      accepted: false as const,
      state,
      code,
      message:
        rejection?.message ??
        `Legacy persisted rejection (${code}); the original message was not recorded.`,
      requestHash:
        rejection?.requestHash ??
        hashMoveRequest({
          gameId: record.id,
          actionId: input.actionId,
          sequence: payload.command.sequence,
          priorStateHash: payload.command.priorStateHash,
          intent: payload.command.intent,
        }),
      stateHashBefore: rejection?.stateHashBefore ?? move.stateHashBefore,
    },
  };
}

async function resolveConcurrentPersistentMove(input: PersistentMoveInput) {
  const database = getDatabase();
  const [record] = await database
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, input.sessionId))
    .limit(1);
  if (!record) {
    throw new GameServiceError("SESSION_NOT_FOUND", "Game session was not found.");
  }
  if (record.userId !== input.user.id) {
    throw new GameServiceError(
      "SESSION_FORBIDDEN",
      "Game session belongs to another account.",
    );
  }
  const replayWithConflictAudit = async (
    move: typeof moveEvents.$inferSelect,
  ) => {
    const replay = replayPersistedMove(record, move, input);
    if (
      replay.result.accepted ||
      replay.result.code !== "IDEMPOTENCY_CONFLICT"
    ) {
      return replay;
    }
    const [storedConflict] = await database
      .select()
      .from(moveEvents)
      .where(persistedIdempotencyConflictWhere(input, replay.result))
      .limit(1);
    if (storedConflict) {
      return replayPersistedMove(record, storedConflict, input);
    }
    await database
      .insert(moveEvents)
      .values(idempotencyConflictEventValues(record, input, replay.result));
    return replay;
  };
  const [winningAction] = await database
    .select()
    .from(moveEvents)
    .where(
      and(
        eq(moveEvents.gameSessionId, input.sessionId),
        eq(moveEvents.idempotencyKey, input.actionId),
      ),
    )
    .limit(1);
  if (winningAction) {
    return replayWithConflictAudit(winningAction);
  }
  const rejection = rejectedPersistentMove(
    record,
    input,
    "REPLAYED_SEQUENCE",
    "The authoritative session advanced before this command could commit.",
  );
  await database
    .insert(moveEvents)
    .values(rejectedMoveEventValues(record, input, rejection.result))
    .onConflictDoNothing();
  const [storedRejection] = await database
    .select()
    .from(moveEvents)
    .where(
      and(
        eq(moveEvents.gameSessionId, input.sessionId),
        eq(moveEvents.idempotencyKey, input.actionId),
      ),
    )
    .limit(1);
  if (!storedRejection) return rejection;
  return replayWithConflictAudit(storedRejection);
}

export async function createPersistentPracticeSession(
  user: DemoUser,
  auditRequestId?: string,
): Promise<DemoGameSession> {
  const database = getDatabase();
  const id = randomUUID();
  const seed = randomBytes(32).toString("base64url");
  const deal = createCuratedSolvableKlondikeDeal(seed);
  const state = createKlondikeGameState({ gameId: id, deal });
  return database.transaction(async (transaction) => {
    await assertPersistentAccess(user, transaction);
    const rulesetVersionId = await ensureRuleset(transaction);
    const [databaseClock] = await transaction
      .select({ observedAt: sql<Date>`clock_timestamp()` })
      .from(sql`(select 1) as database_clock_source`)
      .limit(1);
    if (!databaseClock) throw new Error("DATABASE_CLOCK_UNAVAILABLE");
    const now = new Date(databaseClock.observedAt);
    if (Number.isNaN(now.getTime())) {
      throw new Error("DATABASE_CLOCK_INVALID");
    }
    const activityClock = createServerActivityClock(now.getTime());
    const [dealRecord] = await transaction
      .insert(deals)
      .values({
        rulesetVersionId,
        seedCiphertext: encryptSeed(seed),
        seedCommitment: deal.commitment,
        canonicalDealHash: createHash("sha256")
          .update(deal.orderedDeck.map((card) => card.id).join(","))
          .digest("hex"),
        immutableAt: now,
        createdAt: now,
      })
      .returning({ id: deals.id });
    if (!dealRecord) throw new Error("PRACTICE_DEAL_CREATION_FAILED");
    await transaction.insert(gameSessions).values({
      id,
      userId: user.id,
      dealId: dealRecord.id,
      rulesetVersionId,
      sessionMode: "PRACTICE",
      stateSnapshot: state as unknown as Record<string, unknown>,
      activityClockSnapshot:
        activityClock as unknown as Record<string, unknown>,
      seedCiphertext: encryptSeed(seed),
      nextSequence: 1,
      startedAt: now,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });
    if (auditRequestId) {
      await appendPersistentAuditEvent(transaction, {
        eventType: "GAME_SESSION_CREATED",
        actorId: user.id,
        subjectType: "GAME_SESSION",
        subjectId: id,
        reason: "Player started a noncash practice session.",
        requestId: auditRequestId,
        afterState: {
          mode: "PRACTICE",
          dealCommitment: state.dealCommitment,
          valuablePrize: false,
          environment: "configured",
        },
      });
    }
    return {
      id,
      userId: user.id,
      mode: "PRACTICE",
      seed,
      state,
      activityClock,
      createdAt: now.toISOString(),
    };
  });
}

export async function resumePersistentSession(
  user: DemoUser,
  sessionId: string,
): Promise<DemoGameSession> {
  return getDatabase().transaction(async (transaction) => {
    await assertPersistentAccess(user, transaction);
    const [record] = await transaction
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .limit(1);
    if (!record) {
      throw new GameServiceError(
        "SESSION_NOT_FOUND",
        "Game session was not found.",
      );
    }
    if (record.userId !== user.id) {
      throw new GameServiceError(
        "SESSION_FORBIDDEN",
        "Game session belongs to another account.",
      );
    }
    if (record.status === "ACTIVE" && record.competitionEntryId) {
      const [openCompetition] = await transaction
        .select({ id: competitions.id })
        .from(competitionEntries)
        .innerJoin(
          competitions,
          eq(competitions.id, competitionEntries.competitionId),
        )
        .where(
          and(
            eq(competitionEntries.id, record.competitionEntryId),
            eq(competitions.status, "OPEN"),
            sql`${competitions.opensAt} <= clock_timestamp()`,
            sql`${competitions.closesAt} > clock_timestamp()`,
          ),
        )
        .limit(1);
      if (!openCompetition) {
        throw new GameServiceError(
          "SESSION_NOT_ACTIVE",
          "The noncash competition is no longer open.",
        );
      }
    }
    return fromRecord(record);
  });
}

export async function listActivePersistentSessions(
  user: DemoUser,
): Promise<DemoGameSession[]> {
  return getDatabase().transaction(async (transaction) => {
    await assertPersistentAccess(user, transaction);
    const records = await transaction
      .select({ session: gameSessions })
      .from(gameSessions)
      .leftJoin(
        competitionEntries,
        eq(competitionEntries.id, gameSessions.competitionEntryId),
      )
      .leftJoin(
        competitions,
        eq(competitions.id, competitionEntries.competitionId),
      )
      .where(
        and(
          eq(gameSessions.userId, user.id),
          eq(gameSessions.status, "ACTIVE"),
          or(
            isNull(gameSessions.competitionEntryId),
            and(
              eq(competitions.status, "OPEN"),
              sql`${competitions.opensAt} <= clock_timestamp()`,
              sql`${competitions.closesAt} > clock_timestamp()`,
            ),
          ),
        ),
      )
      .orderBy(desc(gameSessions.startedAt))
      .limit(20);
    return records.map(({ session }) => fromRecord(session));
  });
}

export async function submitPersistentMove(input: PersistentMoveInput) {
  try {
    return await getDatabase().transaction(async (transaction) => {
      // Player authorization is always the first configured mutation lock.
      // Restriction writers use the same lock, so no later session mutation can
      // cross an already-committed cooldown, exclusion, or account closure.
      await assertPersistentAccess(input.user, transaction);
      // Serialize commands for one authoritative session across every process.
      // The unique constraints below remain the final defense, but normal races
      // now converge before either caller reads the session snapshot.
      await transaction.execute(
        sql`select pg_advisory_xact_lock(
          hashtext('MONETAIRE_GAME_SESSION_V1'),
          hashtext(${input.sessionId})
        )`,
      );
      const [databaseClock] = await transaction
        .select({ serverAt: sql<Date>`clock_timestamp()` })
        .from(sql`(select 1) as database_clock_source`)
        .limit(1);
      if (!databaseClock) throw new Error("DATABASE_CLOCK_UNAVAILABLE");
      const serverAt = new Date(databaseClock.serverAt);
      if (Number.isNaN(serverAt.getTime())) {
        throw new Error("DATABASE_CLOCK_INVALID");
      }
      const serverAtMs = serverAt.getTime();
      const [record] = await transaction
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, input.sessionId))
        .limit(1);
      if (!record) {
        throw new GameServiceError(
          "SESSION_NOT_FOUND",
          "Game session was not found.",
        );
      }
      if (record.userId !== input.user.id) {
        throw new GameServiceError(
          "SESSION_FORBIDDEN",
          "Game session belongs to another account.",
        );
      }

      const replayWithConflictAudit = async (
        move: typeof moveEvents.$inferSelect,
        replayRecord = record,
      ) => {
        const replay = replayPersistedMove(replayRecord, move, input);
        if (
          replay.result.accepted ||
          replay.result.code !== "IDEMPOTENCY_CONFLICT"
        ) {
          return replay;
        }
        const [storedConflict] = await transaction
          .select()
          .from(moveEvents)
          .where(persistedIdempotencyConflictWhere(input, replay.result))
          .limit(1);
        if (storedConflict) {
          return replayPersistedMove(replayRecord, storedConflict, input);
        }
        await transaction
          .insert(moveEvents)
          .values(
            idempotencyConflictEventValues(
              replayRecord,
              input,
              replay.result,
              serverAt,
            ),
          );
        return replay;
      };

      const existing = await transaction
        .select()
        .from(moveEvents)
        .where(
          and(
            eq(moveEvents.gameSessionId, input.sessionId),
            eq(moveEvents.idempotencyKey, input.actionId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return replayWithConflictAudit(existing[0]);
      }

      if (record.competitionEntryId) {
        const [competition] = await transaction
          .select({
            status: competitions.status,
            opensAt: competitions.opensAt,
            closesAt: competitions.closesAt,
          })
          .from(competitionEntries)
          .innerJoin(
            competitions,
            eq(competitions.id, competitionEntries.competitionId),
          )
          .where(eq(competitionEntries.id, record.competitionEntryId))
          .limit(1);
        if (
          !competition ||
          competition.status !== "OPEN" ||
          serverAtMs < competition.opensAt.getTime() ||
          serverAtMs >= competition.closesAt.getTime()
        ) {
          throw new GameServiceError(
            "SESSION_NOT_ACTIVE",
            "The noncash competition is no longer open for moves.",
          );
        }
      }

      const [existingSequence] = await transaction
        .select({ id: moveEvents.id })
        .from(moveEvents)
        .where(
          and(
            eq(moveEvents.gameSessionId, input.sessionId),
            eq(moveEvents.sequence, input.sequence),
            eq(moveEvents.accepted, true),
          ),
        )
        .limit(1);
      if (existingSequence) {
        const rejection = rejectedPersistentMove(
          record,
          input,
          "REPLAYED_SEQUENCE",
          "The move sequence was already processed by a different action.",
        );
        await transaction
          .insert(moveEvents)
          .values(
            rejectedMoveEventValues(
              record,
              input,
              rejection.result,
              input.actionId,
              serverAt,
            ),
          )
          .onConflictDoNothing();
        return rejection;
      }

      const state = record.stateSnapshot as unknown as KlondikeGameState;
      const result = applyAuthoritativeMove(
        state,
        {
          gameId: record.id,
          actionId: input.actionId,
          sequence: input.sequence,
          priorStateHash: input.priorStateHash,
          intent: input.intent,
        },
        { serverReceivedAtMs: serverAtMs },
      );
      const nextState = result.accepted ? result.state : state;
      let activityClock =
        record.activityClockSnapshot as unknown as ServerActivityClock;
      if (
        result.accepted &&
        !result.idempotentReplay &&
        nextState.status !== "ACTIVE" &&
        activityClock.status !== "FINALIZED"
      ) {
        activityClock = finalizeActivityClock(activityClock, serverAtMs);
      }
      const inserted = await transaction
        .insert(moveEvents)
        .values({
          gameSessionId: record.id,
          sequence: input.sequence,
          idempotencyKey: input.actionId,
          moveType: input.intent.type,
          movePayload: {
            command: {
              sequence: input.sequence,
              priorStateHash: input.priorStateHash,
              intent: input.intent,
            },
            outcome: result.accepted ? result.outcome : undefined,
            rejection: result.accepted
              ? undefined
              : {
                  state: result.state,
                  code: result.code,
                  message: result.message,
                  requestHash: result.requestHash,
                  stateHashBefore: result.stateHashBefore,
                },
          },
          stateHashBefore: hashKlondikeGameState(state),
          stateHashAfter: hashKlondikeGameState(nextState),
          serverReceivedAt: serverAt,
          accepted: result.accepted,
          rejectionCode: result.accepted ? null : result.code,
          createdAt: serverAt,
        })
        .onConflictDoNothing()
        .returning({ id: moveEvents.id });
      if (!inserted[0]) {
        const [currentRecord] = await transaction
          .select()
          .from(gameSessions)
          .where(eq(gameSessions.id, input.sessionId))
          .limit(1);
        const resolvedRecord = currentRecord ?? record;
        const [winningAction] = await transaction
          .select()
          .from(moveEvents)
          .where(
            and(
              eq(moveEvents.gameSessionId, input.sessionId),
              eq(moveEvents.idempotencyKey, input.actionId),
            ),
          )
          .limit(1);
        if (winningAction) {
          return replayWithConflictAudit(winningAction, resolvedRecord);
        }
        const rejection = rejectedPersistentMove(
          resolvedRecord,
          input,
          "REPLAYED_SEQUENCE",
          "The move sequence was already processed by a different action.",
        );
        await transaction
          .insert(moveEvents)
          .values(
            rejectedMoveEventValues(
              resolvedRecord,
              input,
              rejection.result,
              input.actionId,
              serverAt,
            ),
          )
          .onConflictDoNothing();
        return rejection;
      }
      if (result.accepted) {
        const terminalAt =
          nextState.status === "ACTIVE" ? null : serverAt;
        const finalizedDurationMs =
          activityClock.status === "FINALIZED"
            ? BigInt(activityClock.accumulatedActiveMs)
            : record.activeDurationMs;
        const updated = await transaction
          .update(gameSessions)
          .set({
            stateSnapshot: nextState as unknown as Record<string, unknown>,
            activityClockSnapshot:
              activityClock as unknown as Record<string, unknown>,
            nextSequence: nextState.lastSequence + 1,
            status:
              nextState.status === "ACTIVE"
                ? "ACTIVE"
                : nextState.status === "WON"
                  ? "COMPLETED"
                  : "ABANDONED",
            activeDurationMs: finalizedDurationMs,
            completedAt: nextState.status === "WON" ? terminalAt : null,
            abandonedAt:
              nextState.status === "ABANDONED" ? terminalAt : null,
            lastActiveAt: serverAt,
            updatedAt: serverAt,
          })
          .where(
            and(
              eq(gameSessions.id, record.id),
              eq(gameSessions.status, "ACTIVE"),
              eq(gameSessions.nextSequence, input.sequence),
            ),
          )
          .returning({ id: gameSessions.id });
        if (!updated[0]) throw new ConcurrentGameCommandError();
        if (
          nextState.status !== "ACTIVE" &&
          activityClock.status === "FINALIZED"
        ) {
          await transaction
            .insert(scores)
            .values({
              gameSessionId: record.id,
              completed: nextState.status === "WON",
              validMoveCount: nextState.validMoveCount,
              verifiedActiveDurationMs: BigInt(
                activityClock.accumulatedActiveMs,
              ),
              scoringVersion: OFFICIAL_SCORE_VERSION,
              computedAt: serverAt,
              createdAt: serverAt,
            })
            .onConflictDoNothing();
        }
        if (nextState.status !== "ACTIVE" && input.auditRequestId) {
          await appendPersistentAuditEvent(transaction, {
            eventType:
              nextState.status === "WON"
                ? "GAME_SESSION_COMPLETED"
                : "GAME_SESSION_ABANDONED",
            actorId: input.user.id,
            subjectType: "GAME_SESSION",
            subjectId: record.id,
            reason: `Server accepted terminal ${nextState.status} state.`,
            requestId: input.auditRequestId,
            afterState: {
              status: nextState.status,
              validMoveCount: nextState.validMoveCount,
              verifiedActivePlayMs: activityClock.accumulatedActiveMs,
              environment: "configured",
            },
          });
        }
      }
      return {
        session: { ...fromRecord(record), state: nextState, activityClock },
        result,
      };
    });
  } catch (error) {
    if (error instanceof ConcurrentGameCommandError) {
      return resolveConcurrentPersistentMove(input);
    }
    throw error;
  }
}

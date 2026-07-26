import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  deals,
  gameDefinitions,
  gameSessions,
  moveEvents,
  rulesetVersions,
  scores,
  selfExclusions,
} from "@/db/schema";
import {
  applyAuthoritativeMove,
  createCuratedSolvableKlondikeDeal,
  createKlondikeGameState,
  createServerActivityClock,
  finalizeActivityClock,
  hashKlondikeGameState,
  type KlondikeGameState,
  type MoveIntent,
  type ServerActivityClock,
} from "@/domain";

import type { DemoGameSession, DemoUser } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { GameServiceError } from "./game-service";
import { evaluateDemoPlayerAccess } from "./player-access";

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

export async function assertPersistentAccess(user: DemoUser): Promise<void> {
  const exclusions = await getDatabase()
    .select()
    .from(selfExclusions)
    .where(eq(selfExclusions.userId, user.id));
  const decision = evaluateDemoPlayerAccess({
    user,
    mode: "MONETAIRE_PLAY",
    exclusions: exclusions.map((record) => ({
      id: record.id,
      userId: record.userId,
      scope: record.scope as "ALL_PRODUCTS" | "SKILL_GAMING_WORLD" | "CASINO",
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt?.toISOString(),
      permanent: record.permanent,
      removalPolicy: "COMPLIANCE_REVIEW_ONLY",
    })),
    serverAtMs: Date.now(),
  });
  if (!decision.allowed) {
    throw new GameServiceError(
      decision.reasonCodes.includes("SELF_EXCLUDED")
        ? "SELF_EXCLUDED"
        : "ACCOUNT_RESTRICTED",
      "Account restrictions block Monetaire Play.",
    );
  }
}

async function ensureRuleset() {
  const database = getDatabase();
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
      version: "KLONDIKE_DRAW_ONE_V1",
      rules: { draw: 1, redeals: "unlimited", valuablePrize: false },
      scoring: { version: "MONETAIRE_SCORE_V1" },
      immutableAt: new Date(),
    })
    .onConflictDoNothing();
  const [ruleset] = await database
    .select({ id: rulesetVersions.id })
    .from(rulesetVersions)
    .where(
      and(
        eq(rulesetVersions.gameDefinitionId, definition.id),
        eq(rulesetVersions.version, "KLONDIKE_DRAW_ONE_V1"),
      ),
    )
    .limit(1);
  if (!ruleset) throw new Error("RULESET_MISSING");
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

export async function createPersistentPracticeSession(
  user: DemoUser,
): Promise<DemoGameSession> {
  await assertPersistentAccess(user);
  const database = getDatabase();
  const rulesetVersionId = await ensureRuleset();
  const id = randomUUID();
  const seed = randomBytes(32).toString("base64url");
  const deal = createCuratedSolvableKlondikeDeal(seed);
  const now = Date.now();
  const state = createKlondikeGameState({ gameId: id, deal });
  const activityClock = createServerActivityClock(now);
  const [dealRecord] = await database
    .insert(deals)
    .values({
      rulesetVersionId,
      seedCiphertext: encryptSeed(seed),
      seedCommitment: deal.commitment,
      canonicalDealHash: createHash("sha256")
        .update(deal.orderedDeck.map((card) => card.id).join(","))
        .digest("hex"),
      immutableAt: new Date(now),
    })
    .returning({ id: deals.id });
  await database.insert(gameSessions).values({
    id,
    userId: user.id,
    dealId: dealRecord.id,
    rulesetVersionId,
    sessionMode: "PRACTICE",
    stateSnapshot: state as unknown as Record<string, unknown>,
    activityClockSnapshot: activityClock as unknown as Record<string, unknown>,
    seedCiphertext: encryptSeed(seed),
    nextSequence: 1,
  });
  return {
    id,
    userId: user.id,
    mode: "PRACTICE",
    seed,
    state,
    activityClock,
    createdAt: new Date(now).toISOString(),
  };
}

export async function resumePersistentSession(
  user: DemoUser,
  sessionId: string,
): Promise<DemoGameSession> {
  await assertPersistentAccess(user);
  const [record] = await getDatabase()
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId))
    .limit(1);
  if (!record) {
    throw new GameServiceError("SESSION_NOT_FOUND", "Game session was not found.");
  }
  if (record.userId !== user.id) {
    throw new GameServiceError(
      "SESSION_FORBIDDEN",
      "Game session belongs to another account.",
    );
  }
  return fromRecord(record);
}

export async function submitPersistentMove(input: {
  user: DemoUser;
  sessionId: string;
  actionId: string;
  sequence: number;
  priorStateHash: string;
  intent: MoveIntent;
}) {
  await assertPersistentAccess(input.user);
  return getDatabase().transaction(async (transaction) => {
    const [record] = await transaction
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, input.sessionId))
      .limit(1);
    if (!record) {
      throw new GameServiceError("SESSION_NOT_FOUND", "Game session was not found.");
    }
    if (record.userId !== input.user.id) {
      throw new GameServiceError("SESSION_FORBIDDEN", "Game session belongs to another account.");
    }

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
      const payload = existing[0].movePayload as {
        command: typeof input;
        outcome?: unknown;
      };
      const same =
        JSON.stringify(payload.command.intent) === JSON.stringify(input.intent) &&
        payload.command.sequence === input.sequence &&
        payload.command.priorStateHash === input.priorStateHash;
      if (!same) {
        return {
          session: fromRecord(record),
          result: {
            accepted: false as const,
            code: "IDEMPOTENCY_CONFLICT",
            message: "The action id was already used for a different command.",
            stateHashBefore: hashKlondikeGameState(
              record.stateSnapshot as unknown as KlondikeGameState,
            ),
            requestHash: "",
          },
        };
      }
      return {
        session: fromRecord(record),
        result: {
          accepted: true as const,
          idempotentReplay: true,
          state: record.stateSnapshot as unknown as KlondikeGameState,
          outcome: payload.outcome,
        },
      };
    }

    const state = record.stateSnapshot as unknown as KlondikeGameState;
    const serverAtMs = Date.now();
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
    await transaction.insert(moveEvents).values({
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
      },
      stateHashBefore: hashKlondikeGameState(state),
      stateHashAfter: hashKlondikeGameState(nextState),
      accepted: result.accepted,
      rejectionCode: result.accepted ? null : result.code,
    });
    if (result.accepted) {
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
          lastActiveAt: new Date(serverAtMs),
          updatedAt: new Date(serverAtMs),
        })
        .where(
          and(
            eq(gameSessions.id, record.id),
            eq(gameSessions.nextSequence, input.sequence),
          ),
        )
        .returning({ id: gameSessions.id });
      if (!updated[0]) throw new Error("CONCURRENT_GAME_COMMAND");
      if (
        nextState.status === "WON" &&
        activityClock.status === "FINALIZED"
      ) {
        await transaction
          .insert(scores)
          .values({
            gameSessionId: record.id,
            completed: true,
            validMoveCount: nextState.validMoveCount,
            verifiedActiveDurationMs: BigInt(
              activityClock.accumulatedActiveMs,
            ),
            scoringVersion: "MONETAIRE_SCORE_V1",
          })
          .onConflictDoNothing();
      }
    }
    return {
      session: { ...fromRecord(record), state: nextState, activityClock },
      result,
    };
  });
}

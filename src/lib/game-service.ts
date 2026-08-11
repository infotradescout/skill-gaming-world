import { randomBytes } from "node:crypto";

import {
  applyAuthoritativeMove,
  createKlondikeGameState,
  createCuratedSolvableKlondikeDeal,
  createOfficialScore,
  createServerActivityClock,
  deepFreeze,
  enterNoncashCompetition,
  finalizeActivityClock,
  getVerifiedActivePlayMs,
  hashKlondikeGameState,
  type MoveIntent,
} from "@/domain";

import {
  getCuratedCompetitionBundle,
} from "./competition-catalog";
import {
  getDemoStore,
  type DemoGameSession,
  type DemoUser,
} from "./demo-store";
import { createId } from "./ids";
import { getRuntimeEnv } from "./env";
import { evaluateDemoPlayerAccess } from "./player-access";

export class GameServiceError extends Error {
  constructor(
    readonly code:
      | "ACCOUNT_RESTRICTED"
      | "SELF_EXCLUDED"
      | "SESSION_NOT_FOUND"
      | "SESSION_FORBIDDEN"
      | "SESSION_NOT_ACTIVE"
      | "DUPLICATE_COMPETITION_ENTRY",
    message: string,
  ) {
    super(message);
  }
}

function assertPlayerMayStart(user: DemoUser): void {
  const access = evaluateDemoPlayerAccess({
    user,
    mode: "MONETAIRE_PLAY",
    exclusions: getDemoStore().selfExclusions,
    serverAtMs: Date.now(),
  });
  if (!access.allowed) {
    if (access.reasonCodes.includes("SELF_EXCLUDED")) {
      throw new GameServiceError(
        "SELF_EXCLUDED",
        "Self-exclusion blocks Skill Gaming World sessions.",
      );
    }
    throw new GameServiceError(
      "ACCOUNT_RESTRICTED",
      "Account restrictions block new game sessions.",
    );
  }
}

function createSession(input: {
  user: DemoUser;
  mode: DemoGameSession["mode"];
  seed: string;
  deal: Parameters<typeof createKlondikeGameState>[0]["deal"];
  competitionEntryId?: string;
}): DemoGameSession {
  const now = Date.now();
  const id = createId("game");
  const session: DemoGameSession = {
    id,
    userId: input.user.id,
    mode: input.mode,
    competitionEntryId: input.competitionEntryId,
    seed: input.seed,
    state: createKlondikeGameState({ gameId: id, deal: input.deal }),
    activityClock: createServerActivityClock(now),
    createdAt: new Date(now).toISOString(),
  };
  getDemoStore().gameSessionsById.set(id, session);
  return session;
}

export function createPracticeSession(user: DemoUser): DemoGameSession {
  assertPlayerMayStart(user);
  const seed = randomBytes(32).toString("base64url");
  return createSession({
    user,
    mode: "PRACTICE",
    seed,
    deal: createCuratedSolvableKlondikeDeal(seed),
  });
}

export function createCompetitionSession(user: DemoUser): DemoGameSession {
  assertPlayerMayStart(user);
  const store = getDemoStore();
  const { competition, deal } = getCuratedCompetitionBundle();
  const existingEntry = store.competitionEntries.find(
    (entry) =>
      entry.competitionId === competition.competitionId &&
      entry.userId === user.id,
  );
  if (existingEntry) {
    throw new GameServiceError(
      "DUPLICATE_COMPETITION_ENTRY",
      "This account already entered the competition.",
    );
  }

  const entry = enterNoncashCompetition(competition, {
    entryId: createId("competition-entry"),
    userId: user.id,
    enteredAtServerMs: Date.now(),
  });
  const session = createSession({
    user,
    mode: "NONCASH_COMPETITION",
    seed: "SERVER_HELD_UNTIL_COMPETITION_CLOSE",
    deal,
    competitionEntryId: entry.entryId,
  });
  store.competitionEntries = [...store.competitionEntries, entry];
  return session;
}

export function requireOwnedGameSession(
  user: DemoUser,
  sessionId: string,
): DemoGameSession {
  assertPlayerMayStart(user);
  const session = getDemoStore().gameSessionsById.get(sessionId);
  if (!session) {
    throw new GameServiceError("SESSION_NOT_FOUND", "Game session was not found.");
  }
  if (session.userId !== user.id) {
    throw new GameServiceError(
      "SESSION_FORBIDDEN",
      "Game session belongs to another account.",
    );
  }
  return session;
}

export function resumeOwnedGameSession(
  user: DemoUser,
  sessionId: string,
): DemoGameSession {
  return requireOwnedGameSession(user, sessionId);
}

export function listActiveOwnedGameSessions(
  user: DemoUser,
): DemoGameSession[] {
  assertPlayerMayStart(user);
  return [...getDemoStore().gameSessionsById.values()]
    .filter(
      (session) =>
        session.userId === user.id && session.state.status === "ACTIVE",
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function submitGameMove(input: {
  user: DemoUser;
  sessionId: string;
  actionId: string;
  sequence: number;
  priorStateHash: string;
  intent: MoveIntent;
}) {
  const session = requireOwnedGameSession(input.user, input.sessionId);

  const serverAtMs = Date.now();
  const result = applyAuthoritativeMove(
    session.state,
    {
      gameId: session.id,
      actionId: input.actionId,
      sequence: input.sequence,
      priorStateHash: input.priorStateHash,
      intent: input.intent,
    },
    { serverReceivedAtMs: serverAtMs },
  );

  if (result.accepted) {
    session.state = result.state;
  } else {
    const store = getDemoStore();
    store.rejectedGameCommandAttempts = Object.freeze([
      ...store.rejectedGameCommandAttempts,
      deepFreeze({
        id: createId("rejected-game-command"),
        userId: input.user.id,
        gameSessionId: session.id,
        actionId: input.actionId,
        sequence: input.sequence,
        priorStateHash: input.priorStateHash,
        intent: input.intent,
        requestHash: result.requestHash,
        stateHashAtRejection: result.stateHashBefore,
        rejectionCode: result.code,
        rejectionMessage: result.message,
        serverReceivedAtMs: serverAtMs,
        createdAt: new Date(serverAtMs).toISOString(),
      }),
    ]);
  }

  const final =
    result.accepted &&
    !result.idempotentReplay &&
    (result.state.status === "WON" || result.state.status === "ABANDONED");
  if (final && session.activityClock.status !== "FINALIZED") {
    session.activityClock = finalizeActivityClock(
      session.activityClock,
      serverAtMs,
    );
  }

  if (
    final &&
    session.competitionEntryId &&
    session.activityClock.status === "FINALIZED"
  ) {
    const store = getDemoStore();
    const existing = store.officialScores.find(
      (score) => score.gameId === session.id,
    );
    if (!existing) {
      store.officialScores = [
        ...store.officialScores,
        createOfficialScore({
          scoreId: createId("score"),
          entryId: session.competitionEntryId,
          game: session.state,
          finalizedClock: session.activityClock,
        }),
      ];
    }
  }

  return { session, result };
}

function publicCard(
  positioned:
    | { readonly card: { id: string; suit: string; rank: string }; readonly faceUp: boolean }
    | undefined,
) {
  if (!positioned) return null;
  if (!positioned.faceUp) {
    return { id: null, suit: null, rank: null, faceUp: false };
  }
  return { ...positioned.card, faceUp: true };
}

export function publicGameSession(session: DemoGameSession) {
  const observedAtMs = getRuntimeEnv().DEMO_MODE
    ? Math.max(Date.now(), session.activityClock.lastServerEventMs)
    : session.activityClock.lastServerEventMs;
  const verifiedActivePlayMs =
    session.activityClock.status === "FINALIZED"
      ? session.activityClock.accumulatedActiveMs
      : getVerifiedActivePlayMs(session.activityClock, observedAtMs);
  const foundations = Object.fromEntries(
    Object.entries(session.state.foundations).map(([suit, cards]) => [
      suit,
      {
        count: cards.length,
        top: cards.at(-1) ?? null,
      },
    ]),
  );

  return {
    id: session.id,
    mode: session.mode,
    competitionEntryId: session.competitionEntryId,
    rulesetVersion: session.state.rulesetVersion,
    dealGeneratorVersion: session.state.dealGeneratorVersion,
    dealCommitment: session.state.dealCommitment,
    stateHash: hashKlondikeGameState(session.state),
    status: session.state.status,
    sequence: session.state.lastSequence,
    validMoveCount: session.state.validMoveCount,
    verifiedActivePlayMs,
    stock: {
      remaining: session.state.stock.length,
    },
    waste: {
      count: session.state.waste.length,
      top: session.state.waste.at(-1) ?? null,
    },
    tableau: session.state.tableau.map((pile) => pile.map(publicCard)),
    foundations,
    createdAt: session.createdAt,
    seed:
      session.mode === "PRACTICE"
        ? session.seed
        : null,
    serverAuthoritative: true,
  };
}

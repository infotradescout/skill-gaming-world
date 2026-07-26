import {
  createPlayCoinLedger,
  getPlayCoinBalance,
  type CompetitionEntry,
  type KlondikeGameState,
  type MoveIntent,
  type OfficialScore,
  type PlayCoinLedger,
  type PlayCoinTransaction,
  type ServerActivityClock,
} from "@/domain";

export type DemoUserStatus =
  | "ACTIVE"
  | "COOLDOWN"
  | "SELF_EXCLUDED"
  | "CLOSED"
  | "SUSPENDED";

export type DemoAdminRole =
  | "SUPPORT"
  | "FRAUD_REVIEW"
  | "CONTENT_ADMIN"
  | "FINANCE_AUDITOR"
  | "COMPLIANCE_ADMIN"
  | "SUPER_ADMIN";

export interface DemoUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  status: DemoUserStatus;
  createdAt: string;
  acceptedPlayCoinTermsVersion: string;
  acceptedPlayCoinTermsAt: string;
  cooldownUntil?: string;
  adminRoles: DemoAdminRole[];
}

export interface DemoSession {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface DemoPlayCoinEntry {
  id: string;
  transactionId: string;
  userId: string;
  direction: "DEBIT" | "CREDIT";
  amountMinor: number;
  balanceAfterMinor: number;
  reason: string;
  referenceType: "WELCOME_GRANT" | "SANDBOX_PURCHASE" | "GAME_ENTRY" | "ADJUSTMENT";
  idempotencyKey: string;
  chargedRealMoney: false;
  createdAt: string;
  transactionHash: string;
}

export interface DemoSandboxIdempotencyRecord {
  readonly scopedKey: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly transactionId: string;
}

export interface DemoSelfExclusion {
  readonly id: string;
  readonly userId: string;
  readonly scope: "ALL_PRODUCTS" | "SKILL_GAMING_WORLD" | "CASINO";
  readonly startsAt: string;
  readonly endsAt?: string;
  readonly permanent: boolean;
  readonly removalPolicy: "COMPLIANCE_REVIEW_ONLY";
}

export interface DemoAuditEvent {
  readonly id: string;
  readonly eventType: string;
  readonly actorId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly reason: string;
  readonly beforeState?: Readonly<Record<string, unknown>>;
  readonly afterState?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface DemoAppeal {
  id: string;
  userId: string;
  gameSessionId?: string;
  subject: string;
  statement: string;
  status: "OPEN";
  createdAt: string;
}

export interface DemoGameSession {
  id: string;
  userId: string;
  mode: "PRACTICE" | "NONCASH_COMPETITION";
  competitionEntryId?: string;
  seed: string;
  state: Readonly<KlondikeGameState>;
  activityClock: Readonly<ServerActivityClock>;
  createdAt: string;
}

export interface DemoRejectedGameCommandAttempt {
  readonly id: string;
  readonly userId: string;
  readonly gameSessionId: string;
  readonly actionId: string;
  readonly sequence: number;
  readonly priorStateHash: string;
  readonly intent: Readonly<MoveIntent>;
  readonly requestHash: string;
  readonly stateHashAtRejection: string;
  readonly rejectionCode: string;
  readonly rejectionMessage: string;
  readonly serverReceivedAtMs: number;
  readonly createdAt: string;
}

export interface DemoStore {
  usersById: Map<string, DemoUser>;
  userIdsByEmail: Map<string, string>;
  sessionsByTokenHash: Map<string, DemoSession>;
  playCoinLedger: Readonly<PlayCoinLedger>;
  sandboxIdempotencyRecords: Map<string, DemoSandboxIdempotencyRecord>;
  selfExclusions: readonly Readonly<DemoSelfExclusion>[];
  appeals: DemoAppeal[];
  gameSessionsById: Map<string, DemoGameSession>;
  rejectedGameCommandAttempts: readonly DemoRejectedGameCommandAttempt[];
  competitionEntries: Readonly<CompetitionEntry>[];
  officialScores: Readonly<OfficialScore>[];
  auditEvents: readonly Readonly<DemoAuditEvent>[];
}

declare global {
  var __skillGamingWorldDemoStore: DemoStore | undefined;
}

function createStore(): DemoStore {
  return {
    usersById: new Map(),
    userIdsByEmail: new Map(),
    sessionsByTokenHash: new Map(),
    playCoinLedger: createPlayCoinLedger(),
    sandboxIdempotencyRecords: new Map(),
    selfExclusions: [],
    appeals: [],
    gameSessionsById: new Map(),
    rejectedGameCommandAttempts: Object.freeze([]),
    competitionEntries: [],
    officialScores: [],
    auditEvents: [],
  };
}

export function getDemoStore(): DemoStore {
  if (!globalThis.__skillGamingWorldDemoStore) {
    globalThis.__skillGamingWorldDemoStore = createStore();
  }
  return globalThis.__skillGamingWorldDemoStore;
}

export function resetDemoStoreForTests(): void {
  globalThis.__skillGamingWorldDemoStore = createStore();
}

export function playCoinBalance(userId: string): number {
  return getPlayCoinBalance(getDemoStore().playCoinLedger, userId);
}

function transactionUserDelta(
  transaction: Readonly<PlayCoinTransaction>,
  userId: string,
): number {
  const accountId = `PLAY_COIN:USER:${userId}`;
  return transaction.lines.reduce((total, line) => {
    if (line.accountId !== accountId) {
      return total;
    }
    return (
      total +
      (line.side === "CREDIT"
        ? line.amountMinorUnits
        : -line.amountMinorUnits)
    );
  }, 0);
}

function idempotencyForTransaction(
  transactionId: string,
): string {
  for (const record of getDemoStore().sandboxIdempotencyRecords.values()) {
    if (record.transactionId === transactionId) {
      return record.idempotencyKey;
    }
  }
  return "";
}

/**
 * User history and balances are projections of immutable double-entry lines.
 * No independently mutable balance or user-entry array exists.
 */
export function playCoinHistory(
  userId: string,
): readonly DemoPlayCoinEntry[] {
  let runningBalance = 0;
  const history: DemoPlayCoinEntry[] = [];

  for (const transaction of getDemoStore().playCoinLedger.transactions) {
    const delta = transactionUserDelta(transaction, userId);
    if (delta === 0) {
      continue;
    }
    runningBalance += delta;
    history.push({
      id: `${transaction.transactionId}:user-entry`,
      transactionId: transaction.transactionId,
      userId,
      direction: delta > 0 ? "CREDIT" : "DEBIT",
      amountMinor: Math.abs(delta),
      balanceAfterMinor: runningBalance,
      reason: transaction.reason,
      referenceType:
        transaction.kind === "SANDBOX_PACKAGE"
          ? "SANDBOX_PURCHASE"
          : transaction.kind === "ADMIN_ADJUSTMENT"
            ? "ADJUSTMENT"
            : transaction.kind === "ENTERTAINMENT_SPEND"
              ? "GAME_ENTRY"
              : "WELCOME_GRANT",
      idempotencyKey: idempotencyForTransaction(
        transaction.transactionId,
      ),
      chargedRealMoney: false,
      createdAt: new Date(transaction.serverRecordedAtMs).toISOString(),
      transactionHash: transaction.transactionHash,
    });
  }

  return Object.freeze(history);
}

export function playCoinEntryForTransaction(
  userId: string,
  transactionId: string,
): DemoPlayCoinEntry | undefined {
  return playCoinHistory(userId).find(
    (entry) => entry.transactionId === transactionId,
  );
}

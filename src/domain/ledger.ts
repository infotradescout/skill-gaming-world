import {
  AdminActor,
  AdminAuditLog,
  appendAdminAuditEvent,
} from "./admin-audit";
import {
  canonicalJson,
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
  requirePositiveInteger,
  sha256Hex,
} from "./shared";

export const LEDGER_TYPES = [
  "PLAY_COIN",
  "SKILL_PRIZE_USD",
  "CASINO_CASH_USD",
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const RESERVED_LEDGER_CONTRACTS = deepFreeze({
  PLAY_COIN: {
    type: "PLAY_COIN",
    operational: true,
    cashValue: false,
    redeemable: false,
    transferableBetweenUsers: false,
  },
  SKILL_PRIZE_USD: {
    type: "SKILL_PRIZE_USD",
    operational: false,
    cashValue: true,
    redeemable: false,
    transferableBetweenUsers: false,
  },
  CASINO_CASH_USD: {
    type: "CASINO_CASH_USD",
    operational: false,
    cashValue: true,
    redeemable: false,
    transferableBetweenUsers: false,
  },
} as const);

export type LedgerSide = "DEBIT" | "CREDIT";

export interface PlayCoinLedgerLine {
  readonly ledgerType: "PLAY_COIN";
  readonly accountId: string;
  readonly side: LedgerSide;
  readonly amountMinorUnits: number;
}

export type PlayCoinTransactionKind =
  | "EARNED"
  | "PROMOTIONAL"
  | "SANDBOX_PACKAGE"
  | "ENTERTAINMENT_SPEND"
  | "ADMIN_ADJUSTMENT";

export interface PlayCoinTransaction {
  readonly transactionId: string;
  readonly ledgerType: "PLAY_COIN";
  readonly kind: PlayCoinTransactionKind;
  readonly userId: string;
  readonly amountMinorUnits: number;
  readonly serverRecordedAtMs: number;
  readonly reason: string;
  readonly entertainmentPurpose: EntertainmentSpendPurpose | null;
  readonly auditReference: string | null;
  readonly sourceReference: string | null;
  readonly balanceBeforeMinorUnits: number;
  readonly balanceAfterMinorUnits: number;
  readonly lines: readonly [
    Readonly<PlayCoinLedgerLine>,
    Readonly<PlayCoinLedgerLine>,
  ];
  readonly previousTransactionHash: string;
  readonly transactionHash: string;
}

export interface PlayCoinLedger {
  readonly ledgerType: "PLAY_COIN";
  readonly transactions: readonly Readonly<PlayCoinTransaction>[];
}

export type EntertainmentSpendPurpose =
  | "COSMETIC"
  | "PRACTICE_PLAY"
  | "SOCIAL_PLAY";

export interface LedgerIsolationDenial {
  readonly allowed: false;
  readonly code:
    | "CROSS_LEDGER_TRANSFER_FORBIDDEN"
    | "PLAY_COIN_USER_TRANSFER_FORBIDDEN";
  readonly sourceLedger: LedgerType;
  readonly destinationLedger: LedgerType;
  readonly message: string;
}

const TRANSACTION_GENESIS = sha256Hex(
  "MONETAIRE_PLAY_COIN_TRANSACTION_GENESIS_V1",
);
const ISSUANCE_ACCOUNT = "PLAY_COIN:SYSTEM:ISSUANCE";
const SINK_ACCOUNT = "PLAY_COIN:SYSTEM:ENTERTAINMENT_SINK";
const ADMIN_ACCOUNT = "PLAY_COIN:SYSTEM:ADMIN_ADJUSTMENT";

function userAccount(userId: string): string {
  return `PLAY_COIN:USER:${requireNonEmpty(userId, "userId")}`;
}

export function createPlayCoinLedger(): Readonly<PlayCoinLedger> {
  return deepFreeze({ ledgerType: "PLAY_COIN", transactions: [] });
}

export function getPlayCoinBalance(
  ledger: Readonly<PlayCoinLedger>,
  userId: string,
): number {
  const accountId = userAccount(userId);
  return ledger.transactions.reduce((balance, transaction) => {
    return transaction.lines.reduce((lineBalance, line) => {
      if (line.accountId !== accountId) {
        return lineBalance;
      }
      return (
        lineBalance +
        (line.side === "CREDIT"
          ? line.amountMinorUnits
          : -line.amountMinorUnits)
      );
    }, balance);
  }, 0);
}

function postPlayCoinTransaction(
  ledger: Readonly<PlayCoinLedger>,
  input: {
    readonly transactionId: string;
    readonly kind: PlayCoinTransactionKind;
    readonly userId: string;
    readonly amountMinorUnits: number;
    readonly serverRecordedAtMs: number;
    readonly reason: string;
    readonly entertainmentPurpose?: EntertainmentSpendPurpose;
    readonly auditReference?: string;
    readonly sourceReference?: string;
    readonly debitAccountId: string;
    readonly creditAccountId: string;
  },
): {
  readonly ledger: Readonly<PlayCoinLedger>;
  readonly transaction: Readonly<PlayCoinTransaction>;
} {
  const transactionId = requireNonEmpty(
    input.transactionId,
    "transactionId",
  );
  if (
    ledger.transactions.some(
      (transaction) => transaction.transactionId === transactionId,
    )
  ) {
    throw new DomainError(
      "DUPLICATE_LEDGER_TRANSACTION",
      "Transaction id has already been posted",
    );
  }
  const userId = requireNonEmpty(input.userId, "userId");
  const amountMinorUnits = requirePositiveInteger(
    input.amountMinorUnits,
    "amountMinorUnits",
  );
  requireNonNegativeInteger(
    input.serverRecordedAtMs,
    "serverRecordedAtMs",
  );
  const priorTransaction =
    ledger.transactions[ledger.transactions.length - 1];
  if (
    priorTransaction !== undefined &&
    input.serverRecordedAtMs < priorTransaction.serverRecordedAtMs
  ) {
    throw new DomainError(
      "NON_MONOTONIC_LEDGER_TIME",
      "Ledger time cannot precede the prior transaction",
    );
  }
  const reason = requireNonEmpty(input.reason, "reason");
  const entertainmentPurpose = input.entertainmentPurpose ?? null;
  const auditReference =
    input.auditReference === undefined
      ? null
      : requireNonEmpty(input.auditReference, "auditReference");
  const sourceReference =
    input.sourceReference === undefined
      ? null
      : requireNonEmpty(input.sourceReference, "sourceReference");
  const balanceBeforeMinorUnits = getPlayCoinBalance(ledger, userId);
  const userIsCredited = input.creditAccountId === userAccount(userId);
  const balanceAfterMinorUnits =
    balanceBeforeMinorUnits +
    (userIsCredited ? amountMinorUnits : -amountMinorUnits);
  if (balanceAfterMinorUnits < 0) {
    throw new DomainError(
      "INSUFFICIENT_PLAY_COINS",
      "Play Coin balance cannot become negative",
    );
  }

  const lines = deepFreeze([
    {
      ledgerType: "PLAY_COIN" as const,
      accountId: input.debitAccountId,
      side: "DEBIT" as const,
      amountMinorUnits,
    },
    {
      ledgerType: "PLAY_COIN" as const,
      accountId: input.creditAccountId,
      side: "CREDIT" as const,
      amountMinorUnits,
    },
  ] as const);
  const previousTransactionHash =
    priorTransaction?.transactionHash ??
    TRANSACTION_GENESIS;
  const payload = {
    protocol: "MONETAIRE_PLAY_COIN_TRANSACTION_V1",
    transactionId,
    ledgerType: "PLAY_COIN",
    kind: input.kind,
    userId,
    amountMinorUnits,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason,
    entertainmentPurpose,
    auditReference,
    sourceReference,
    balanceBeforeMinorUnits,
    balanceAfterMinorUnits,
    lines,
    previousTransactionHash,
  };
  const transaction = deepFreeze({
    transactionId,
    ledgerType: "PLAY_COIN" as const,
    kind: input.kind,
    userId,
    amountMinorUnits,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason,
    entertainmentPurpose,
    auditReference,
    sourceReference,
    balanceBeforeMinorUnits,
    balanceAfterMinorUnits,
    lines,
    previousTransactionHash,
    transactionHash: sha256Hex(canonicalJson(payload)),
  });
  const nextLedger = deepFreeze({
    ledgerType: "PLAY_COIN" as const,
    transactions: [...ledger.transactions, transaction],
  });

  return deepFreeze({ ledger: nextLedger, transaction });
}

export function creditEarnedPlayCoins(
  ledger: Readonly<PlayCoinLedger>,
  input: {
    readonly transactionId: string;
    readonly userId: string;
    readonly amountMinorUnits: number;
    readonly serverRecordedAtMs: number;
    readonly reason: string;
    readonly kind?: "EARNED" | "PROMOTIONAL";
  },
): ReturnType<typeof postPlayCoinTransaction> {
  return postPlayCoinTransaction(ledger, {
    ...input,
    kind: input.kind ?? "EARNED",
    debitAccountId: ISSUANCE_ACCOUNT,
    creditAccountId: userAccount(input.userId),
  });
}

export function creditSandboxPackagePlayCoins(
  ledger: Readonly<PlayCoinLedger>,
  input: {
    readonly transactionId: string;
    readonly userId: string;
    readonly amountMinorUnits: number;
    readonly serverRecordedAtMs: number;
    readonly sandboxReceiptReference: string;
    readonly reason?: string;
  },
): ReturnType<typeof postPlayCoinTransaction> {
  const reference = requireNonEmpty(
    input.sandboxReceiptReference,
    "sandboxReceiptReference",
  );
  return postPlayCoinTransaction(ledger, {
    transactionId: input.transactionId,
    userId: input.userId,
    amountMinorUnits: input.amountMinorUnits,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason:
      input.reason ??
      `Sandbox package ${reference}`,
    sourceReference: reference,
    kind: "SANDBOX_PACKAGE",
    debitAccountId: ISSUANCE_ACCOUNT,
    creditAccountId: userAccount(input.userId),
  });
}

export function spendPlayCoinsForEntertainment(
  ledger: Readonly<PlayCoinLedger>,
  input: {
    readonly transactionId: string;
    readonly userId: string;
    readonly amountMinorUnits: number;
    readonly serverRecordedAtMs: number;
    readonly purpose: EntertainmentSpendPurpose;
    readonly reason: string;
  },
): ReturnType<typeof postPlayCoinTransaction> {
  if (
    input.purpose !== "COSMETIC" &&
    input.purpose !== "PRACTICE_PLAY" &&
    input.purpose !== "SOCIAL_PLAY"
  ) {
    throw new DomainError(
      "PLAY_COIN_PURPOSE_FORBIDDEN",
      "Play Coins can only be spent for approved entertainment purposes",
    );
  }
  return postPlayCoinTransaction(ledger, {
    transactionId: input.transactionId,
    userId: input.userId,
    amountMinorUnits: input.amountMinorUnits,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason: input.reason,
    entertainmentPurpose: input.purpose,
    kind: "ENTERTAINMENT_SPEND",
    debitAccountId: userAccount(input.userId),
    creditAccountId: SINK_ACCOUNT,
  });
}

export function adjustPlayCoinBalanceAsAdmin(input: {
  readonly ledger: Readonly<PlayCoinLedger>;
  readonly auditLog: Readonly<AdminAuditLog>;
  readonly transactionId: string;
  readonly auditId: string;
  readonly userId: string;
  readonly deltaMinorUnits: number;
  readonly actor: Readonly<AdminActor>;
  readonly serverRecordedAtMs: number;
  readonly reason: string;
}): {
  readonly ledger: Readonly<PlayCoinLedger>;
  readonly auditLog: Readonly<AdminAuditLog>;
  readonly transaction: Readonly<PlayCoinTransaction>;
} {
  if (
    !Number.isSafeInteger(input.deltaMinorUnits) ||
    input.deltaMinorUnits === 0
  ) {
    throw new DomainError(
      "INVALID_ADMIN_ADJUSTMENT",
      "Admin delta must be a non-zero safe integer",
    );
  }

  const balanceBeforeMinorUnits = getPlayCoinBalance(
    input.ledger,
    input.userId,
  );
  const amountMinorUnits = Math.abs(input.deltaMinorUnits);
  const posting = postPlayCoinTransaction(input.ledger, {
    transactionId: input.transactionId,
    kind: "ADMIN_ADJUSTMENT",
    userId: input.userId,
    amountMinorUnits,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason: input.reason,
    auditReference: input.auditId,
    debitAccountId:
      input.deltaMinorUnits > 0
        ? ADMIN_ACCOUNT
        : userAccount(input.userId),
    creditAccountId:
      input.deltaMinorUnits > 0
        ? userAccount(input.userId)
        : ADMIN_ACCOUNT,
  });
  const balanceAfterMinorUnits = getPlayCoinBalance(
    posting.ledger,
    input.userId,
  );
  const audit = appendAdminAuditEvent(input.auditLog, {
    auditId: input.auditId,
    actionType: "PLAY_COIN_BALANCE_ADJUSTMENT",
    actor: input.actor,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason: input.reason,
    subjectType: "PLAY_COIN_BALANCE",
    subjectId: input.userId,
    beforeState: { balanceMinorUnits: balanceBeforeMinorUnits },
    afterState: { balanceMinorUnits: balanceAfterMinorUnits },
  });

  return deepFreeze({
    ledger: posting.ledger,
    auditLog: audit.log,
    transaction: posting.transaction,
  });
}

/**
 * Boundary guard only: the domain intentionally exposes no transfer or
 * conversion operation. Every requested cross-ledger or user-to-user movement
 * is a hard denial.
 */
export function rejectProhibitedLedgerTransfer(input: {
  readonly sourceLedger: LedgerType;
  readonly destinationLedger: LedgerType;
}): Readonly<LedgerIsolationDenial> {
  const crossLedger = input.sourceLedger !== input.destinationLedger;
  return deepFreeze({
    allowed: false,
    code: crossLedger
      ? "CROSS_LEDGER_TRANSFER_FORBIDDEN"
      : "PLAY_COIN_USER_TRANSFER_FORBIDDEN",
    sourceLedger: input.sourceLedger,
    destinationLedger: input.destinationLedger,
    message: crossLedger
      ? "Funds and credits cannot cross ledger types"
      : "This ledger does not permit user-to-user transfers",
  });
}

export function assertPlayCoinLedgerIntegrity(
  ledger: Readonly<PlayCoinLedger>,
): boolean {
  if (ledger.ledgerType !== "PLAY_COIN") {
    return false;
  }

  let previousTransactionHash = TRANSACTION_GENESIS;
  const transactionIds = new Set<string>();
  const userBalances = new Map<string, number>();

  for (const transaction of ledger.transactions) {
    const debits = transaction.lines
      .filter((line) => line.side === "DEBIT")
      .reduce((total, line) => total + line.amountMinorUnits, 0);
    const credits = transaction.lines
      .filter((line) => line.side === "CREDIT")
      .reduce((total, line) => total + line.amountMinorUnits, 0);
    const expectedBalanceBefore =
      userBalances.get(transaction.userId) ?? 0;
    const transactionUserAccount = userAccount(transaction.userId);
    const userDelta = transaction.lines.reduce((total, line) => {
      if (line.accountId !== transactionUserAccount) {
        return total;
      }
      return (
        total +
        (line.side === "CREDIT"
          ? line.amountMinorUnits
          : -line.amountMinorUnits)
      );
    }, 0);
    const expectedBalanceAfter = expectedBalanceBefore + userDelta;
    if (
      transactionIds.has(transaction.transactionId) ||
      transaction.ledgerType !== "PLAY_COIN" ||
      transaction.lines.length !== 2 ||
      transaction.lines.some((line) => line.ledgerType !== "PLAY_COIN") ||
      transaction.lines.some(
        (line) => !line.accountId.startsWith("PLAY_COIN:"),
      ) ||
      !Number.isSafeInteger(transaction.amountMinorUnits) ||
      transaction.amountMinorUnits <= 0 ||
      transaction.lines.some(
        (line) =>
          line.amountMinorUnits !== transaction.amountMinorUnits,
      ) ||
      Math.abs(userDelta) !== transaction.amountMinorUnits ||
      (transaction.kind === "ENTERTAINMENT_SPEND"
        ? transaction.entertainmentPurpose === null || userDelta >= 0
        : transaction.entertainmentPurpose !== null) ||
      (transaction.kind === "ADMIN_ADJUSTMENT"
        ? transaction.auditReference === null
        : transaction.auditReference !== null) ||
      (transaction.kind === "SANDBOX_PACKAGE"
        ? transaction.sourceReference === null
        : transaction.sourceReference !== null) ||
      ((transaction.kind === "EARNED" ||
        transaction.kind === "PROMOTIONAL" ||
        transaction.kind === "SANDBOX_PACKAGE") &&
        userDelta <= 0) ||
      debits !== credits ||
      transaction.balanceBeforeMinorUnits !== expectedBalanceBefore ||
      transaction.balanceAfterMinorUnits !== expectedBalanceAfter ||
      expectedBalanceAfter < 0 ||
      transaction.previousTransactionHash !== previousTransactionHash
    ) {
      return false;
    }
    transactionIds.add(transaction.transactionId);

    const expectedHash = sha256Hex(
      canonicalJson({
        protocol: "MONETAIRE_PLAY_COIN_TRANSACTION_V1",
        transactionId: transaction.transactionId,
        ledgerType: transaction.ledgerType,
        kind: transaction.kind,
        userId: transaction.userId,
        amountMinorUnits: transaction.amountMinorUnits,
        serverRecordedAtMs: transaction.serverRecordedAtMs,
        reason: transaction.reason,
        entertainmentPurpose: transaction.entertainmentPurpose,
        auditReference: transaction.auditReference,
        sourceReference: transaction.sourceReference,
        balanceBeforeMinorUnits: transaction.balanceBeforeMinorUnits,
        balanceAfterMinorUnits: transaction.balanceAfterMinorUnits,
        lines: transaction.lines,
        previousTransactionHash: transaction.previousTransactionHash,
      }),
    );
    if (transaction.transactionHash !== expectedHash) {
      return false;
    }
    userBalances.set(transaction.userId, expectedBalanceAfter);
    previousTransactionHash = transaction.transactionHash;
  }

  return true;
}

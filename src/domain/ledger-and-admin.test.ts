import { describe, expect, it } from "vitest";

import {
  createAdminAuditLog,
  verifyAdminAuditLog,
} from "./admin-audit";
import {
  adjustPlayCoinBalanceAsAdmin,
  assertPlayCoinLedgerIntegrity,
  createPlayCoinLedger,
  creditEarnedPlayCoins,
  getPlayCoinBalance,
  rejectProhibitedLedgerTransfer,
  RESERVED_LEDGER_CONTRACTS,
  spendPlayCoinsForEntertainment,
} from "./ledger";
import {
  adjustOfficialScoreAsAdmin,
  createAuditedOfficialScore,
} from "./score-adjustments";

describe("isolated append-only Play Coin ledger", () => {
  it("posts integer, double-entry, hash-chained credits and spends", () => {
    const initial = createPlayCoinLedger();
    const credited = creditEarnedPlayCoins(initial, {
      transactionId: "tx-earned",
      userId: "user-1",
      amountMinorUnits: 100,
      serverRecordedAtMs: 1_000,
      reason: "Completed noncash achievement",
    });
    const spent = spendPlayCoinsForEntertainment(credited.ledger, {
      transactionId: "tx-spend",
      userId: "user-1",
      amountMinorUnits: 30,
      serverRecordedAtMs: 2_000,
      purpose: "COSMETIC",
      reason: "Card-back cosmetic",
    });

    expect(getPlayCoinBalance(initial, "user-1")).toBe(0);
    expect(getPlayCoinBalance(credited.ledger, "user-1")).toBe(100);
    expect(getPlayCoinBalance(spent.ledger, "user-1")).toBe(70);
    expect(spent.ledger.transactions).toHaveLength(2);
    expect(spent.transaction.lines.map((line) => line.side)).toEqual([
      "DEBIT",
      "CREDIT",
    ]);
    expect(spent.transaction.lines[0].amountMinorUnits).toBe(
      spent.transaction.lines[1].amountMinorUnits,
    );
    expect(assertPlayCoinLedgerIntegrity(spent.ledger)).toBe(true);
    expect(Object.isFrozen(spent.ledger.transactions)).toBe(true);
  });

  it("rejects fractional units, overdrafts, and duplicate postings", () => {
    const ledger = createPlayCoinLedger();
    expect(() =>
      creditEarnedPlayCoins(ledger, {
        transactionId: "fraction",
        userId: "user",
        amountMinorUnits: 1.5,
        serverRecordedAtMs: 1,
        reason: "Invalid fractional value",
      }),
    ).toThrowError(/positive safe integer/i);
    expect(() =>
      spendPlayCoinsForEntertainment(ledger, {
        transactionId: "overdraft",
        userId: "user",
        amountMinorUnits: 1,
        serverRecordedAtMs: 1,
        purpose: "PRACTICE_PLAY",
        reason: "No balance",
      }),
    ).toThrowError(/cannot become negative/i);
    expect(() =>
      spendPlayCoinsForEntertainment(ledger, {
        transactionId: "forbidden-purpose",
        userId: "user",
        amountMinorUnits: 1,
        serverRecordedAtMs: 1,
        purpose: "PRIZE_ENTRY" as never,
        reason: "Forbidden cross-product purpose",
      }),
    ).toThrowError(/approved entertainment purposes/i);

    const once = creditEarnedPlayCoins(ledger, {
      transactionId: "duplicate",
      userId: "user",
      amountMinorUnits: 1,
      serverRecordedAtMs: 1,
      reason: "First posting",
    });
    expect(() =>
      creditEarnedPlayCoins(once.ledger, {
        transactionId: "duplicate",
        userId: "user",
        amountMinorUnits: 1,
        serverRecordedAtMs: 2,
        reason: "Second posting",
      }),
    ).toThrowError(/already been posted/i);
  });

  it("hard-denies every cross-ledger direction and keeps cash ledgers inert", () => {
    const directions = [
      ["PLAY_COIN", "SKILL_PRIZE_USD"],
      ["SKILL_PRIZE_USD", "PLAY_COIN"],
      ["PLAY_COIN", "CASINO_CASH_USD"],
      ["CASINO_CASH_USD", "PLAY_COIN"],
      ["SKILL_PRIZE_USD", "CASINO_CASH_USD"],
      ["CASINO_CASH_USD", "SKILL_PRIZE_USD"],
    ] as const;

    for (const [sourceLedger, destinationLedger] of directions) {
      expect(
        rejectProhibitedLedgerTransfer({
          sourceLedger,
          destinationLedger,
        }),
      ).toMatchObject({
        allowed: false,
        code: "CROSS_LEDGER_TRANSFER_FORBIDDEN",
      });
    }
    expect(RESERVED_LEDGER_CONTRACTS.SKILL_PRIZE_USD.operational).toBe(
      false,
    );
    expect(RESERVED_LEDGER_CONTRACTS.CASINO_CASH_USD.operational).toBe(
      false,
    );
  });
});

describe("auditable administrator corrections", () => {
  it("records complete before/after balance state in both ledgers", () => {
    const initialLedger = creditEarnedPlayCoins(createPlayCoinLedger(), {
      transactionId: "initial",
      userId: "user-1",
      amountMinorUnits: 100,
      serverRecordedAtMs: 1,
      reason: "Initial earned balance",
    }).ledger;
    const result = adjustPlayCoinBalanceAsAdmin({
      ledger: initialLedger,
      auditLog: createAdminAuditLog(),
      transactionId: "admin-tx",
      auditId: "admin-audit",
      userId: "user-1",
      deltaMinorUnits: -25,
      actor: { actorId: "admin-1", role: "SUPER_ADMIN" },
      serverRecordedAtMs: 2,
      reason: "Correct duplicated achievement credit",
    });

    expect(getPlayCoinBalance(result.ledger, "user-1")).toBe(75);
    expect(result.transaction.kind).toBe("ADMIN_ADJUSTMENT");
    expect(result.transaction.auditReference).toBe("admin-audit");
    expect(result.auditLog.events[0]).toMatchObject({
      actorId: "admin-1",
      actorRole: "SUPER_ADMIN",
      reason: "Correct duplicated achievement credit",
      beforeState: { balanceMinorUnits: 100 },
      afterState: { balanceMinorUnits: 75 },
    });
    expect(verifyAdminAuditLog(result.auditLog)).toBe(true);
  });

  it("forbids support balance edits and appends score corrections", () => {
    expect(() =>
      adjustPlayCoinBalanceAsAdmin({
        ledger: createPlayCoinLedger(),
        auditLog: createAdminAuditLog(),
        transactionId: "forbidden-tx",
        auditId: "forbidden-audit",
        userId: "user",
        deltaMinorUnits: 10,
        actor: { actorId: "support", role: "SUPPORT" },
        serverRecordedAtMs: 1,
        reason: "Support should not have balance authority",
      }),
    ).toThrowError(/cannot perform/i);

    const score = createAuditedOfficialScore({
      scoreId: "score-1",
      entryId: "entry-1",
      gameId: "game-1",
      scoreVersion:
        "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
      completed: true,
      validMoves: 100,
      verifiedActivePlayMs: 10_000,
      gameStatus: "WON",
      finalizedAtServerMs: 20_000,
    });
    const correction = adjustOfficialScoreAsAdmin({
      score,
      auditLog: createAdminAuditLog(),
      adjustmentId: "adjustment-1",
      auditId: "score-audit-1",
      actor: {
        actorId: "compliance-1",
        role: "COMPLIANCE_ADMIN",
      },
      serverRecordedAtMs: 30_000,
      reason: "Accepted appeal corrected duplicated move event",
      corrected: {
        completed: true,
        validMoves: 99,
        verifiedActivePlayMs: 10_000,
        gameStatus: "WON",
      },
    });

    expect(correction.score.original.validMoves).toBe(100);
    expect(correction.effectiveScore.validMoves).toBe(99);
    expect(correction.score.adjustments).toHaveLength(1);
    expect(correction.auditLog.events[0]).toMatchObject({
      beforeState: { validMoves: 100 },
      afterState: { validMoves: 99 },
    });
    expect(verifyAdminAuditLog(correction.auditLog)).toBe(true);
  });
});

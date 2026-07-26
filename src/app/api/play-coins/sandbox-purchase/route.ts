import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  assertPlayCoinLedgerIntegrity,
  canonicalJson,
  creditSandboxPackagePlayCoins,
  sha256Hex,
} from "@/domain";
import { appendDemoAuditEvent } from "@/lib/audit";
import { currentDemoUser } from "@/lib/auth";
import {
  getDemoStore,
  playCoinBalance,
  playCoinEntryForTransaction,
} from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { createId } from "@/lib/ids";
import { evaluateInitialOperationGate } from "@/lib/operation-gates";
import { evaluateDemoPlayerAccess } from "@/lib/player-access";

const packages = {
  PRACTICE_1000: 1_000,
  PRACTICE_2500: 2_500,
  PRACTICE_6000: 6_000,
} as const;

const purchaseSchema = z.object({
  packageKey: z.enum(["PRACTICE_1000", "PRACTICE_2500", "PRACTICE_6000"]),
  idempotencyKey: z.string().trim().min(12).max(128),
  acknowledgeSandboxOnly: z.literal(true),
}).strict();

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "sandbox-purchase", 12, 60_000);
  if (rateError) return rateError;

  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const env = getRuntimeEnv();
  const sandboxGate = evaluateInitialOperationGate(
    "play_coin.package.sandbox",
    env,
  );
  if (sandboxGate.decision !== "ALLOW" || env.FEATURE_PRODUCTION_PAYMENTS) {
    return jsonError(
      503,
      "SANDBOX_ONLY",
      "This adapter only operates in safe demo mode and cannot charge a real card.",
      id,
    );
  }
  const access = evaluateDemoPlayerAccess({
    user,
    mode: "MONETAIRE_PLAY",
    exclusions: getDemoStore().selfExclusions,
    serverAtMs: Date.now(),
  });
  if (!access.allowed) {
    return jsonError(
      403,
      access.reasonCodes.includes("SELF_EXCLUDED")
        ? "SELF_EXCLUDED"
        : "ACCOUNT_RESTRICTED",
      "Play Coin packages are blocked by the active account restriction.",
      id,
    );
  }

  const parsed = purchaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_SANDBOX_PURCHASE", "Check the sandbox request.", id);
  }

  const store = getDemoStore();
  const scopedKey = `${user.id}:${parsed.data.idempotencyKey}`;
  const requestHash = sha256Hex(
    canonicalJson({
      protocol: "PLAY_COIN_SANDBOX_REQUEST_V1",
      userId: user.id,
      endpoint: "/api/play-coins/sandbox-purchase",
      packageKey: parsed.data.packageKey,
      idempotencyKey: parsed.data.idempotencyKey,
      acknowledgeSandboxOnly: parsed.data.acknowledgeSandboxOnly,
    }),
  );
  const existingRecord = store.sandboxIdempotencyRecords.get(scopedKey);
  if (existingRecord) {
    if (existingRecord.requestHash !== requestHash) {
      return jsonError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "That idempotency key belongs to a different sandbox request.",
        id,
      );
    }
    const existing = playCoinEntryForTransaction(
      user.id,
      existingRecord.transactionId,
    );
    if (!existing) {
      return jsonError(
        500,
        "LEDGER_HISTORY_INCOMPLETE",
        "The original sandbox ledger transaction is unavailable.",
        id,
      );
    }
    return NextResponse.json({ entry: existing, duplicate: true });
  }

  const amountMinor = packages[parsed.data.packageKey];
  const transactionId = createId("txn");
  const balanceBeforeMinor = playCoinBalance(user.id);
  const posting = creditSandboxPackagePlayCoins(store.playCoinLedger, {
    transactionId,
    userId: user.id,
    amountMinorUnits: amountMinor,
    serverRecordedAtMs: Date.now(),
    sandboxReceiptReference: requestHash,
    reason: "Local sandbox simulation; no card was charged.",
  });
  if (!assertPlayCoinLedgerIntegrity(posting.ledger)) {
    return jsonError(
      500,
      "LEDGER_INTEGRITY_FAILURE",
      "The sandbox ledger transaction was not recorded.",
      id,
    );
  }
  store.playCoinLedger = posting.ledger;
  store.sandboxIdempotencyRecords.set(scopedKey, {
    scopedKey,
    idempotencyKey: parsed.data.idempotencyKey,
    requestHash,
    transactionId,
  });
  const entry = playCoinEntryForTransaction(user.id, transactionId);
  if (!entry) {
    return jsonError(
      500,
      "LEDGER_HISTORY_INCOMPLETE",
      "The sandbox ledger transaction was not projected.",
      id,
    );
  }

  appendDemoAuditEvent({
    eventType: "SANDBOX_PLAY_COIN_CREDIT",
    actorId: user.id,
    subjectType: "PLAY_COIN_LEDGER_ACCOUNT",
    subjectId: user.id,
    reason: entry.reason,
    beforeState: { balanceMinor: balanceBeforeMinor },
    afterState: {
      balanceMinor: entry.balanceAfterMinor,
      chargedRealMoney: false,
      transactionHash: entry.transactionHash,
      requestHash,
    },
  });

  return NextResponse.json(
    {
      entry,
      duplicate: false,
      warning:
        "Sandbox simulation only. Play Coins have no cash value and cannot be redeemed, transferred, sold, or withdrawn.",
    },
    { status: 201 },
  );
}

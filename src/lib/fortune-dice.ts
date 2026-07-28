import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  fortuneDiceRounds,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  ledgers,
} from "@/db/schema";
import { getRuntimeEnv } from "@/lib/env";

export type FortuneChoice = "under" | "seven" | "over";
const WELCOME_BALANCE = BigInt(10_000);

function key() {
  return createHash("sha256")
    .update(getRuntimeEnv().SESSION_SECRET ?? "")
    .update("FORTUNE_DICE_SEED_V1")
    .digest();
}

function encrypt(seed: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(seed, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

function decrypt(value: string) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("INVALID_SEED_CIPHERTEXT");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function fortuneDiceResult(serverSeed: string, clientSeed: string, nonce: bigint) {
  const digest = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce.toString()}`)
    .digest();
  return [Number(digest.readUInt32BE(0) % 6) + 1, Number(digest.readUInt32BE(4) % 6) + 1] as const;
}

function won(choice: FortuneChoice, total: number) {
  return choice === "under" ? total < 7 : choice === "over" ? total > 7 : total === 7;
}

function multiplier(choice: FortuneChoice) {
  return choice === "seven" ? BigInt(4) : BigInt(2);
}

async function accounts(transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0], userId: string) {
  await transaction
    .insert(ledgers)
    .values({ ledgerType: "PLAY_COIN", status: "ACTIVE" })
    .onConflictDoNothing();
  const [ledger] = await transaction
    .select({ id: ledgers.id })
    .from(ledgers)
    .where(eq(ledgers.ledgerType, "PLAY_COIN"))
    .limit(1);
  if (!ledger) throw new Error("PLAY_COIN_LEDGER_MISSING");
  await transaction
    .insert(ledgerAccounts)
    .values([
      { ledgerId: ledger.id, currency: "PLAY_COIN", accountCode: "PLAY_COIN:SYSTEM:HOUSE" },
      { ledgerId: ledger.id, currency: "PLAY_COIN", accountCode: `PLAY_COIN:USER:${userId}`, userId },
    ])
    .onConflictDoNothing();
  const rows = await transaction
    .select({ id: ledgerAccounts.id, code: ledgerAccounts.accountCode })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.ledgerId, ledger.id));
  const house = rows.find((row) => row.code === "PLAY_COIN:SYSTEM:HOUSE");
  const player = rows.find((row) => row.code === `PLAY_COIN:USER:${userId}`);
  if (!house || !player) throw new Error("PLAY_COIN_ACCOUNTS_MISSING");
  return { ledgerId: ledger.id, houseId: house.id, playerId: player.id };
}

async function balance(transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0], accountId: string) {
  const [row] = await transaction
    .select({
      value: sql<bigint>`coalesce(sum(case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountMinor} else -${ledgerEntries.amountMinor} end), 0)::bigint`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));
  return BigInt(row?.value ?? 0);
}

async function post(
  transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  input: { ledgerId: string; debit: string; credit: string; amount: bigint; key: string; referenceId: string; reason: string; actorId: string },
) {
  const [record] = await transaction
    .insert(ledgerTransactions)
    .values({
      ledgerId: input.ledgerId,
      ledgerType: "PLAY_COIN",
      idempotencyKey: input.key,
      referenceType: "FORTUNE_DICE_ROUND",
      referenceId: input.referenceId,
      reason: input.reason,
      actorId: input.actorId,
    })
    .returning({ id: ledgerTransactions.id });
  await transaction.insert(ledgerEntries).values([
    { transactionId: record.id, accountId: input.debit, ledgerId: input.ledgerId, direction: "DEBIT", amountMinor: input.amount, currency: "PLAY_COIN" },
    { transactionId: record.id, accountId: input.credit, ledgerId: input.ledgerId, direction: "CREDIT", amountMinor: input.amount, currency: "PLAY_COIN" },
  ]);
  return record.id;
}

async function ensureWelcome(transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0], userId: string) {
  const account = await accounts(transaction, userId);
  const [history] = await transaction
    .select({ count: sql<number>`count(*)::int` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, account.playerId));
  if ((history?.count ?? 0) === 0) {
    await post(transaction, {
      ledgerId: account.ledgerId,
      debit: account.houseId,
      credit: account.playerId,
      amount: WELCOME_BALANCE,
      key: `welcome:${userId}`,
      referenceId: userId,
      reason: "Free welcome Play Coins — no cash value",
      actorId: "SYSTEM",
    });
  }
  return { ...account, balance: await balance(transaction, account.playerId) };
}

export async function commitFortuneDiceRound(userId: string) {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const account = await ensureWelcome(transaction, userId);
    const [last] = await transaction
      .select({ nonce: fortuneDiceRounds.nonce })
      .from(fortuneDiceRounds)
      .where(eq(fortuneDiceRounds.userId, userId))
      .orderBy(sql`${fortuneDiceRounds.nonce} desc`)
      .limit(1);
    const nonce = (last?.nonce ?? BigInt(-1)) + BigInt(1);
    const serverSeed = randomBytes(32).toString("hex");
    const commitment = createHash("sha256").update(serverSeed).digest("hex");
    const [round] = await transaction
      .insert(fortuneDiceRounds)
      .values({ userId, nonce, serverSeedCiphertext: encrypt(serverSeed), seedCommitment: commitment })
      .returning({ id: fortuneDiceRounds.id });
    return { roundId: round.id, commitment, nonce: Number(nonce), balanceMinor: Number(account.balance) };
  });
}

export async function settleFortuneDiceRound(input: {
  userId: string;
  roundId: string;
  choice: FortuneChoice;
  wagerMinor: number;
  clientSeed: string;
}) {
  if (!Number.isSafeInteger(input.wagerMinor) || input.wagerMinor < 10 || input.wagerMinor > 1_000_000) {
    throw new Error("INVALID_WAGER");
  }
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.clientSeed)) throw new Error("INVALID_CLIENT_SEED");
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
    const [round] = await transaction
      .select()
      .from(fortuneDiceRounds)
      .where(and(eq(fortuneDiceRounds.id, input.roundId), eq(fortuneDiceRounds.userId, input.userId)))
      .limit(1);
    if (!round || round.status !== "COMMITTED") throw new Error("ROUND_NOT_AVAILABLE");
    const account = await ensureWelcome(transaction, input.userId);
    const wager = BigInt(input.wagerMinor);
    if (account.balance < wager) throw new Error("INSUFFICIENT_PLAY_COINS");
    const serverSeed = decrypt(round.serverSeedCiphertext);
    const dice = fortuneDiceResult(serverSeed, input.clientSeed, round.nonce);
    const isWin = won(input.choice, dice[0] + dice[1]);
    const net = isWin
      ? wager * (multiplier(input.choice) - BigInt(1))
      : wager;
    const ledgerTransactionId = await post(transaction, {
      ledgerId: account.ledgerId,
      debit: isWin ? account.houseId : account.playerId,
      credit: isWin ? account.playerId : account.houseId,
      amount: net,
      key: `fortune-dice:${round.id}`,
      referenceId: round.id,
      reason: isWin ? `Fortune Dice win (${input.choice})` : `Fortune Dice wager (${input.choice})`,
      actorId: input.userId,
    });
    await transaction
      .update(fortuneDiceRounds)
      .set({
        status: "SETTLED",
        clientSeed: input.clientSeed,
        choice: input.choice,
        wagerMinor: wager,
        dieOne: dice[0],
        dieTwo: dice[1],
        payoutMinor: isWin ? wager * multiplier(input.choice) : BigInt(0),
        ledgerTransactionId,
        settledAt: new Date(),
      })
      .where(eq(fortuneDiceRounds.id, round.id));
    const finalBalance = await balance(transaction, account.playerId);
    return {
      roundId: round.id,
      dice,
      total: dice[0] + dice[1],
      won: isWin,
      wagerMinor: input.wagerMinor,
      netChangeMinor: Number(isWin ? net : -net),
      balanceMinor: Number(finalBalance),
      proof: { algorithm: "HMAC-SHA256_V1", serverSeed, clientSeed: input.clientSeed, nonce: Number(round.nonce), commitment: round.seedCommitment },
      ledgerTransactionId,
    };
  });
}

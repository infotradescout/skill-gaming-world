import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationFiles = [
  "0000_eager_garia.sql",
  "0001_chemical_screwball.sql",
  "0002_volatile_hammerhead.sql",
  "0003_wealthy_speed.sql",
  "0004_lowly_nightcrawler.sql",
] as const;

const playLedger = "00000000-0000-0000-0000-000000000001";
const cashLedger = "00000000-0000-0000-0000-000000000002";
const debitAccount = "00000000-0000-0000-0000-000000000011";
const creditAccount = "00000000-0000-0000-0000-000000000012";

describe("PostgreSQL database invariants", () => {
  it("applies every migration and enforces active PLAY_COIN ledger accounting", async () => {
    await withDatabase(async (db) => {
      await seedLedgerFoundation(db);

      await expectPgReject(
        db,
        `
          INSERT INTO public."ledger_accounts"
            ("id", "ledger_id", "account_code", "currency")
          VALUES
            ('00000000-0000-0000-0000-000000000019', '${cashLedger}', 'CASH', 'CASINO_CASH_USD')
        `,
        "is not an active PLAY_COIN ledger",
      );

      await expectCommitReject(
        db,
        `
          INSERT INTO public."ledger_transactions"
            ("id", "ledger_id", "ledger_type", "idempotency_key", "reference_type", "reference_id", "reason", "actor_id")
          VALUES
            ('00000000-0000-0000-0000-000000000100', '${playLedger}', 'PLAY_COIN', 'empty', 'TEST', 'empty', 'test', 'test')
        `,
        "must contain balanced entries",
      );

      const transactionId = "00000000-0000-0000-0000-000000000101";
      await insertBalancedTransaction(db, {
        id: transactionId,
        idempotencyKey: "balanced",
        referenceType: "TEST",
        referenceId: "balanced",
        amount: 10,
      });

      await expectPgReject(
        db,
        `
          INSERT INTO public."ledger_entries"
            ("transaction_id", "account_id", "ledger_id", "direction", "amount_minor", "currency")
          VALUES
            ('${transactionId}', '${debitAccount}', '${cashLedger}', 'DEBIT', 1, 'CASINO_CASH_USD')
        `,
        "is not an active PLAY_COIN ledger",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."ledgers"
          SET "status" = 'CLOSED'
          WHERE "id" = '${playLedger}'
        `,
        "operational ledger must remain ACTIVE PLAY_COIN",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."ledger_accounts"
          SET "account_code" = 'CHANGED'
          WHERE "id" = '${debitAccount}'
        `,
        "history is append-only",
      );
    });
  });

  it("binds sandbox receipts to balanced ledger transactions and retains exclusions", async () => {
    await withDatabase(async (db) => {
      await seedLedgerFoundation(db);

      const user = "00000000-0000-0000-0000-000000000201";
      const packageId = "00000000-0000-0000-0000-000000000210";
      const purchaseId = "00000000-0000-0000-0000-000000000220";
      const purchaseTransaction = "00000000-0000-0000-0000-000000000221";

      await db.exec(`
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${user}', 'sandbox@example.test', 'not-a-real-password-hash');
        INSERT INTO public."play_coin_packages"
          ("id", "public_key", "label", "play_coin_minor_units", "sandbox_price_minor_usd")
        VALUES ('${packageId}', 'TEST', 'Test', 100, 0)
      `);
      await insertBalancedTransaction(db, {
        id: purchaseTransaction,
        idempotencyKey: "purchase",
        referenceType: "SANDBOX_PURCHASE",
        referenceId: purchaseId,
        amount: 100,
      });
      await db.exec(`
        INSERT INTO public."sandbox_purchases"
          ("id", "user_id", "play_coin_package_id", "provider_reference", "idempotency_key", "ledger_transaction_id")
        VALUES
          ('${purchaseId}', '${user}', '${packageId}', 'local-test', 'purchase', '${purchaseTransaction}')
      `);

      await expectPgReject(
        db,
        `
          UPDATE public."sandbox_purchases"
          SET "provider_reference" = 'changed'
          WHERE "id" = '${purchaseId}'
        `,
        "history is append-only",
      );

      const excludedUser = "00000000-0000-0000-0000-000000000202";
      const exclusion = "00000000-0000-0000-0000-000000000203";
      await db.exec(`
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${excludedUser}', 'excluded@example.test', 'not-a-real-password-hash');
        INSERT INTO public."self_exclusions"
          ("id", "user_id", "scope", "permanent")
        VALUES
          ('${exclusion}', '${excludedUser}', 'ALL_PRODUCTS', true)
      `);
      await expectPgReject(
        db,
        `
          UPDATE public."self_exclusions"
          SET "reason" = 'changed'
          WHERE "id" = '${exclusion}'
        `,
        "history is append-only",
      );
      await expectPgReject(
        db,
        `DELETE FROM public."users" WHERE "id" = '${excludedUser}'`,
        "self_exclusions_user_id_users_id_fk",
      );
    });
  });

  it("freezes sealed publication contracts and delays deal reveal", async () => {
    await withDatabase(async (db) => {
      const game = "00000000-0000-0000-0000-000000000301";
      const ruleset = "00000000-0000-0000-0000-000000000302";
      const deal = "00000000-0000-0000-0000-000000000303";
      const validation = "00000000-0000-0000-0000-000000000304";
      const competition = "00000000-0000-0000-0000-000000000305";
      const hashA = "a".repeat(64);
      const hashB = "b".repeat(64);

      await db.exec(`
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${game}', 'TEST_GAME', 'Test Game');
        INSERT INTO public."ruleset_versions"
          ("id", "game_definition_id", "version", "rules", "scoring", "immutable_at")
        VALUES
          ('${ruleset}', '${game}', 'v1', '{}', '{}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deals"
          ("id", "ruleset_version_id", "seed_ciphertext", "seed_commitment", "canonical_deal_hash", "immutable_at")
        VALUES
          ('${deal}', '${ruleset}', 'ciphertext', '${hashA}', '${hashB}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deal_validations"
          ("id", "deal_id", "validator_key", "validator_version", "status", "evidence_hash", "evidence", "validated_at")
        VALUES
          ('${validation}', '${deal}', 'test', 'v1', 'VERIFIED_SOLVABLE', '${hashA}', '{}', '2026-01-01T00:00:00Z');
        INSERT INTO public."competitions"
          ("id", "public_name", "status", "deal_id", "ruleset_version_id", "opens_at", "closes_at", "published_at")
        VALUES
          ('${competition}', 'Published', 'PUBLISHED', '${deal}', '${ruleset}', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z', '2026-01-15T00:00:00Z')
      `);

      await expectPgReject(
        db,
        `
          UPDATE public."competitions"
          SET "public_name" = 'Changed'
          WHERE "id" = '${competition}'
        `,
        "published competition contract fields are immutable",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."ruleset_versions"
          SET "rules" = '{"changed":true}'
          WHERE "id" = '${ruleset}'
        `,
        "sealed or published ruleset is immutable",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."deals"
          SET "seed_ciphertext" = 'changed'
          WHERE "id" = '${deal}'
        `,
        "validated, sealed, or published deal is immutable",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."deals"
          SET "revealed_seed" = 'seed', "revealed_at" = '2026-03-01T00:00:00Z'
          WHERE "id" = '${deal}'
        `,
        "deal cannot be revealed before every competition closes",
      );
      await expectPgReject(
        db,
        `DELETE FROM public."deal_validations" WHERE "id" = '${validation}'`,
        "history is append-only",
      );
    });
  });

  it("rejects mutations to gameplay and administrative evidence", async () => {
    await withDatabase(async (db) => {
      const user = "00000000-0000-0000-0000-000000000401";
      const game = "00000000-0000-0000-0000-000000000402";
      const ruleset = "00000000-0000-0000-0000-000000000403";
      const deal = "00000000-0000-0000-0000-000000000404";
      const session = "00000000-0000-0000-0000-000000000405";
      const move = "00000000-0000-0000-0000-000000000406";
      const score = "00000000-0000-0000-0000-000000000407";
      const adminAction = "00000000-0000-0000-0000-000000000408";
      const auditEvent = "00000000-0000-0000-0000-000000000409";
      const hashA = "a".repeat(64);
      const hashB = "b".repeat(64);
      const hashC = "c".repeat(64);

      await db.exec(`
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${user}', 'evidence@example.test', 'not-a-real-password-hash');
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${game}', 'EVIDENCE_GAME', 'Evidence Game');
        INSERT INTO public."ruleset_versions"
          ("id", "game_definition_id", "version", "rules", "scoring")
        VALUES ('${ruleset}', '${game}', 'v1', '{}', '{}');
        INSERT INTO public."deals"
          ("id", "ruleset_version_id", "seed_ciphertext", "seed_commitment", "canonical_deal_hash")
        VALUES ('${deal}', '${ruleset}', 'ciphertext', '${hashA}', '${hashB}');
        INSERT INTO public."game_sessions"
          ("id", "user_id", "deal_id", "ruleset_version_id")
        VALUES ('${session}', '${user}', '${deal}', '${ruleset}');
        INSERT INTO public."move_events"
          ("id", "game_session_id", "sequence", "idempotency_key", "move_type", "move_payload", "state_hash_before", "state_hash_after", "accepted")
        VALUES ('${move}', '${session}', 1, 'move-1', 'DRAW', '{}', '${hashA}', '${hashB}', true);
        INSERT INTO public."scores"
          ("id", "game_session_id", "completed", "valid_move_count", "verified_active_duration_ms", "scoring_version")
        VALUES ('${score}', '${session}', false, 1, 100, 'v1');
        INSERT INTO public."admin_actions"
          ("id", "actor_user_id", "role_used", "action_type", "target_type", "target_id", "reason")
        VALUES ('${adminAction}', '${user}', 'SUPPORT', 'REVIEW', 'SESSION', '${session}', 'test');
        INSERT INTO public."audit_events"
          ("id", "event_type", "actor_type", "actor_id", "subject_type", "subject_id", "request_id", "event_hash")
        VALUES ('${auditEvent}', 'TEST', 'SYSTEM', 'test', 'SESSION', '${session}', 'request-1', '${hashC}')
      `);

      for (const [table, id] of [
        ["move_events", move],
        ["scores", score],
        ["admin_actions", adminAction],
        ["audit_events", auditEvent],
      ] as const) {
        await expectPgReject(
          db,
          `UPDATE public."${table}" SET "created_at" = clock_timestamp() WHERE "id" = '${id}'`,
          "history is append-only",
        );
      }
    });
  });
});

async function withDatabase(
  assertion: (database: PGlite) => Promise<void>,
): Promise<void> {
  const database = new PGlite();
  await database.waitReady;

  try {
    for (const migration of migrationFiles) {
      const sql = readFileSync(
        resolve(process.cwd(), "drizzle", migration),
        "utf8",
      );
      for (const statement of sql
        .split("--> statement-breakpoint")
        .map((value) => value.trim())
        .filter(Boolean)) {
        await database.exec(statement);
      }
    }
    await assertion(database);
  } finally {
    await database.close();
  }
}

async function seedLedgerFoundation(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO public."ledgers" ("id", "ledger_type", "status")
    VALUES
      ('${playLedger}', 'PLAY_COIN', 'ACTIVE'),
      ('${cashLedger}', 'CASINO_CASH_USD', 'RESERVED_DISABLED');
    INSERT INTO public."ledger_accounts"
      ("id", "ledger_id", "account_code", "currency")
    VALUES
      ('${debitAccount}', '${playLedger}', 'SYSTEM', 'PLAY_COIN'),
      ('${creditAccount}', '${playLedger}', 'PLAYER', 'PLAY_COIN')
  `);
}

async function insertBalancedTransaction(
  db: PGlite,
  transaction: Readonly<{
    id: string;
    idempotencyKey: string;
    referenceType: string;
    referenceId: string;
    amount: number;
  }>,
): Promise<void> {
  await db.exec("BEGIN");
  try {
    await db.exec(`
      INSERT INTO public."ledger_transactions"
        ("id", "ledger_id", "ledger_type", "idempotency_key", "reference_type", "reference_id", "reason", "actor_id")
      VALUES
        ('${transaction.id}', '${playLedger}', 'PLAY_COIN', '${transaction.idempotencyKey}', '${transaction.referenceType}', '${transaction.referenceId}', 'test', 'test')
    `);
    await db.exec(`
      INSERT INTO public."ledger_entries"
        ("transaction_id", "account_id", "ledger_id", "direction", "amount_minor", "currency")
      VALUES
        ('${transaction.id}', '${debitAccount}', '${playLedger}', 'DEBIT', ${transaction.amount}, 'PLAY_COIN'),
        ('${transaction.id}', '${creditAccount}', '${playLedger}', 'CREDIT', ${transaction.amount}, 'PLAY_COIN')
    `);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function expectPgReject(
  db: PGlite,
  sql: string,
  expectedMessage: string,
): Promise<void> {
  await expect(db.exec(sql)).rejects.toThrow(expectedMessage);
}

async function expectCommitReject(
  db: PGlite,
  sql: string,
  expectedMessage: string,
): Promise<void> {
  await db.exec("BEGIN");
  try {
    await db.exec(sql);
    await expect(db.exec("COMMIT")).rejects.toThrow(expectedMessage);
  } finally {
    await db.exec("ROLLBACK").catch(() => undefined);
  }
}

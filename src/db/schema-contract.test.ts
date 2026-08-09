import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  competitions,
  dealValidations,
  deals,
  featureGates,
  jurisdictionRules,
  moveEvents,
  playCoinPackages,
  sandboxPurchases,
  scores,
  selfExclusions,
  rulesetSupersessions,
} from "./schema";

describe("database ledger safety migration", () => {
  const ledgerMigration = readFileSync(
    resolve(process.cwd(), "drizzle", "0002_volatile_hammerhead.sql"),
    "utf8",
  );
  const identityMigration = readFileSync(
    resolve(process.cwd(), "drizzle", "0001_chemical_screwball.sql"),
    "utf8",
  );
  const constraintMigration = readFileSync(
    resolve(process.cwd(), "drizzle", "0003_wealthy_speed.sql"),
    "utf8",
  );
  const hardeningMigration = readFileSync(
    resolve(process.cwd(), "drizzle", "0004_lowly_nightcrawler.sql"),
    "utf8",
  );

  it("keeps reserved cash ledgers disabled at the database boundary", () => {
    expect(ledgerMigration).toContain("cash_ledgers_cannot_be_active");
    expect(ledgerMigration).toContain("RESERVED_DISABLED");
    expect(hardeningMigration).toContain(
      "disabled or cash ledger already contains operational records",
    );
    expect(hardeningMigration).toContain(
      'target_type IS DISTINCT FROM \'PLAY_COIN\'',
    );
    expect(hardeningMigration).toContain(
      'target_status IS DISTINCT FROM \'ACTIVE\'',
    );

    for (const trigger of [
      "ledger_accounts_active_play_coin_only",
      "ledger_transactions_active_play_coin_only",
      "ledger_entries_active_play_coin_only",
    ]) {
      expect(hardeningMigration).toContain(`CREATE TRIGGER "${trigger}"`);
    }
  });

  it("creates composite identity indexes before the foreign keys that need them", () => {
    for (const [indexName, foreignKeyName] of [
      ["ledgers_id_type_unique", "ledger_accounts_ledger_type_fk"],
      [
        "ledger_accounts_identity_unique",
        "ledger_entries_account_identity_fk",
      ],
      [
        "ledger_transactions_identity_unique",
        "ledger_entries_transaction_identity_fk",
      ],
    ]) {
      expect(identityMigration.indexOf(indexName)).toBeGreaterThanOrEqual(0);
      expect(identityMigration.indexOf(foreignKeyName)).toBeGreaterThan(
        identityMigration.indexOf(indexName),
      );
    }
  });

  it("requires positive entries and a balanced transaction", () => {
    expect(ledgerMigration).toContain("ledger_entry_amount_positive");
    expect(ledgerMigration).toContain("ledger_transaction_must_balance");
    expect(ledgerMigration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(hardeningMigration).toContain(
      "ledger_transaction_must_be_nonempty_and_balanced",
    );
    expect(hardeningMigration).toContain(
      "ledger transaction % must contain balanced entries",
    );
  });

  it("makes ledger entries and transactions append-only", () => {
    expect(ledgerMigration).toContain("ledger_entries_append_only");
    expect(ledgerMigration).toContain("ledger_transactions_append_only");
    expect(ledgerMigration).toContain("reject_ledger_history_mutation");
  });

  it("prevents an operational ledger from later becoming disabled or cash", () => {
    expect(hardeningMigration).toContain(
      'CREATE TRIGGER "operational_ledgers_stay_active_play_coin"',
    );
    expect(hardeningMigration).toContain(
      "operational ledger must remain ACTIVE PLAY_COIN",
    );
    expect(hardeningMigration).toContain("FOR SHARE OF ledger");
  });

  it("binds sandbox receipts to their own noncash ledger transaction", () => {
    const sandboxConfig = getTableConfig(sandboxPurchases);
    const ledgerTransactionColumn = sandboxConfig.columns.find(
      (column) => column.name === "ledger_transaction_id",
    );

    expect(ledgerTransactionColumn?.notNull).toBe(true);
    expect(checkNames(sandboxPurchases)).toEqual(
      expect.arrayContaining([
        "sandbox_purchases_provider_local_only",
        "sandbox_purchases_status_simulated_only",
        "sandbox_purchases_never_charge_real_money",
      ]),
    );
    expect(constraintMigration).toContain(
      "sandbox_purchases_never_charge_real_money",
    );
    expect(hardeningMigration).toContain(
      "sandbox_purchase_ledger_contract",
    );
    expect(hardeningMigration).toContain(
      "sandbox purchase must reference its own PLAY_COIN SANDBOX_PURCHASE transaction",
    );
  });
});

describe("database release-hold constraints", () => {
  it("keeps held product modes disabled in gate and jurisdiction records", () => {
    expect(checkNames(featureGates)).toContain(
      "initial_release_feature_gate_hold",
    );
    expect(checkNames(jurisdictionRules)).toContain(
      "initial_release_jurisdiction_mode_hold",
    );
  });

  it("validates package amounts and sandbox-only records", () => {
    expect(checkNames(playCoinPackages)).toEqual(
      expect.arrayContaining([
        "play_coin_packages_units_positive",
        "play_coin_packages_sandbox_price_nonnegative",
      ]),
    );
  });

  it("requires coherent competition, deal, move, and score records", () => {
    expect(checkNames(competitions)).toEqual(
      expect.arrayContaining([
        "competitions_window_valid",
        "competitions_initial_release_mode",
        "competitions_publication_before_open",
        "competitions_status_timestamps",
      ]),
    );
    expect(checkNames(deals)).toEqual(
      expect.arrayContaining([
        "deals_commitment_sha256",
        "deals_canonical_hash_sha256",
        "deals_reveal_pair_consistent",
      ]),
    );
    expect(checkNames(dealValidations)).toEqual(
      expect.arrayContaining([
        "deal_validations_terminal_timestamp",
        "deal_validations_verified_evidence",
      ]),
    );
    expect(checkNames(moveEvents)).toEqual(
      expect.arrayContaining([
        "move_events_sequence_positive",
        "move_events_state_hashes_sha256",
        "move_events_rejection_consistent",
      ]),
    );
    expect(checkNames(scores)).toEqual(
      expect.arrayContaining([
        "scores_values_nonnegative",
        "scores_not_self_superseded",
      ]),
    );
  });
});

describe("database immutable-history migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle", "0004_lowly_nightcrawler.sql"),
    "utf8",
  );

  it("retains self-exclusion records and constrains their scope and window", () => {
    const config = getTableConfig(selfExclusions);
    const userForeignKey = config.foreignKeys.find(
      (foreignKey) =>
        foreignKey.getName() === "self_exclusions_user_id_users_id_fk",
    );

    expect(userForeignKey?.onDelete).toBe("restrict");
    expect(checkNames(selfExclusions)).toEqual(
      expect.arrayContaining([
        "self_exclusions_scope_allowed",
        "self_exclusions_window_valid",
        "self_exclusions_removal_policy_locked",
      ]),
    );
    expect(migration).toContain("self_exclusions_append_only");
  });

  it("installs append-only triggers on every required evidence table", () => {
    const expected = new Map([
      ["deal_validations_append_only", "deal_validations"],
      ["move_events_append_only", "move_events"],
      ["scores_append_only", "scores"],
      ["audit_events_append_only", "audit_events"],
      ["admin_actions_append_only", "admin_actions"],
      ["self_exclusions_append_only", "self_exclusions"],
      ["competition_entries_append_only", "competition_entries"],
      ["sandbox_purchases_append_only", "sandbox_purchases"],
      ["ledger_accounts_identity_immutable", "ledger_accounts"],
    ]);

    for (const [trigger, table] of expected) {
      expect(migration).toMatch(
        new RegExp(
          `CREATE TRIGGER "${trigger}"[\\s\\S]*?ON public\\."${table}"`,
        ),
      );
    }
    expect(migration).toContain("reject_immutable_history_mutation");
  });

  it("freezes published contracts and checks all duplicated identities", () => {
    for (const trigger of [
      "competitions_contract_consistency",
      "competition_entries_contract_consistency",
      "game_sessions_contract_consistency",
      "competitions_publication_freeze",
      "ruleset_versions_freeze",
      "deals_freeze",
    ]) {
      expect(migration).toContain(`CREATE TRIGGER "${trigger}"`);
    }

    expect(migration).toContain(
      "published competition requires sealed deal and ruleset",
    );
    expect(migration).toContain(
      "published competition requires verified-solvable evidence",
    );
    expect(migration).toContain(
      "deal cannot be revealed before every competition closes",
    );
    expect(migration).toContain(
      "ranked game session does not match its entry contract",
    );
  });
});

describe("Draw 3 production-truth repair", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle", "0008_draw_three_truth_repair.sql"),
    "utf8",
  );

  it("records an append-only successor and blocks old-runtime republication", () => {
    expect(checkNames(rulesetSupersessions)).toContain(
      "ruleset_supersessions_distinct_versions",
    );
    expect(migration).toContain("KLONDIKE_DRAW_THREE_V1");
    expect(migration).toContain("KLONDIKE_DRAW_THREE_V2");
    expect(migration).toContain('"draw":3');
    expect(migration).toContain(
      "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
    );
    expect(migration).toContain("ruleset_supersessions_append_only");
    expect(migration).toContain("competitions_superseded_ruleset_guard");
    expect(migration).toContain(
      "superseded ruleset cannot publish a new competition",
    );
  });
});

function checkNames(table: PgTable): string[] {
  return getTableConfig(table).checks.map((constraint) => constraint.name);
}

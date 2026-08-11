import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .notNull();

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "COOLDOWN",
  "SELF_EXCLUDED",
  "CLOSED",
  "SUSPENDED",
]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "NOT_STARTED",
  "PENDING",
  "APPROVED",
  "DENIED",
  "EXPIRED",
  "REVOKED",
]);
export const productModeEnum = pgEnum("product_mode", [
  "MONETAIRE_PLAY",
  "MONETAIRE_PRIZE",
  "SOCIAL_CASINO",
  "REAL_MONEY_CASINO",
]);
export const decisionEnum = pgEnum("eligibility_decision", [
  "ALLOW",
  "DENY",
  "REVIEW",
]);
export const ledgerTypeEnum = pgEnum("ledger_type", [
  "PLAY_COIN",
  "SKILL_PRIZE_USD",
  "CASINO_CASH_USD",
]);
export const ledgerDirectionEnum = pgEnum("ledger_direction", [
  "DEBIT",
  "CREDIT",
]);
export const ledgerStatusEnum = pgEnum("ledger_status", [
  "RESERVED_DISABLED",
  "ACTIVE",
  "CLOSED",
]);
export const competitionStatusEnum = pgEnum("competition_status", [
  "DRAFT",
  "PUBLISHED",
  "OPEN",
  "CLOSED",
  "SETTLED",
  "CANCELLED",
]);
export const gameSessionStatusEnum = pgEnum("game_session_status", [
  "ACTIVE",
  "COMPLETED",
  "ABANDONED",
  "BLOCKED",
]);
export const validationStatusEnum = pgEnum("deal_validation_status", [
  "PENDING",
  "VERIFIED_SOLVABLE",
  "REJECTED",
]);
export const adminRoleEnum = pgEnum("admin_role", [
  "SUPPORT",
  "FRAUD_REVIEW",
  "CONTENT_ADMIN",
  "FINANCE_AUDITOR",
  "COMPLIANCE_ADMIN",
  "SUPER_ADMIN",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    status: userStatusEnum("status").default("ACTIVE").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  locale: varchar("locale", { length: 16 }).default("en-US").notNull(),
  declaredResidence: varchar("declared_residence", { length: 16 }),
  createdAt,
  updatedAt,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const deviceRecords = pgTable(
  "device_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fingerprintHash: varchar("fingerprint_hash", { length: 128 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    riskMetadata: jsonb("risk_metadata").$type<Record<string, unknown>>(),
  },
  (table) => [index("device_records_user_idx").on(table.userId)],
);

export const identityVerifications = pgTable(
  "identity_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerReferenceHash: varchar("provider_reference_hash", { length: 128 }),
    status: verificationStatusEnum("status").default("NOT_STARTED").notNull(),
    ageConfirmed: boolean("age_confirmed").default(false).notNull(),
    identityConfirmed: boolean("identity_confirmed").default(false).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index("identity_verifications_user_idx").on(table.userId)],
);

export const skillPrizeEligibilities = pgTable(
  "skill_prize_eligibilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: verificationStatusEnum("status").default("NOT_STARTED").notNull(),
    jurisdictionCode: varchar("jurisdiction_code", { length: 16 }),
    rulesVersion: varchar("rules_version", { length: 64 }),
    reasonCodes: jsonb("reason_codes").$type<string[]>().default([]).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index("skill_prize_eligibility_user_idx").on(table.userId)],
);

export const casinoEligibilities = pgTable(
  "casino_eligibilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: verificationStatusEnum("status").default("NOT_STARTED").notNull(),
    jurisdictionCode: varchar("jurisdiction_code", { length: 16 }),
    amlStatus: verificationStatusEnum("aml_status").default("NOT_STARTED").notNull(),
    selfExclusionClear: boolean("self_exclusion_clear")
      .default(false)
      .notNull(),
    rulesVersion: varchar("rules_version", { length: 64 }),
    reasonCodes: jsonb("reason_codes").$type<string[]>().default([]).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index("casino_eligibility_user_idx").on(table.userId)],
);

export const jurisdictionRules = pgTable(
  "jurisdiction_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jurisdictionCode: varchar("jurisdiction_code", { length: 16 }).notNull(),
    productMode: productModeEnum("product_mode").notNull(),
    version: varchar("version", { length: 64 }).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    minimumAge: integer("minimum_age"),
    requirements: jsonb("requirements")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    approvedBy: varchar("approved_by", { length: 128 }),
    createdAt,
  },
  (table) => [
    uniqueIndex("jurisdiction_rule_version_unique").on(
      table.jurisdictionCode,
      table.productMode,
      table.version,
    ),
    check(
      "initial_release_jurisdiction_mode_hold",
      sql`NOT ${table.enabled} OR ${table.productMode} = 'MONETAIRE_PLAY'`,
    ),
  ],
);

export const jurisdictionDecisions = pgTable(
  "jurisdiction_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    productMode: productModeEnum("product_mode").notNull(),
    decision: decisionEnum("decision").notNull(),
    jurisdictionCode: varchar("jurisdiction_code", { length: 16 }),
    ruleVersion: varchar("rule_version", { length: 64 }).notNull(),
    locationEvidenceStatus: verificationStatusEnum(
      "location_evidence_status",
    ).notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().default([]).notNull(),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("jurisdiction_decisions_request_unique").on(table.requestId),
    index("jurisdiction_decisions_user_idx").on(table.userId),
  ],
);

export const featureGates = pgTable(
  "feature_gates",
  {
    key: varchar("key", { length: 96 }).primaryKey(),
    productMode: productModeEnum("product_mode").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    reason: text("reason").notNull(),
    changedBy: varchar("changed_by", { length: 128 }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("feature_gates_product_idx").on(table.productMode),
    check(
      "initial_release_feature_gate_hold",
      sql`NOT ${table.enabled} OR (
        ${table.productMode} = 'MONETAIRE_PLAY'
        AND ${table.key} IN (
          'mode.monetaire_play',
          'play_coin.earn',
          'play_coin.package.sandbox'
        )
      )`,
    ),
  ],
);

export const selfExclusions = pgTable(
  "self_exclusions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 64 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    permanent: boolean("permanent").default(false).notNull(),
    removalPolicy: varchar("removal_policy", { length: 96 })
      .default("COMPLIANCE_REVIEW_ONLY")
      .notNull(),
    reason: text("reason"),
    createdAt,
  },
  (table) => [
    index("self_exclusions_user_idx").on(table.userId),
    check(
      "self_exclusions_scope_allowed",
      sql`${table.scope} IN ('ALL_PRODUCTS', 'SKILL_GAMING_WORLD', 'CASINO')`,
    ),
    check(
      "self_exclusions_window_valid",
      sql`(
        ${table.permanent}
        AND ${table.endsAt} IS NULL
      ) OR (
        NOT ${table.permanent}
        AND ${table.endsAt} IS NOT NULL
        AND ${table.endsAt} > ${table.startsAt}
      )`,
    ),
    check(
      "self_exclusions_removal_policy_locked",
      sql`${table.removalPolicy} = 'COMPLIANCE_REVIEW_ONLY'`,
    ),
  ],
);

export const responsibleGamingLimits = pgTable(
  "responsible_gaming_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    limitType: varchar("limit_type", { length: 64 }).notNull(),
    integerValue: bigint("integer_value", { mode: "bigint" }),
    intervalMinutes: integer("interval_minutes"),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt,
  },
  (table) => [index("responsible_gaming_limits_user_idx").on(table.userId)],
);

export const gameDefinitions = pgTable("game_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  publicName: varchar("public_name", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
  createdAt,
});

export const rulesetVersions = pgTable(
  "ruleset_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameDefinitionId: uuid("game_definition_id")
      .notNull()
      .references(() => gameDefinitions.id, { onDelete: "restrict" }),
    version: varchar("version", { length: 64 }).notNull(),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
    scoring: jsonb("scoring").$type<Record<string, unknown>>().notNull(),
    immutableAt: timestamp("immutable_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("ruleset_versions_game_version_unique").on(
      table.gameDefinitionId,
      table.version,
    ),
  ],
);

export const rulesetSupersessions = pgTable(
  "ruleset_supersessions",
  {
    supersededRulesetVersionId: uuid("superseded_ruleset_version_id")
      .primaryKey()
      .references(() => rulesetVersions.id, { onDelete: "restrict" }),
    successorRulesetVersionId: uuid("successor_ruleset_version_id")
      .notNull()
      .references(() => rulesetVersions.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    createdAt,
  },
  (table) => [
    index("ruleset_supersessions_successor_idx").on(
      table.successorRulesetVersionId,
    ),
    check(
      "ruleset_supersessions_distinct_versions",
      sql`${table.supersededRulesetVersionId} <> ${table.successorRulesetVersionId}`,
    ),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rulesetVersionId: uuid("ruleset_version_id")
      .notNull()
      .references(() => rulesetVersions.id, { onDelete: "restrict" }),
    seedCiphertext: text("seed_ciphertext").notNull(),
    seedCommitment: varchar("seed_commitment", { length: 64 }).notNull(),
    canonicalDealHash: varchar("canonical_deal_hash", { length: 64 }).notNull(),
    revealedSeed: text("revealed_seed"),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    immutableAt: timestamp("immutable_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("deals_commitment_unique").on(table.seedCommitment),
    uniqueIndex("deals_canonical_hash_unique").on(table.canonicalDealHash),
    check(
      "deals_commitment_sha256",
      sql`${table.seedCommitment} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "deals_canonical_hash_sha256",
      sql`${table.canonicalDealHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "deals_reveal_pair_consistent",
      sql`(${table.revealedSeed} IS NULL) = (${table.revealedAt} IS NULL)`,
    ),
  ],
);

export const dealValidations = pgTable(
  "deal_validations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "restrict" }),
    validatorKey: varchar("validator_key", { length: 96 }).notNull(),
    validatorVersion: varchar("validator_version", { length: 64 }).notNull(),
    status: validationStatusEnum("status").notNull(),
    evidenceHash: varchar("evidence_hash", { length: 64 }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("deal_validations_deal_idx").on(table.dealId),
    uniqueIndex("deal_validations_verified_deal_unique")
      .on(table.dealId)
      .where(sql`${table.status} = 'VERIFIED_SOLVABLE'`),
    check(
      "deal_validations_terminal_timestamp",
      sql`${table.status} = 'PENDING' OR ${table.validatedAt} IS NOT NULL`,
    ),
    check(
      "deal_validations_verified_evidence",
      sql`${table.status} <> 'VERIFIED_SOLVABLE' OR (
        ${table.evidenceHash} ~ '^[0-9a-f]{64}$'
        AND ${table.evidence} IS NOT NULL
      )`,
    ),
  ],
);

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicName: varchar("public_name", { length: 160 }).notNull(),
    productMode: productModeEnum("product_mode")
      .default("MONETAIRE_PLAY")
      .notNull(),
    status: competitionStatusEnum("status").default("DRAFT").notNull(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "restrict" }),
    rulesetVersionId: uuid("ruleset_version_id")
      .notNull()
      .references(() => rulesetVersions.id, { onDelete: "restrict" }),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("competitions_status_idx").on(table.status),
    check(
      "competitions_window_valid",
      sql`${table.closesAt} > ${table.opensAt}`,
    ),
    check(
      "competitions_initial_release_mode",
      sql`${table.productMode} = 'MONETAIRE_PLAY'`,
    ),
    check(
      "competitions_publication_before_open",
      sql`${table.publishedAt} IS NULL OR ${table.publishedAt} < ${table.opensAt}`,
    ),
    check(
      "competitions_status_timestamps",
      sql`(
        ${table.status} = 'DRAFT'
        AND ${table.publishedAt} IS NULL
        AND ${table.closedAt} IS NULL
      ) OR (
        ${table.status} IN ('PUBLISHED', 'OPEN')
        AND ${table.publishedAt} IS NOT NULL
        AND ${table.closedAt} IS NULL
      ) OR (
        ${table.status} IN ('CLOSED', 'SETTLED', 'CANCELLED')
        AND ${table.publishedAt} IS NOT NULL
        AND ${table.closedAt} IS NOT NULL
        AND ${table.closedAt} >= ${table.publishedAt}
      )`,
    ),
  ],
);

export const competitionEntries = pgTable(
  "competition_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "restrict" }),
    eligibilityDecisionId: uuid("eligibility_decision_id").references(
      () => jurisdictionDecisions.id,
      { onDelete: "restrict" },
    ),
    enteredAt: timestamp("entered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("competition_entries_user_unique").on(
      table.competitionId,
      table.userId,
    ),
    uniqueIndex("competition_entries_eligibility_decision_unique")
      .on(table.eligibilityDecisionId)
      .where(sql`${table.eligibilityDecisionId} IS NOT NULL`),
  ],
);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    competitionEntryId: uuid("competition_entry_id").references(
      () => competitionEntries.id,
      { onDelete: "restrict" },
    ),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "restrict" }),
    rulesetVersionId: uuid("ruleset_version_id")
      .notNull()
      .references(() => rulesetVersions.id, { onDelete: "restrict" }),
    status: gameSessionStatusEnum("status").default("ACTIVE").notNull(),
    sessionMode: varchar("session_mode", { length: 32 })
      .default("PRACTICE")
      .notNull(),
    stateSnapshot: jsonb("state_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    activityClockSnapshot: jsonb("activity_clock_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    seedCiphertext: text("seed_ciphertext").notNull(),
    nextSequence: integer("next_sequence").default(1).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    activeDurationMs: bigint("active_duration_ms", { mode: "bigint" })
      .default(sql`0`)
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("game_sessions_user_idx").on(table.userId),
    index("game_sessions_competition_entry_idx").on(table.competitionEntryId),
    uniqueIndex("game_sessions_competition_entry_unique")
      .on(table.competitionEntryId)
      .where(sql`${table.competitionEntryId} IS NOT NULL`),
    index("game_sessions_terminal_status_idx")
      .on(table.status)
      .where(sql`${table.status} IN ('COMPLETED', 'ABANDONED')`),
    check(
      "game_sessions_mode_allowed",
      sql`${table.sessionMode} IN ('PRACTICE', 'NONCASH_COMPETITION')`,
    ),
    check(
      "game_sessions_mode_entry_consistent",
      sql`(
        ${table.sessionMode} = 'PRACTICE'
        AND ${table.competitionEntryId} IS NULL
      ) OR (
        ${table.sessionMode} = 'NONCASH_COMPETITION'
        AND ${table.competitionEntryId} IS NOT NULL
      )`,
    ),
  ],
);

export const moveEvents = pgTable(
  "move_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    moveType: varchar("move_type", { length: 64 }).notNull(),
    movePayload: jsonb("move_payload").$type<Record<string, unknown>>().notNull(),
    stateHashBefore: varchar("state_hash_before", { length: 64 }).notNull(),
    stateHashAfter: varchar("state_hash_after", { length: 64 }).notNull(),
    serverReceivedAt: timestamp("server_received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    accepted: boolean("accepted").notNull(),
    rejectionCode: varchar("rejection_code", { length: 96 }),
    createdAt,
  },
  (table) => [
    uniqueIndex("move_events_session_sequence_unique")
      .on(table.gameSessionId, table.sequence)
      .where(sql`${table.accepted} = true`),
    uniqueIndex("move_events_session_idempotency_unique").on(
      table.gameSessionId,
      table.idempotencyKey,
    ),
    check("move_events_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "move_events_state_hashes_sha256",
      sql`${table.stateHashBefore} ~ '^[0-9a-f]{64}$'
        AND ${table.stateHashAfter} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "move_events_rejection_consistent",
      sql`(
        ${table.accepted}
        AND ${table.rejectionCode} IS NULL
      ) OR (
        NOT ${table.accepted}
        AND ${table.rejectionCode} IS NOT NULL
        AND ${table.stateHashAfter} = ${table.stateHashBefore}
      )`,
    ),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "restrict" }),
    completed: boolean("completed").notNull(),
    validMoveCount: integer("valid_move_count").notNull(),
    verifiedActiveDurationMs: bigint("verified_active_duration_ms", {
      mode: "bigint",
    }).notNull(),
    scoringVersion: varchar("scoring_version", { length: 64 }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    supersededByScoreId: uuid("superseded_by_score_id"),
    createdAt,
  },
  (table) => [
    uniqueIndex("scores_active_session_unique")
      .on(table.gameSessionId)
      .where(sql`superseded_by_score_id IS NULL`),
    check(
      "scores_values_nonnegative",
      sql`${table.validMoveCount} >= 0 AND ${table.verifiedActiveDurationMs} >= 0`,
    ),
    check(
      "scores_not_self_superseded",
      sql`${table.supersededByScoreId} IS NULL OR ${table.supersededByScoreId} <> ${table.id}`,
    ),
  ],
);

export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    scoringVersion: varchar("scoring_version", { length: 64 }).notNull(),
    standings: jsonb("standings").$type<
      Array<{
        rank: number;
        entryId: string;
        scoreId: string;
        tied: boolean;
      }>
    >().notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
    createdAt,
  },
  (table) => [
    index("leaderboard_snapshots_competition_idx").on(table.competitionId),
    uniqueIndex("leaderboard_snapshots_competition_unique").on(
      table.competitionId,
    ),
    check(
      "leaderboard_snapshots_hash_sha256",
      sql`${table.snapshotHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const fraudFlags = pgTable(
  "fraud_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    gameSessionId: uuid("game_session_id").references(() => gameSessions.id, {
      onDelete: "restrict",
    }),
    flagType: varchar("flag_type", { length: 96 }).notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 32 }).default("OPEN").notNull(),
    createdAt,
  },
  (table) => [index("fraud_flags_user_idx").on(table.userId)],
);

export const fraudReviews = pgTable("fraud_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  fraudFlagId: uuid("fraud_flag_id")
    .notNull()
    .references(() => fraudFlags.id, { onDelete: "restrict" }),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id, {
    onDelete: "restrict",
  }),
  decision: varchar("decision", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  createdAt,
});

export const appeals = pgTable(
  "appeals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    gameSessionId: uuid("game_session_id").references(() => gameSessions.id, {
      onDelete: "restrict",
    }),
    subject: varchar("subject", { length: 160 }).notNull(),
    statement: text("statement").notNull(),
    status: varchar("status", { length: 32 }).default("OPEN").notNull(),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index("appeals_user_idx").on(table.userId)],
);

export const ledgers = pgTable(
  "ledgers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerType: ledgerTypeEnum("ledger_type").notNull().unique(),
    status: ledgerStatusEnum("status").default("RESERVED_DISABLED").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledgers_id_type_unique").on(table.id, table.ledgerType),
    check(
      "cash_ledgers_cannot_be_active",
      sql`${table.ledgerType} = 'PLAY_COIN' OR ${table.status} <> 'ACTIVE'`,
    ),
  ],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    accountCode: varchar("account_code", { length: 96 }).notNull(),
    currency: ledgerTypeEnum("currency").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_accounts_code_unique").on(
      table.ledgerId,
      table.accountCode,
    ),
    uniqueIndex("ledger_accounts_identity_unique").on(
      table.id,
      table.ledgerId,
      table.currency,
    ),
    foreignKey({
      name: "ledger_accounts_ledger_type_fk",
      columns: [table.ledgerId, table.currency],
      foreignColumns: [ledgers.id, ledgers.ledgerType],
    }).onDelete("restrict"),
    index("ledger_accounts_user_idx").on(table.userId),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id").notNull(),
    ledgerType: ledgerTypeEnum("ledger_type").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    referenceType: varchar("reference_type", { length: 64 }).notNull(),
    referenceId: varchar("reference_id", { length: 128 }).notNull(),
    reason: text("reason").notNull(),
    actorId: varchar("actor_id", { length: 128 }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_transactions_idempotency_unique").on(
      table.ledgerId,
      table.idempotencyKey,
    ),
    uniqueIndex("ledger_transactions_identity_unique").on(
      table.id,
      table.ledgerId,
      table.ledgerType,
    ),
    foreignKey({
      name: "ledger_transactions_ledger_type_fk",
      columns: [table.ledgerId, table.ledgerType],
      foreignColumns: [ledgers.id, ledgers.ledgerType],
    }).onDelete("restrict"),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id").notNull(),
    accountId: uuid("account_id").notNull(),
    ledgerId: uuid("ledger_id").notNull(),
    direction: ledgerDirectionEnum("direction").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: ledgerTypeEnum("currency").notNull(),
    createdAt,
  },
  (table) => [
    index("ledger_entries_transaction_idx").on(table.transactionId),
    index("ledger_entries_account_idx").on(table.accountId),
    foreignKey({
      name: "ledger_entries_transaction_identity_fk",
      columns: [table.transactionId, table.ledgerId, table.currency],
      foreignColumns: [
        ledgerTransactions.id,
        ledgerTransactions.ledgerId,
        ledgerTransactions.ledgerType,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "ledger_entries_account_identity_fk",
      columns: [table.accountId, table.ledgerId, table.currency],
      foreignColumns: [
        ledgerAccounts.id,
        ledgerAccounts.ledgerId,
        ledgerAccounts.currency,
      ],
    }).onDelete("restrict"),
    check("ledger_entry_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const playCoinPackages = pgTable(
  "play_coin_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicKey: varchar("public_key", { length: 64 }).notNull().unique(),
    label: varchar("label", { length: 96 }).notNull(),
    playCoinMinorUnits: bigint("play_coin_minor_units", {
      mode: "bigint",
    }).notNull(),
    sandboxPriceMinorUsd: bigint("sandbox_price_minor_usd", {
      mode: "bigint",
    }).notNull(),
    active: boolean("active").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "play_coin_packages_units_positive",
      sql`${table.playCoinMinorUnits} > 0`,
    ),
    check(
      "play_coin_packages_sandbox_price_nonnegative",
      sql`${table.sandboxPriceMinorUsd} >= 0`,
    ),
  ],
);

export const sandboxPurchases = pgTable(
  "sandbox_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    playCoinPackageId: uuid("play_coin_package_id")
      .notNull()
      .references(() => playCoinPackages.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 64 })
      .default("LOCAL_SANDBOX")
      .notNull(),
    providerReference: varchar("provider_reference", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).default("SIMULATED").notNull(),
    chargedRealMoney: boolean("charged_real_money").default(false).notNull(),
    ledgerTransactionId: uuid("ledger_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    createdAt,
  },
  (table) => [
    uniqueIndex("sandbox_purchases_idempotency_unique").on(
      table.userId,
      table.idempotencyKey,
    ),
    check(
      "sandbox_purchases_provider_local_only",
      sql`${table.provider} = 'LOCAL_SANDBOX'`,
    ),
    check(
      "sandbox_purchases_status_simulated_only",
      sql`${table.status} = 'SIMULATED'`,
    ),
    check(
      "sandbox_purchases_never_charge_real_money",
      sql`${table.chargedRealMoney} = false`,
    ),
  ],
);

export const fortuneDiceRounds = pgTable(
  "fortune_dice_rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 24 }).default("COMMITTED").notNull(),
    serverSeedCiphertext: text("server_seed_ciphertext").notNull(),
    seedCommitment: varchar("seed_commitment", { length: 64 }).notNull(),
    clientSeed: varchar("client_seed", { length: 128 }),
    nonce: bigint("nonce", { mode: "bigint" }).notNull(),
    choice: varchar("choice", { length: 16 }),
    wagerMinor: bigint("wager_minor", { mode: "bigint" }),
    dieOne: integer("die_one"),
    dieTwo: integer("die_two"),
    payoutMinor: bigint("payout_minor", { mode: "bigint" }),
    ledgerTransactionId: uuid("ledger_transaction_id").references(
      () => ledgerTransactions.id,
      { onDelete: "restrict" },
    ),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("fortune_dice_commitment_unique").on(table.seedCommitment),
    uniqueIndex("fortune_dice_user_nonce_unique").on(table.userId, table.nonce),
    index("fortune_dice_user_created_idx").on(table.userId, table.createdAt),
    check(
      "fortune_dice_status_allowed",
      sql`${table.status} IN ('COMMITTED', 'SETTLED', 'VOID')`,
    ),
    check(
      "fortune_dice_choice_allowed",
      sql`${table.choice} IS NULL OR ${table.choice} IN ('under', 'seven', 'over')`,
    ),
    check(
      "fortune_dice_values_allowed",
      sql`(${table.dieOne} IS NULL AND ${table.dieTwo} IS NULL) OR (${table.dieOne} BETWEEN 1 AND 6 AND ${table.dieTwo} BETWEEN 1 AND 6)`,
    ),
  ],
);

export const achievements = pgTable("achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 96 }).notNull().unique(),
  title: varchar("title", { length: 128 }).notNull(),
  description: text("description").notNull(),
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt,
});

export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "restrict" }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "user_achievements_pk",
      columns: [table.userId, table.achievementId],
    }),
  ],
);

export const userAdminRoles = pgTable(
  "user_admin_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: adminRoleEnum("role").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "user_admin_roles_pk",
      columns: [table.userId, table.role],
    }),
  ],
);

export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleUsed: adminRoleEnum("role_used").notNull(),
    actionType: varchar("action_type", { length: 96 }).notNull(),
    targetType: varchar("target_type", { length: 96 }).notNull(),
    targetId: varchar("target_id", { length: 128 }).notNull(),
    reason: text("reason").notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    createdAt,
  },
  (table) => [index("admin_actions_actor_idx").on(table.actorUserId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 96 }).notNull(),
    actorType: varchar("actor_type", { length: 32 }).notNull(),
    actorId: varchar("actor_id", { length: 128 }).notNull(),
    subjectType: varchar("subject_type", { length: 96 }).notNull(),
    subjectId: varchar("subject_id", { length: 128 }).notNull(),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    previousEventHash: varchar("previous_event_hash", { length: 64 }),
    eventHash: varchar("event_hash", { length: 64 }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("audit_events_event_hash_unique").on(table.eventHash),
    index("audit_events_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const termsVersions = pgTable(
  "terms_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentKey: varchar("document_key", { length: 96 }).notNull(),
    version: varchar("version", { length: 64 }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("terms_versions_document_unique").on(
      table.documentKey,
      table.version,
    ),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    bucketKey: varchar("bucket_key", { length: 192 }).primaryKey(),
    requestCount: integer("request_count").notNull(),
    resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
    updatedAt,
  },
  (table) => [
    check("rate_limit_buckets_count_positive", sql`${table.requestCount} > 0`),
    index("rate_limit_buckets_reset_idx").on(table.resetsAt),
  ],
);

export const userTermsAcceptances = pgTable(
  "user_terms_acceptances",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    termsVersionId: uuid("terms_version_id")
      .notNull()
      .references(() => termsVersions.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestId: varchar("request_id", { length: 128 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "user_terms_acceptances_pk",
      columns: [table.userId, table.termsVersionId],
    }),
  ],
);

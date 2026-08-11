import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  configuredDatabaseFingerprint,
  getRuntimeEnv,
  type RuntimeEnv,
} from "@/lib/env";

export const dynamic = "force-dynamic";

const REQUIRED_CORE_TABLE_COUNT = 10;
const REQUIRED_MIGRATION_COUNT = 10;

export async function GET() {
  let env: RuntimeEnv;
  try {
    env = getRuntimeEnv();
  } catch {
    return NextResponse.json(
      {
        status: "not-ready",
        service: "skill-gaming-world",
        mode: "unconfigured",
        verificationTarget: null,
        dependencies: {
          configuration: "unavailable",
          database: "unavailable",
          schema: "unavailable",
          jurisdiction: "unavailable",
          previewOwner: "unavailable",
        },
        operations: {
          monetairePlay: false,
          monetairePrize: false,
          socialCasino: false,
          realMoneyCasino: false,
          productionPayments: false,
        },
      },
      { status: 503 },
    );
  }
  let database: "not-required" | "ready" | "unavailable" = "not-required";
  let schema: "not-required" | "ready" | "unavailable" = "not-required";
  if (!env.DEMO_MODE) {
    try {
      const connection = getDatabase();
      const tableResult = await connection.execute(sql`
        select
          count(*) filter (
            where table_schema = 'public'
              and table_name in (
                'users',
                'sessions',
                'jurisdiction_decisions',
                'self_exclusions',
                'competitions',
                'game_sessions',
                'move_events',
                'ledger_transactions',
                'audit_events',
                'rate_limit_buckets'
              )
          )::integer as "coreTableCount",
          count(*) filter (
            where table_schema = 'drizzle'
              and table_name = '__drizzle_migrations'
          )::integer as "journalTableCount"
        from information_schema.tables
      `);
      database = "ready";

      const tableStatus = tableResult[0] as
        | {
            coreTableCount?: number | string;
            journalTableCount?: number | string;
          }
        | undefined;
      if (
        Number(tableStatus?.coreTableCount) === REQUIRED_CORE_TABLE_COUNT &&
        Number(tableStatus?.journalTableCount) === 1
      ) {
        const migrationResult = await connection.execute(sql`
          select count(*)::integer as "migrationCount"
          from drizzle.__drizzle_migrations
        `);
        const migrationStatus = migrationResult[0] as
          | { migrationCount?: number | string }
          | undefined;
        const truthResult = await connection.execute(sql`
          select
            (
              select count(*)
              from public."ruleset_versions" as ruleset
              join public."game_definitions" as definition
                on definition."id" = ruleset."game_definition_id"
              where definition."key" = 'MONETAIRE_SOLITAIRE'
                and ruleset."version" = 'KLONDIKE_DRAW_THREE_V2'
                and ruleset."rules" ->> 'draw' = '3'
                and ruleset."rules" ->> 'redeals' = 'unlimited'
                and ruleset."rules" ->> 'valuablePrize' = 'false'
                and ruleset."scoring" ->> 'version' =
                  'MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1'
                and ruleset."immutable_at" is not null
            )::integer as "correctRulesetCount",
            (
              select count(*)
              from public."ruleset_versions" as ruleset
              join public."game_definitions" as definition
                on definition."id" = ruleset."game_definition_id"
              where definition."key" = 'MONETAIRE_SOLITAIRE'
                and ruleset."version" = 'KLONDIKE_DRAW_THREE_V1'
                and ruleset."rules" ->> 'draw' = '1'
                and not exists (
                  select 1
                  from public."ruleset_supersessions" as supersession
                  where supersession."superseded_ruleset_version_id" = ruleset."id"
                )
            )::integer as "untrackedMistakeCount",
            (
              select count(*)
              from public."competitions" as competition
              join public."ruleset_supersessions" as supersession
                on supersession."superseded_ruleset_version_id" =
                  competition."ruleset_version_id"
              where competition."status" in ('PUBLISHED', 'OPEN')
            )::integer as "activeSupersededCompetitionCount",
            (
              select count(*)
              from public."competitions" as competition
              join public."ruleset_versions" as ruleset
                on ruleset."id" = competition."ruleset_version_id"
              join public."game_definitions" as definition
                on definition."id" = ruleset."game_definition_id"
              where definition."key" = 'MONETAIRE_SOLITAIRE'
                and ruleset."version" = 'KLONDIKE_DRAW_THREE_V2'
                and competition."status" in ('PUBLISHED', 'OPEN')
                and not exists (
                  select 1
                  from public."deal_validations" as validation
                  where validation."deal_id" = competition."deal_id"
                    and validation."status" = 'VERIFIED_SOLVABLE'
                    and validation."evidence" ->> 'protocol' =
                      'CURATED_SOLVABLE_REPLAY_V1'
                )
            )::integer as "activeProoflessV2CompetitionCount",
            (
              select count(*)
              from public."game_sessions" as session
              where session."status" in ('COMPLETED', 'ABANDONED')
                and not exists (
                  select 1
                  from public."scores" as score
                  where score."game_session_id" = session."id"
                    and score."superseded_by_score_id" is null
                )
            )::integer as "terminalSessionMissingScoreCount",
            (
              (exists (
                select 1 from pg_catalog.pg_indexes
                where schemaname = 'public'
                  and indexname = 'move_events_session_sequence_unique'
                  and indexdef ilike '%unique index%'
                  and indexdef ilike '%where%accepted%'
              ))::integer
              + (exists (
                select 1 from pg_catalog.pg_indexes
                where schemaname = 'public'
                  and indexname = 'deal_validations_verified_deal_unique'
                  and indexdef ilike '%unique index%'
                  and indexdef ilike '%where%status%verified_solvable%'
              ))::integer
              + (exists (
                select 1 from pg_catalog.pg_indexes
                where schemaname = 'public'
                  and indexname = 'competition_entries_eligibility_decision_unique'
                  and indexdef ilike '%unique index%'
                  and indexdef ilike '%where%eligibility_decision_id%not null%'
              ))::integer
              + (exists (
                select 1 from information_schema.triggers
                where event_object_schema = 'public'
                  and event_object_table = 'competition_entries'
                  and trigger_name = 'competition_entries_eligibility_allow'
              ))::integer
              + (exists (
                select 1 from information_schema.triggers
                where event_object_schema = 'public'
                  and event_object_table = 'jurisdiction_decisions'
                  and trigger_name = 'jurisdiction_decisions_append_only'
              ))::integer
              + (exists (
                select 1 from pg_catalog.pg_indexes
                where schemaname = 'public'
                  and indexname = 'game_sessions_competition_entry_unique'
                  and indexdef ilike '%unique index%'
                  and indexdef ilike '%where%competition_entry_id%not null%'
              ))::integer
              + (exists (
                select 1
                from pg_catalog.pg_constraint as constraint_record
                join pg_catalog.pg_class as constrained_table
                  on constrained_table.oid = constraint_record.conrelid
                join pg_catalog.pg_namespace as constrained_schema
                  on constrained_schema.oid = constrained_table.relnamespace
                where constraint_record.conname = 'game_sessions_mode_entry_consistent'
                  and constrained_schema.nspname = 'public'
                  and constrained_table.relname = 'game_sessions'
              ))::integer
              + (exists (
                select 1 from pg_catalog.pg_indexes
                where schemaname = 'public'
                  and indexname = 'leaderboard_snapshots_competition_unique'
                  and indexdef ilike '%unique index%'
              ))::integer
              + (exists (
                select 1
                from pg_catalog.pg_constraint as constraint_record
                join pg_catalog.pg_class as constrained_table
                  on constrained_table.oid = constraint_record.conrelid
                join pg_catalog.pg_namespace as constrained_schema
                  on constrained_schema.oid = constrained_table.relnamespace
                where constraint_record.conname = 'leaderboard_snapshots_hash_sha256'
                  and constrained_schema.nspname = 'public'
                  and constrained_table.relname = 'leaderboard_snapshots'
              ))::integer
              + (exists (
                select 1 from information_schema.triggers
                where event_object_schema = 'public'
                  and event_object_table = 'leaderboard_snapshots'
                  and trigger_name = 'leaderboard_snapshots_append_only'
              ))::integer
              + (exists (
                select 1 from pg_catalog.pg_indexes
                where schemaname = 'public'
                  and indexname = 'game_sessions_terminal_status_idx'
                  and indexdef ilike '%where%status%completed%abandoned%'
              ))::integer
              + (exists (
                select 1 from information_schema.triggers
                where event_object_schema = 'public'
                  and event_object_table = 'game_sessions'
                  and trigger_name = 'game_sessions_terminal_freeze'
              ))::integer
              + (exists (
                select 1
                from pg_catalog.pg_proc as procedure
                join pg_catalog.pg_namespace as procedure_schema
                  on procedure_schema.oid = procedure.pronamespace
                where procedure_schema.nspname = 'public'
                  and procedure.proname = 'protect_published_competition'
                  and pg_catalog.pg_get_functiondef(procedure.oid) ilike
                    '%OLD."status" IN (''CLOSED'', ''SETTLED'', ''CANCELLED'')%'
              ))::integer
            )::integer as "stageTwoInvariantCount",
            (
              with recursive reachable_audit_events as (
                select
                  event."id",
                  event."event_hash",
                  array[event."event_hash"::text]::text[]
                    as visited_event_hashes
                from public."audit_events" as event
                where event."previous_event_hash" is null

                union all

                select
                  child."id",
                  child."event_hash",
                  array_append(
                    parent.visited_event_hashes,
                    child."event_hash"::text
                  )::text[]
                from reachable_audit_events as parent
                join public."audit_events" as child
                  on child."previous_event_hash" = parent."event_hash"
                where not child."event_hash" = any (
                  parent.visited_event_hashes
                )
              ),
              audit_chain_topology as (
                select
                  (select count(*) from public."audit_events")
                    as event_count,
                  (
                    select count(*)
                    from public."audit_events" as event
                    where event."previous_event_hash" is null
                  ) as root_count,
                  (
                    select count(*)
                    from public."audit_events" as event
                    where not exists (
                      select 1
                      from public."audit_events" as child
                      where child."previous_event_hash" = event."event_hash"
                    )
                  ) as head_count,
                  (
                    select count(*)
                    from public."audit_events" as event
                    where event."previous_event_hash" is not null
                      and not exists (
                        select 1
                        from public."audit_events" as parent
                        where parent."event_hash" =
                          event."previous_event_hash"
                      )
                  ) as dangling_parent_count,
                  (
                    select count(*)
                    from (
                      select child."previous_event_hash"
                      from public."audit_events" as child
                      where child."previous_event_hash" is not null
                      group by child."previous_event_hash"
                      having count(*) > 1
                    ) as forked_parents
                  ) as fork_count,
                  (
                    select count(*)
                    from reachable_audit_events
                  ) as reachable_row_count,
                  (
                    select count(distinct reachable."id")
                    from reachable_audit_events as reachable
                  ) as reachable_event_count
              )
              select case
                when topology.event_count = 0 then 0
                when topology.root_count <> 1
                  or topology.head_count <> 1
                  or topology.dangling_parent_count <> 0
                  or topology.fork_count <> 0
                  or topology.reachable_row_count <> topology.event_count
                  or topology.reachable_event_count <> topology.event_count
                  then 1
                else 0
              end
              from audit_chain_topology as topology
            )::integer as "auditChainInvalidCount"
        `);
        const truthStatus = truthResult[0] as
          | {
              correctRulesetCount?: number | string;
              untrackedMistakeCount?: number | string;
              activeSupersededCompetitionCount?: number | string;
              activeProoflessV2CompetitionCount?: number | string;
              terminalSessionMissingScoreCount?: number | string;
              stageTwoInvariantCount?: number | string;
              auditChainInvalidCount?: number | string;
            }
          | undefined;
        schema =
          Number(migrationStatus?.migrationCount) >= REQUIRED_MIGRATION_COUNT &&
          Number(truthStatus?.correctRulesetCount) === 1 &&
          Number(truthStatus?.untrackedMistakeCount) === 0 &&
          Number(truthStatus?.activeSupersededCompetitionCount) === 0 &&
          Number(truthStatus?.activeProoflessV2CompetitionCount) === 0 &&
          Number(truthStatus?.terminalSessionMissingScoreCount) === 0 &&
          Number(truthStatus?.auditChainInvalidCount) === 0 &&
          Number(truthStatus?.stageTwoInvariantCount) === 13
            ? "ready"
            : "unavailable";
      } else {
        schema = "unavailable";
      }
    } catch {
      if (database !== "ready") {
        database = "unavailable";
      }
      schema = "unavailable";
    }
  }
  const ready = database !== "unavailable" && schema !== "unavailable";
  const configuredJurisdiction =
    env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION;
  const jurisdictionReady =
    env.DEMO_MODE ||
    (Boolean(configuredJurisdiction) &&
      env.MONETAIRE_PLAY_JURISDICTIONS.includes(configuredJurisdiction));
  const previewOwnerReady =
    env.DEMO_MODE || Boolean(env.PREVIEW_OWNER_EMAIL);
  const monetairePlayReady =
    ready && jurisdictionReady && previewOwnerReady;
  const serviceReady =
    ready && jurisdictionReady && previewOwnerReady;
  return NextResponse.json({
    status: serviceReady ? "ok" : "not-ready",
    service: "skill-gaming-world",
    mode: env.DEMO_MODE ? "safe-demo" : "configured",
    verificationTarget: {
      id: env.CONFIGURED_E2E_TARGET_ID ?? null,
      databaseFingerprint:
        env.DEMO_MODE || !env.CONFIGURED_E2E_TARGET_ID
        ? null
        : configuredDatabaseFingerprint(env.DATABASE_URL),
    },
    dependencies: {
      configuration: "ready",
      database,
      schema,
      jurisdiction: jurisdictionReady ? "ready" : "unavailable",
      previewOwner: previewOwnerReady ? "ready" : "unavailable",
    },
    operations: {
      monetairePlay: monetairePlayReady,
      monetairePrize: false,
      socialCasino: false,
      realMoneyCasino: false,
      productionPayments: false,
    },
  }, { status: serviceReady ? 200 : 503 });
}

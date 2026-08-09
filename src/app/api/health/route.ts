import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { getRuntimeEnv, type RuntimeEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const REQUIRED_CORE_TABLE_COUNT = 10;
const REQUIRED_MIGRATION_COUNT = 9;

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
            )::integer as "activeSupersededCompetitionCount"
        `);
        const truthStatus = truthResult[0] as
          | {
              correctRulesetCount?: number | string;
              untrackedMistakeCount?: number | string;
              activeSupersededCompetitionCount?: number | string;
            }
          | undefined;
        schema =
          Number(migrationStatus?.migrationCount) >= REQUIRED_MIGRATION_COUNT &&
          Number(truthStatus?.correctRulesetCount) === 1 &&
          Number(truthStatus?.untrackedMistakeCount) === 0 &&
          Number(truthStatus?.activeSupersededCompetitionCount) === 0
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
  const previewOwnerReady = true;
  const monetairePlayReady =
    ready && jurisdictionReady && previewOwnerReady;
  const serviceReady =
    ready && jurisdictionReady && previewOwnerReady;
  return NextResponse.json({
    status: serviceReady ? "ok" : "not-ready",
    service: "skill-gaming-world",
    mode: env.DEMO_MODE ? "safe-demo" : "configured",
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

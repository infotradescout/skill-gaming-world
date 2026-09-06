import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, it } from "vitest";
import { ROBOT_FOUNDATION_READY_SQL } from "./robot-foundation-readiness";

// These are isolated schema checks, not a configured two-player gameplay proof.
let client: PGlite;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
async function ready() {
  const result = await client.query<{ ready: boolean }>(`SELECT ${ROBOT_FOUNDATION_READY_SQL} AS ready`);
  return result.rows[0]?.ready;
}
beforeEach(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec('CREATE TABLE public.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());');
  await client.exec(readFileSync(resolve(process.cwd(), "drizzle/0010_robot-combat-foundation.sql"), "utf8"));
});
afterEach(async () => { await client?.close(); });

describe("Robot Combat foundation catalog", () => {
  it("recognizes the complete reviewed schema", async () => { assert.equal(await ready(), true); });
  it("detects each missing table without querying player rows", async () => {
    for (const table of ["robot_combat_builds", "robot_combat_build_revisions", "robot_combat_matches", "robot_combat_match_events"]) {
      await client.exec(`ALTER TABLE public.${quote(table)} RENAME TO sgw_hidden_table`);
      assert.equal(await ready(), false, table);
      await client.exec(`ALTER TABLE public.sgw_hidden_table RENAME TO ${quote(table)}`);
    }
    assert.equal(await ready(), true);
  });
  it("detects every missing migration-defined column", async () => {
    const result = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name LIKE 'robot_combat_%'
      ORDER BY table_name, ordinal_position
    `);
    assert.equal(result.rows.length, 40);
    for (const { table_name: table, column_name: column } of result.rows) {
      await client.exec(`ALTER TABLE public.${quote(table)} RENAME COLUMN ${quote(column)} TO sgw_hidden_column`);
      assert.equal(await ready(), false, `${table}.${column}`);
      await client.exec(`ALTER TABLE public.${quote(table)} RENAME COLUMN sgw_hidden_column TO ${quote(column)}`);
    }
  });
  it("detects every missing primary or unique index", async () => {
    const result = await client.query<{ index_name: string }>(`
      SELECT index_relation.relname AS index_name
      FROM pg_index AS record JOIN pg_class AS relation ON relation.oid=record.indrelid
      JOIN pg_class AS index_relation ON index_relation.oid=record.indexrelid
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='public' AND relation.relname LIKE 'robot_combat_%' AND record.indisunique
    `);
    assert.equal(result.rows.length, 9);
    for (const { index_name: index } of result.rows) {
      await client.exec(`ALTER INDEX public.${quote(index)} RENAME TO sgw_hidden_index`);
      assert.equal(await ready(), false, index);
      await client.exec(`ALTER INDEX public.sgw_hidden_index RENAME TO ${quote(index)}`);
    }
  });
  it("detects every missing check and foreign key", async () => {
    const result = await client.query<{ table_name: string; conname: string }>(`
      SELECT relation.relname AS table_name, guard.conname
      FROM pg_constraint AS guard JOIN pg_class AS relation ON relation.oid=guard.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='public' AND relation.relname LIKE 'robot_combat_%' AND guard.contype IN ('c','f')
    `);
    assert.equal(result.rows.length, 15);
    for (const { table_name: table, conname: guard } of result.rows) {
      await client.exec(`ALTER TABLE public.${quote(table)} RENAME CONSTRAINT ${quote(guard)} TO sgw_hidden_guard`);
      assert.equal(await ready(), false, guard);
      await client.exec(`ALTER TABLE public.${quote(table)} RENAME CONSTRAINT sgw_hidden_guard TO ${quote(guard)}`);
    }
  });
  it.each([
    ["weakened check with the same name", `
      ALTER TABLE robot_combat_match_events RENAME CONSTRAINT robot_combat_match_events_rejection_consistent TO original_guard;
      ALTER TABLE robot_combat_match_events ADD CONSTRAINT robot_combat_match_events_rejection_consistent CHECK(true);
    `],
    ["wrong foreign-key target with the same name", `
      ALTER TABLE robot_combat_build_revisions RENAME CONSTRAINT robot_combat_build_revisions_build_id_robot_combat_builds_id_fk TO original_guard;
      ALTER TABLE robot_combat_build_revisions ADD CONSTRAINT robot_combat_build_revisions_build_id_robot_combat_builds_id_fk FOREIGN KEY(build_id) REFERENCES users(id) ON DELETE RESTRICT;
    `],
    ["wrong unique columns with the same index name", `
      ALTER INDEX robot_combat_builds_user_key_unique RENAME TO original_index;
      CREATE UNIQUE INDEX robot_combat_builds_user_key_unique ON robot_combat_builds(user_id);
    `],
    ["weakened nullability", "ALTER TABLE robot_combat_builds ALTER COLUMN user_id DROP NOT NULL"],
    ["wrong state type", "ALTER TABLE robot_combat_matches ALTER COLUMN state_snapshot TYPE text USING state_snapshot::text"],
    ["unreviewed phase", "ALTER TYPE robot_combat_match_phase ADD VALUE 'UNREVIEWED_PHASE'"],
  ]) ("rejects %s", async (_name, mutation) => {
    await client.exec(mutation);
    assert.equal(await ready(), false);
  });
});

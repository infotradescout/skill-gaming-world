import { canonicalJson, deepFreeze } from "@/domain";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { getDemoStore } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { createId } from "./ids";

export type RuntimeAuditEventInput = Parameters<
  typeof appendDemoAuditEvent
>[0] & { requestId?: string };

export type PersistentAuditTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export const AUDIT_CANONICAL_JSON_V2 = "AUDIT_CANONICAL_JSON_V2";

export function appendDemoAuditEvent(input: {
  eventType: string;
  actorId: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}) {
  const event = deepFreeze({
    id: createId("audit"),
    createdAt: new Date().toISOString(),
    eventType: input.eventType,
    actorId: input.actorId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    beforeState: input.beforeState
      ? { ...input.beforeState }
      : undefined,
    afterState: input.afterState
      ? { ...input.afterState }
      : undefined,
  });
  const store = getDemoStore();
  store.auditEvents = deepFreeze([...store.auditEvents, event]);
  return event;
}

export async function appendRuntimeAuditEvent(
  input: RuntimeAuditEventInput,
) {
  if (getRuntimeEnv().DEMO_MODE) {
    return appendDemoAuditEvent(input);
  }

  return getDatabase().transaction((transaction) =>
    appendPersistentAuditEvent(transaction, input),
  );
}

export function canonicalLegacyPersistentAuditEvent(input: {
  id: string;
  eventType: string;
  actorId: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  previousEventHash?: string;
  createdAt: Date;
}): string {
  return JSON.stringify({
    id: input.id,
    eventType: input.eventType,
    actorId: input.actorId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    beforeState: input.beforeState,
    afterState: input.afterState,
    previousEventHash: input.previousEventHash,
    createdAt: input.createdAt.toISOString(),
  });
}

export function canonicalPersistentAuditEvent(input: {
  id: string;
  eventType: string;
  actorType: "ANONYMOUS" | "USER";
  actorId: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  requestId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  previousEventHash: string | null;
  createdAt: Date;
}): string {
  return canonicalJson({
    id: input.id,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    requestId: input.requestId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    metadata: input.metadata,
    previousEventHash: input.previousEventHash,
    createdAt: input.createdAt.toISOString(),
  });
}

export async function appendPersistentAuditEvent(
  transaction: PersistentAuditTransaction,
  input: RuntimeAuditEventInput,
) {
  // The advisory lock serializes both an empty chain and every later append.
  // The head is identified by linkage rather than wall-clock order, so a
  // legacy event written by a skewed host cannot cause the next append to fork.
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext('MONETAIRE_AUDIT_CHAIN_V1'))`,
  );
  const headResult = await transaction.execute(sql`
    select event."event_hash" as "eventHash"
    from public."audit_events" as event
    where not exists (
      select 1
      from public."audit_events" as child
      where child."previous_event_hash" = event."event_hash"
    )
    order by event."created_at" desc, event."id" desc
    limit 2
  `);
  const heads = Array.isArray(headResult)
    ? (headResult as unknown as Array<{ eventHash: string }>)
    : ((headResult as unknown as { rows?: Array<{ eventHash: string }> })
        .rows ?? []);
  const [countRecord] = await transaction
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents);
  if (
    heads.length > 1 ||
    (Number(countRecord?.count ?? 0) > 0 && heads.length !== 1)
  ) {
    throw new Error("AUDIT_CHAIN_INTEGRITY_FAILURE");
  }

  const [databaseClock] = await transaction
    .select({ createdAt: sql<Date>`date_trunc('milliseconds', clock_timestamp())` })
    .from(sql`(select 1) as database_clock_source`)
    .limit(1);
  if (!databaseClock) throw new Error("DATABASE_CLOCK_UNAVAILABLE");
  const createdAt = new Date(databaseClock.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("DATABASE_CLOCK_INVALID");
  }

  const id = randomUUID();
  const actorType = input.actorId === "anonymous" ? "ANONYMOUS" : "USER";
  const requestId = input.requestId ?? id;
  const previousEventHash = heads[0]?.eventHash ?? null;
  const beforeState = input.beforeState ?? null;
  const afterState = input.afterState ?? null;
  const metadata = { hashCanonicalVersion: AUDIT_CANONICAL_JSON_V2 };
  const canonical = canonicalPersistentAuditEvent({
    id,
    eventType: input.eventType,
    actorType,
    actorId: input.actorId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    requestId,
    beforeState,
    afterState,
    metadata,
    previousEventHash,
    createdAt,
  });
  const eventHash = createHash("sha256").update(canonical).digest("hex");
  const [event] = await transaction
    .insert(auditEvents)
    .values({
      id,
      eventType: input.eventType,
      actorType,
      actorId: input.actorId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: input.reason,
      requestId,
      beforeState,
      afterState,
      metadata,
      previousEventHash,
      eventHash,
      createdAt,
    })
    .returning();
  if (!event) throw new Error("AUDIT_EVENT_APPEND_FAILED");
  return event;
}

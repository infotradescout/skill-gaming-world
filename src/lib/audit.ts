import { deepFreeze } from "@/domain";
import { createHash, randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { getDemoStore } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { createId } from "./ids";

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
  input: Parameters<typeof appendDemoAuditEvent>[0] & { requestId?: string },
) {
  if (getRuntimeEnv().DEMO_MODE) {
    return appendDemoAuditEvent(input);
  }

  return getDatabase().transaction(async (transaction) => {
    const previous = await transaction
      .select({ eventHash: auditEvents.eventHash })
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    const id = randomUUID();
    const createdAt = new Date();
    const previousEventHash = previous[0]?.eventHash;
    const canonical = JSON.stringify({
      id,
      eventType: input.eventType,
      actorId: input.actorId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: input.reason,
      beforeState: input.beforeState,
      afterState: input.afterState,
      previousEventHash,
      createdAt: createdAt.toISOString(),
    });
    const eventHash = createHash("sha256").update(canonical).digest("hex");
    const [event] = await transaction
      .insert(auditEvents)
      .values({
        id,
        eventType: input.eventType,
        actorType: input.actorId === "anonymous" ? "ANONYMOUS" : "USER",
        actorId: input.actorId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        reason: input.reason,
        requestId: input.requestId ?? id,
        beforeState: input.beforeState,
        afterState: input.afterState,
        previousEventHash,
        eventHash,
        createdAt,
      })
      .returning();
    return event;
  });
}

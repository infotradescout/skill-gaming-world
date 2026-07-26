import { deepFreeze } from "@/domain";

import { getDemoStore } from "./demo-store";
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

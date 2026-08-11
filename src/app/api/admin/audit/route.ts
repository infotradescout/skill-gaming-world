import { NextRequest, NextResponse } from "next/server";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import { currentRuntimeUser } from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  jsonError,
  requestId,
} from "@/lib/http";
import { listPersistentAuditEvents } from "@/lib/persistent-support";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const rateError = await enforceRateLimit(
    request,
    "admin-audit-read",
    30,
    60_000,
  );
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }
  if (
    !user.adminRoles.some((role) =>
      ["FINANCE_AUDITOR", "COMPLIANCE_ADMIN", "SUPER_ADMIN"].includes(role),
    )
  ) {
    const environment = getRuntimeEnv().DEMO_MODE ? "safe-demo" : "configured";
    await appendRuntimeAuditEvent({
      eventType: "ADMIN_AUDIT_LOG_ACCESS_DENIED",
      actorId: user.id,
      subjectType: "AUDIT_LOG",
      subjectId: `${environment}-audit-log`,
      reason: "Authenticated user lacked an audit-reader role.",
      afterState: { outcome: "DENIED", environment },
    });
    return jsonError(403, "ADMIN_ROLE_REQUIRED", "This audit surface is restricted.", id);
  }

  const environment = getRuntimeEnv().DEMO_MODE ? "safe-demo" : "configured";
  await appendRuntimeAuditEvent({
    eventType: "ADMIN_AUDIT_LOG_VIEWED",
    actorId: user.id,
    subjectType: "AUDIT_LOG",
    subjectId: `${environment}-audit-log`,
    reason: "Authorized administrator viewed the audit log.",
    afterState: { outcome: "ALLOWED", environment },
  });
  return NextResponse.json({
    appendOnly: !getRuntimeEnv().DEMO_MODE,
    appendStrategy: getRuntimeEnv().DEMO_MODE
      ? "SAFE_DEMO_COPY_ON_APPEND"
      : "POSTGRES_HASH_CHAIN",
    durablePersistence: !getRuntimeEnv().DEMO_MODE,
    databaseContractRequiresAppendOnly: true,
    events: getRuntimeEnv().DEMO_MODE
      ? getDemoStore().auditEvents.toReversed()
      : await listPersistentAuditEvents(),
  });
}

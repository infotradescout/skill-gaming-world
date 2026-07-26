import { NextRequest, NextResponse } from "next/server";

import { appendDemoAuditEvent } from "@/lib/audit";
import { currentDemoUser } from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import {
  enforceRateLimit,
  jsonError,
  requestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const rateError = enforceRateLimit(
    request,
    "admin-audit-read",
    30,
    60_000,
  );
  if (rateError) return rateError;
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }
  if (
    !user.adminRoles.some((role) =>
      ["FINANCE_AUDITOR", "COMPLIANCE_ADMIN", "SUPER_ADMIN"].includes(role),
    )
  ) {
    appendDemoAuditEvent({
      eventType: "ADMIN_AUDIT_LOG_ACCESS_DENIED",
      actorId: user.id,
      subjectType: "AUDIT_LOG",
      subjectId: "safe-demo-audit-log",
      reason: "Authenticated user lacked an audit-reader role.",
      afterState: { outcome: "DENIED" },
    });
    return jsonError(403, "ADMIN_ROLE_REQUIRED", "This audit surface is restricted.", id);
  }

  appendDemoAuditEvent({
    eventType: "ADMIN_AUDIT_LOG_VIEWED",
    actorId: user.id,
    subjectType: "AUDIT_LOG",
    subjectId: "safe-demo-audit-log",
    reason: "Authorized administrator viewed the safe-demo audit log.",
    afterState: { outcome: "ALLOWED" },
  });
  return NextResponse.json({
    appendOnly: false,
    appendStrategy: "SAFE_DEMO_COPY_ON_APPEND",
    durablePersistence: false,
    databaseContractRequiresAppendOnly: true,
    events: getDemoStore().auditEvents.toReversed(),
  });
}

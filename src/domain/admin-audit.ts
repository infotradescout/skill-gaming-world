import {
  canonicalJson,
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
  sha256Hex,
} from "./shared";

export const ADMIN_ROLES = [
  "SUPPORT",
  "FRAUD_REVIEW",
  "CONTENT_ADMIN",
  "FINANCE_AUDITOR",
  "COMPLIANCE_ADMIN",
  "SUPER_ADMIN",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type PrivilegedActionType =
  | "PLAY_COIN_BALANCE_ADJUSTMENT"
  | "OFFICIAL_SCORE_ADJUSTMENT"
  | "FEATURE_GATE_CHANGE";

export interface AdminActor {
  readonly actorId: string;
  readonly role: AdminRole;
}

export interface AdminAuditEvent {
  readonly auditId: string;
  readonly actionType: PrivilegedActionType;
  readonly actorId: string;
  readonly actorRole: AdminRole;
  readonly serverRecordedAtMs: number;
  readonly reason: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly beforeState: unknown;
  readonly afterState: unknown;
  readonly previousEventHash: string;
  readonly eventHash: string;
}

export interface AdminAuditLog {
  readonly events: readonly Readonly<AdminAuditEvent>[];
}

const ADMIN_AUDIT_GENESIS = sha256Hex("MONETAIRE_ADMIN_AUDIT_GENESIS_V1");

const ACTION_ROLES: Readonly<
  Record<PrivilegedActionType, readonly AdminRole[]>
> = deepFreeze({
  PLAY_COIN_BALANCE_ADJUSTMENT: ["SUPER_ADMIN"],
  OFFICIAL_SCORE_ADJUSTMENT: ["COMPLIANCE_ADMIN", "SUPER_ADMIN"],
  FEATURE_GATE_CHANGE: ["COMPLIANCE_ADMIN", "SUPER_ADMIN"],
});

export function createAdminAuditLog(): Readonly<AdminAuditLog> {
  return deepFreeze({ events: [] });
}

export function assertAdminAuthority(
  actor: Readonly<AdminActor>,
  actionType: PrivilegedActionType,
): void {
  requireNonEmpty(actor.actorId, "actorId");
  if (!ADMIN_ROLES.includes(actor.role)) {
    throw new DomainError("UNKNOWN_ADMIN_ROLE", "Admin role is invalid");
  }
  if (!ACTION_ROLES[actionType].includes(actor.role)) {
    throw new DomainError(
      "ADMIN_ACTION_FORBIDDEN",
      `${actor.role} cannot perform ${actionType}`,
    );
  }
}

export function appendAdminAuditEvent(
  log: Readonly<AdminAuditLog>,
  input: {
    readonly auditId: string;
    readonly actionType: PrivilegedActionType;
    readonly actor: Readonly<AdminActor>;
    readonly serverRecordedAtMs: number;
    readonly reason: string;
    readonly subjectType: string;
    readonly subjectId: string;
    readonly beforeState: unknown;
    readonly afterState: unknown;
  },
): {
  readonly log: Readonly<AdminAuditLog>;
  readonly event: Readonly<AdminAuditEvent>;
} {
  assertAdminAuthority(input.actor, input.actionType);
  const auditId = requireNonEmpty(input.auditId, "auditId");
  if (log.events.some((event) => event.auditId === auditId)) {
    throw new DomainError(
      "DUPLICATE_ADMIN_ACTION",
      "Admin audit id was already recorded",
    );
  }

  const reason = requireNonEmpty(input.reason, "reason");
  const subjectType = requireNonEmpty(input.subjectType, "subjectType");
  const subjectId = requireNonEmpty(input.subjectId, "subjectId");
  requireNonNegativeInteger(
    input.serverRecordedAtMs,
    "serverRecordedAtMs",
  );
  const priorEvent = log.events[log.events.length - 1];
  if (
    priorEvent !== undefined &&
    input.serverRecordedAtMs < priorEvent.serverRecordedAtMs
  ) {
    throw new DomainError(
      "NON_MONOTONIC_ADMIN_AUDIT_TIME",
      "Admin audit time cannot precede the prior event",
    );
  }
  const previousEventHash =
    priorEvent?.eventHash ?? ADMIN_AUDIT_GENESIS;
  const payload = {
    protocol: "MONETAIRE_ADMIN_AUDIT_V1",
    auditId,
    actionType: input.actionType,
    actorId: input.actor.actorId,
    actorRole: input.actor.role,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason,
    subjectType,
    subjectId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    previousEventHash,
  };
  const event = deepFreeze({
    auditId,
    actionType: input.actionType,
    actorId: input.actor.actorId,
    actorRole: input.actor.role,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason,
    subjectType,
    subjectId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    previousEventHash,
    eventHash: sha256Hex(canonicalJson(payload)),
  });
  const nextLog = deepFreeze({ events: [...log.events, event] });

  return deepFreeze({ log: nextLog, event });
}

export function verifyAdminAuditLog(
  log: Readonly<AdminAuditLog>,
): boolean {
  let previousEventHash = ADMIN_AUDIT_GENESIS;
  const auditIds = new Set<string>();

  for (const event of log.events) {
    if (
      auditIds.has(event.auditId) ||
      event.previousEventHash !== previousEventHash
    ) {
      return false;
    }
    auditIds.add(event.auditId);
    const expectedHash = sha256Hex(
      canonicalJson({
        protocol: "MONETAIRE_ADMIN_AUDIT_V1",
        auditId: event.auditId,
        actionType: event.actionType,
        actorId: event.actorId,
        actorRole: event.actorRole,
        serverRecordedAtMs: event.serverRecordedAtMs,
        reason: event.reason,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        beforeState: event.beforeState,
        afterState: event.afterState,
        previousEventHash: event.previousEventHash,
      }),
    );
    if (event.eventHash !== expectedHash) {
      return false;
    }
    previousEventHash = event.eventHash;
  }

  return true;
}

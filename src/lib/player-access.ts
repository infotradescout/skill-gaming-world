import type {
  DemoSelfExclusion,
  DemoUser,
  DemoUserStatus,
} from "./demo-store";

export type DemoProductMode =
  | "MONETAIRE_PLAY"
  | "MONETAIRE_PRIZE"
  | "SOCIAL_CASINO"
  | "REAL_MONEY_CASINO";

export type PlayerAccessReasonCode =
  | "ACCOUNT_CLOSED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_COOLDOWN"
  | "SELF_EXCLUDED"
  | "RESTRICTION_STATE_INCOMPLETE";

export interface DemoPlayerAccessDecision {
  readonly allowed: boolean;
  readonly mode: DemoProductMode;
  readonly accountStatus: DemoUserStatus;
  readonly reasonCodes: readonly PlayerAccessReasonCode[];
  readonly decidedAtServerMs: number;
}

export function effectivePlayerAccountStatus(
  user: Readonly<DemoUser>,
  serverAtMs: number,
): DemoUserStatus {
  if (user.status !== "COOLDOWN" || user.cooldownUntil === undefined) {
    return user.status;
  }
  const cooldownUntilMs = Date.parse(user.cooldownUntil);
  return Number.isFinite(cooldownUntilMs) && cooldownUntilMs <= serverAtMs
    ? "ACTIVE"
    : user.status;
}

function exclusionBlocksMode(
  exclusion: DemoSelfExclusion,
  mode: DemoProductMode,
): boolean {
  if (exclusion.scope === "ALL_PRODUCTS") {
    return true;
  }
  if (
    exclusion.scope === "SKILL_GAMING_WORLD" &&
    (mode === "MONETAIRE_PLAY" || mode === "MONETAIRE_PRIZE")
  ) {
    return true;
  }
  return (
    exclusion.scope === "CASINO" &&
    (mode === "SOCIAL_CASINO" || mode === "REAL_MONEY_CASINO")
  );
}

function isActiveExclusion(
  exclusion: DemoSelfExclusion,
  serverAtMs: number,
): boolean {
  const startsAtMs = Date.parse(exclusion.startsAt);
  if (!Number.isFinite(startsAtMs)) {
    return true;
  }
  if (startsAtMs > serverAtMs) {
    return false;
  }
  if (exclusion.permanent || exclusion.endsAt === undefined) {
    return true;
  }
  const endsAtMs = Date.parse(exclusion.endsAt);
  // Malformed restriction data fails closed instead of silently expiring.
  return !Number.isFinite(endsAtMs) || endsAtMs > serverAtMs;
}

/**
 * Canonical restriction decision for demo product access. Account state,
 * restriction scope, and server time are evaluated together so a Casino-only
 * exclusion cannot leak into Monetaire and expired cooldowns do not stay active.
 */
export function evaluateDemoPlayerAccess(input: {
  readonly user: Readonly<DemoUser>;
  readonly mode: DemoProductMode;
  readonly exclusions: readonly Readonly<DemoSelfExclusion>[];
  readonly serverAtMs: number;
}): Readonly<DemoPlayerAccessDecision> {
  if (
    !Number.isSafeInteger(input.serverAtMs) ||
    input.serverAtMs < 0
  ) {
    throw new Error("INVALID_SERVER_ACCESS_TIME");
  }

  const reasons: PlayerAccessReasonCode[] = [];
  const accountStatus = effectivePlayerAccountStatus(
    input.user,
    input.serverAtMs,
  );
  if (accountStatus === "CLOSED") {
    reasons.push("ACCOUNT_CLOSED");
  }
  if (accountStatus === "SUSPENDED") {
    reasons.push("ACCOUNT_SUSPENDED");
  }
  if (accountStatus === "COOLDOWN") {
    const cooldownUntilMs =
      input.user.cooldownUntil === undefined
        ? Number.NaN
        : Date.parse(input.user.cooldownUntil);
    if (
      !Number.isFinite(cooldownUntilMs) ||
      cooldownUntilMs > input.serverAtMs
    ) {
      reasons.push("ACCOUNT_COOLDOWN");
    }
  }

  const userExclusions = input.exclusions.filter(
    (exclusion) => exclusion.userId === input.user.id,
  );
  const blockedByExclusion = userExclusions.some(
    (exclusion) =>
      isActiveExclusion(exclusion, input.serverAtMs) &&
      exclusionBlocksMode(exclusion, input.mode),
  );
  if (blockedByExclusion) {
    reasons.push("SELF_EXCLUDED");
  } else if (
    input.user.status === "SELF_EXCLUDED" &&
    userExclusions.length === 0
  ) {
    reasons.push("RESTRICTION_STATE_INCOMPLETE");
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    mode: input.mode,
    accountStatus,
    reasonCodes: Object.freeze(reasons),
    decidedAtServerMs: input.serverAtMs,
  });
}

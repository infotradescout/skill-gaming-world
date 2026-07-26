import { AdminRole } from "./admin-audit";
import {
  isCasinoMode,
  isSkillGamingWorldMode,
  ProductMode,
} from "./product-modes";
import {
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
} from "./shared";

export type SelfExclusionScope =
  | "ALL_PRODUCTS"
  | "SKILL_GAMING_WORLD"
  | "CASINO";

export interface SelfExclusion {
  readonly exclusionId: string;
  readonly userId: string;
  readonly scope: SelfExclusionScope;
  readonly startsAtServerMs: number;
  readonly endsAtServerMs: number | null;
  readonly recordedBy:
    | { readonly type: "USER"; readonly userId: string }
    | {
        readonly type: "ADMIN";
        readonly actorId: string;
        readonly role: "COMPLIANCE_ADMIN" | "SUPER_ADMIN";
      };
  readonly reason: string;
}

export type AccountRestriction =
  | {
      readonly type: "COOLDOWN";
      readonly startsAtServerMs: number;
      readonly endsAtServerMs: number;
    }
  | {
      readonly type: "ACCOUNT_CLOSED";
      readonly startsAtServerMs: number;
    }
  | {
      readonly type: "COMPLIANCE_HOLD";
      readonly startsAtServerMs: number;
      readonly endsAtServerMs: number | null;
      readonly reference: string;
    };

export function createSelfExclusion(input: {
  readonly exclusionId: string;
  readonly userId: string;
  readonly scope: SelfExclusionScope;
  readonly startsAtServerMs: number;
  readonly endsAtServerMs: number | null;
  readonly recordedBy:
    | { readonly type: "USER"; readonly userId: string }
    | {
        readonly type: "ADMIN";
        readonly actorId: string;
        readonly role: AdminRole;
      };
  readonly reason: string;
}): Readonly<SelfExclusion> {
  const userId = requireNonEmpty(input.userId, "userId");
  if (
    input.scope !== "ALL_PRODUCTS" &&
    input.scope !== "SKILL_GAMING_WORLD" &&
    input.scope !== "CASINO"
  ) {
    throw new DomainError(
      "INVALID_EXCLUSION_SCOPE",
      "Self-exclusion scope is invalid",
    );
  }
  requireNonNegativeInteger(
    input.startsAtServerMs,
    "startsAtServerMs",
  );
  if (input.endsAtServerMs !== null) {
    requireNonNegativeInteger(input.endsAtServerMs, "endsAtServerMs");
    if (input.endsAtServerMs <= input.startsAtServerMs) {
      throw new DomainError(
        "INVALID_EXCLUSION_WINDOW",
        "Exclusion end must be after its start",
      );
    }
  }

  if (input.recordedBy.type === "USER") {
    if (input.recordedBy.userId !== userId) {
      throw new DomainError(
        "EXCLUSION_USER_MISMATCH",
        "A user can only self-exclude their own account",
      );
    }
  } else if (
    input.recordedBy.role !== "COMPLIANCE_ADMIN" &&
    input.recordedBy.role !== "SUPER_ADMIN"
  ) {
    throw new DomainError(
      "SELF_EXCLUSION_AUTHORITY_REQUIRED",
      "Ordinary support staff cannot alter self-exclusion",
    );
  } else {
    requireNonEmpty(input.recordedBy.actorId, "actorId");
  }

  return deepFreeze({
    exclusionId: requireNonEmpty(input.exclusionId, "exclusionId"),
    userId,
    scope: input.scope,
    startsAtServerMs: input.startsAtServerMs,
    endsAtServerMs: input.endsAtServerMs,
    recordedBy: input.recordedBy,
    reason: requireNonEmpty(input.reason, "reason"),
  }) as Readonly<SelfExclusion>;
}

function scopeBlocksMode(
  scope: SelfExclusionScope,
  mode: ProductMode,
): boolean {
  return (
    scope === "ALL_PRODUCTS" ||
    (scope === "SKILL_GAMING_WORLD" && isSkillGamingWorldMode(mode)) ||
    (scope === "CASINO" && isCasinoMode(mode))
  );
}

export function isSelfExcludedFromMode(
  exclusions: readonly Readonly<SelfExclusion>[],
  mode: ProductMode,
  serverAtMs: number,
): boolean {
  requireNonNegativeInteger(serverAtMs, "serverAtMs");
  return exclusions.some(
    (exclusion) =>
      serverAtMs >= exclusion.startsAtServerMs &&
      (exclusion.endsAtServerMs === null ||
        serverAtMs < exclusion.endsAtServerMs) &&
      scopeBlocksMode(exclusion.scope, mode),
  );
}

export function hasActiveAccountRestriction(
  restrictions: readonly Readonly<AccountRestriction>[],
  serverAtMs: number,
): boolean {
  requireNonNegativeInteger(serverAtMs, "serverAtMs");
  return restrictions.some((restriction) => {
    if (serverAtMs < restriction.startsAtServerMs) {
      return false;
    }
    if (restriction.type === "ACCOUNT_CLOSED") {
      return true;
    }
    return (
      restriction.endsAtServerMs === null ||
      serverAtMs < restriction.endsAtServerMs
    );
  });
}

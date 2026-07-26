import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { selfExclusions } from "@/db/schema";

import type { DemoSelfExclusion, DemoUser } from "./demo-store";
import { getDemoStore } from "./demo-store";
import { getRuntimeEnv } from "./env";
import {
  evaluateDemoPlayerAccess,
  type DemoPlayerAccessDecision,
} from "./player-access";

export type RuntimeEligibilitySnapshot = {
  decisionsAreIndependent: true;
  environment: "safe-demo" | "configured";
  accountStatus: DemoPlayerAccessDecision["accountStatus"];
  monetairePlay: {
    decision: "ALLOW" | "DENY";
    environment: "safe-demo" | "configured";
    accountStatus: DemoPlayerAccessDecision["accountStatus"];
    reasonCodes: readonly string[];
  };
  skillPrizeVerification: {
    status: "NOT_STARTED";
    decision: "DENY";
    accountStatus: DemoPlayerAccessDecision["accountStatus"];
    reasonCodes: readonly string[];
  };
  casinoVerification: {
    status: "NOT_STARTED";
    decision: "DENY";
    accountStatus: DemoPlayerAccessDecision["accountStatus"];
    reasonCodes: readonly string[];
  };
};

function restrictionScope(value: string): DemoSelfExclusion["scope"] {
  if (
    value === "ALL_PRODUCTS" ||
    value === "SKILL_GAMING_WORLD" ||
    value === "CASINO"
  ) {
    return value;
  }
  return "ALL_PRODUCTS";
}

async function runtimeSelfExclusions(
  userId: string,
): Promise<readonly DemoSelfExclusion[]> {
  if (getRuntimeEnv().DEMO_MODE) {
    return getDemoStore().selfExclusions.filter(
      (exclusion) => exclusion.userId === userId,
    );
  }
  const records = await getDatabase()
    .select()
    .from(selfExclusions)
    .where(eq(selfExclusions.userId, userId));
  return records.map((record) => ({
    id: record.id,
    userId: record.userId,
    scope: restrictionScope(record.scope),
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString(),
    permanent: record.permanent,
    removalPolicy: "COMPLIANCE_REVIEW_ONLY",
  }));
}

export async function runtimeEligibilitySnapshot(
  user: Readonly<DemoUser>,
  serverAtMs = Date.now(),
): Promise<RuntimeEligibilitySnapshot> {
  const env = getRuntimeEnv();
  const exclusions = await runtimeSelfExclusions(user.id);
  const monetaireAccess = evaluateDemoPlayerAccess({
    user,
    mode: "MONETAIRE_PLAY",
    exclusions,
    serverAtMs,
  });
  const skillPrizeAccess = evaluateDemoPlayerAccess({
    user,
    mode: "MONETAIRE_PRIZE",
    exclusions,
    serverAtMs,
  });
  const casinoAccess = evaluateDemoPlayerAccess({
    user,
    mode: "REAL_MONEY_CASINO",
    exclusions,
    serverAtMs,
  });
  const environment = env.DEMO_MODE ? "safe-demo" : "configured";

  return {
    decisionsAreIndependent: true,
    environment,
    accountStatus: monetaireAccess.accountStatus,
    monetairePlay: {
      decision: monetaireAccess.allowed ? "ALLOW" : "DENY",
      environment,
      accountStatus: monetaireAccess.accountStatus,
      reasonCodes: monetaireAccess.reasonCodes,
    },
    skillPrizeVerification: {
      status: "NOT_STARTED",
      decision: "DENY",
      accountStatus: skillPrizeAccess.accountStatus,
      reasonCodes: [
        "FEATURE_DISABLED",
        "LOCATION_NOT_VERIFIED",
        ...skillPrizeAccess.reasonCodes,
      ],
    },
    casinoVerification: {
      status: "NOT_STARTED",
      decision: "DENY",
      accountStatus: casinoAccess.accountStatus,
      reasonCodes: [
        "FEATURE_DISABLED",
        "CASINO_VERIFICATION_REQUIRED",
        "LOCATION_NOT_VERIFIED",
        ...casinoAccess.reasonCodes,
      ],
    },
  };
}

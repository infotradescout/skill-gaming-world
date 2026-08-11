import { getDatabase } from "@/db/client";

import type { DemoUser } from "./demo-store";
import { getDemoStore } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { evaluateConfiguredMonetairePlayAuthorization } from "./configured-jurisdiction";
import { persistentPlayerAccessSnapshot } from "./persistent-player-access";
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

export async function runtimeEligibilitySnapshot(
  user: Readonly<DemoUser>,
  serverAtMs = Date.now(),
): Promise<RuntimeEligibilitySnapshot> {
  const env = getRuntimeEnv();
  const accessSnapshot = env.DEMO_MODE
    ? {
        user,
        exclusions: getDemoStore().selfExclusions.filter(
          (exclusion) => exclusion.userId === user.id,
        ),
        serverAtMs,
      }
    : await getDatabase().transaction((transaction) =>
        persistentPlayerAccessSnapshot(transaction, user),
      );
  const monetaireAccess = evaluateDemoPlayerAccess({
    user: accessSnapshot.user,
    mode: "MONETAIRE_PLAY",
    exclusions: accessSnapshot.exclusions,
    serverAtMs: accessSnapshot.serverAtMs,
  });
  const skillPrizeAccess = evaluateDemoPlayerAccess({
    user: accessSnapshot.user,
    mode: "MONETAIRE_PRIZE",
    exclusions: accessSnapshot.exclusions,
    serverAtMs: accessSnapshot.serverAtMs,
  });
  const casinoAccess = evaluateDemoPlayerAccess({
    user: accessSnapshot.user,
    mode: "REAL_MONEY_CASINO",
    exclusions: accessSnapshot.exclusions,
    serverAtMs: accessSnapshot.serverAtMs,
  });
  const environment = env.DEMO_MODE ? "safe-demo" : "configured";
  const deploymentAuthorization = env.DEMO_MODE
    ? null
    : evaluateConfiguredMonetairePlayAuthorization(env);
  const monetaireAllowed =
    monetaireAccess.allowed &&
    (deploymentAuthorization?.allowed ?? true);
  const monetaireReasonCodes = deploymentAuthorization?.allowed === false
    ? [...new Set([
        ...monetaireAccess.reasonCodes,
        deploymentAuthorization.reasonCode,
      ])]
    : monetaireAccess.reasonCodes;

  return {
    decisionsAreIndependent: true,
    environment,
    accountStatus: monetaireAccess.accountStatus,
    monetairePlay: {
      decision: monetaireAllowed ? "ALLOW" : "DENY",
      environment,
      accountStatus: monetaireAccess.accountStatus,
      reasonCodes: monetaireReasonCodes,
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

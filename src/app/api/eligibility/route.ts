import { NextRequest, NextResponse } from "next/server";

import { currentRuntimeUser } from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import { jsonError, requestId } from "@/lib/http";
import { evaluateDemoPlayerAccess } from "@/lib/player-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }

  const serverAtMs = Date.now();
  const exclusions = getDemoStore().selfExclusions;
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

  return NextResponse.json({
    decisionsAreIndependent: true,
    accountStatus: user.status,
    monetairePlay: {
      decision: monetaireAccess.allowed ? "ALLOW" : "DENY",
      environment: "safe-demo",
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
  });
}

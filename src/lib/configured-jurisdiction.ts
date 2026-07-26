import { randomUUID } from "node:crypto";

import { getDatabase } from "@/db/client";
import { jurisdictionDecisions } from "@/db/schema";

import type { DemoUser } from "./demo-store";
import { getRuntimeEnv } from "./env";

export async function authorizeConfiguredMonetairePlay(
  user: DemoUser,
  requestId: string,
): Promise<boolean> {
  const env = getRuntimeEnv();
  const jurisdiction = env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION;
  const allowed =
    Boolean(jurisdiction) &&
    env.MONETAIRE_PLAY_JURISDICTIONS.includes(jurisdiction);
  await getDatabase().insert(jurisdictionDecisions).values({
    userId: user.id,
    productMode: "MONETAIRE_PLAY",
    decision: allowed ? "ALLOW" : "DENY",
    jurisdictionCode: jurisdiction || null,
    ruleVersion: "MONETAIRE_PLAY_PRIVATE_PREVIEW_V1",
    locationEvidenceStatus: jurisdiction ? "APPROVED" : "NOT_STARTED",
    reasonCodes: allowed
      ? ["DEPLOYMENT_JURISDICTION_ALLOWLIST"]
      : ["DEPLOYMENT_JURISDICTION_NOT_ALLOWED"],
    requestId: `${requestId}:${randomUUID()}`,
  });
  return allowed;
}

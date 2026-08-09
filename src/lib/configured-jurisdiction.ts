import { randomUUID } from "node:crypto";

import { getDatabase } from "@/db/client";
import { jurisdictionDecisions } from "@/db/schema";

import type { DemoUser } from "./demo-store";
import { getRuntimeEnv, type RuntimeEnv } from "./env";
import { evaluateInitialOperationGate } from "./operation-gates";

export type MonetairePlayAuthorization = {
  allowed: boolean;
  jurisdictionCode: string | null;
  reasonCode: string;
  jurisdictionDecisionId: string | null;
};

export function jurisdictionDecisionRequestId(
  requestId: string,
  nonce = randomUUID(),
): string {
  const suffix = `:${nonce}`;
  const prefixLength = Math.max(0, 128 - suffix.length);
  return `${requestId.slice(0, prefixLength)}${suffix}`;
}

export function evaluateConfiguredMonetairePlayAuthorization(
  env: Pick<
    RuntimeEnv,
    | "MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION"
    | "MONETAIRE_PLAY_JURISDICTIONS"
  >,
): MonetairePlayAuthorization {
  const jurisdiction = env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION;
  const allowed =
    Boolean(jurisdiction) &&
    env.MONETAIRE_PLAY_JURISDICTIONS.includes(jurisdiction);

  return {
    allowed,
    jurisdictionCode: jurisdiction || null,
    reasonCode: allowed
      ? "DEPLOYMENT_JURISDICTION_ALLOWLIST"
      : "DEPLOYMENT_JURISDICTION_NOT_ALLOWED",
    jurisdictionDecisionId: null,
  };
}

export async function authorizeConfiguredMonetairePlay(
  user: DemoUser,
  requestId: string,
): Promise<MonetairePlayAuthorization> {
  const env = getRuntimeEnv();
  const authorization = evaluateConfiguredMonetairePlayAuthorization(env);
  const [decision] = await getDatabase()
    .insert(jurisdictionDecisions)
    .values({
      userId: user.id,
      productMode: "MONETAIRE_PLAY",
      decision: authorization.allowed ? "ALLOW" : "DENY",
      jurisdictionCode: authorization.jurisdictionCode,
      ruleVersion: "MONETAIRE_PLAY_PRIVATE_PREVIEW_V1",
      locationEvidenceStatus: authorization.jurisdictionCode
        ? "APPROVED"
        : "NOT_STARTED",
      reasonCodes: [authorization.reasonCode],
      requestId: jurisdictionDecisionRequestId(requestId),
    })
    .returning({ id: jurisdictionDecisions.id });
  if (!decision) throw new Error("JURISDICTION_DECISION_NOT_RECORDED");
  return { ...authorization, jurisdictionDecisionId: decision.id };
}

/**
 * The sole Monetaire Play authorization entry point for session-creating routes.
 * Safe demo play remains governed by its compiled operation gate; configured
 * play always records a request-specific allow/deny jurisdiction decision.
 */
export async function authorizeMonetairePlay(
  user: DemoUser,
  requestId: string,
): Promise<MonetairePlayAuthorization> {
  const env = getRuntimeEnv();
  if (env.DEMO_MODE) {
    const gate = evaluateInitialOperationGate("mode.monetaire_play", env);
    return {
      allowed: gate.decision === "ALLOW",
      jurisdictionCode: null,
      reasonCode: gate.reason,
      jurisdictionDecisionId: null,
    };
  }
  return authorizeConfiguredMonetairePlay(user, requestId);
}

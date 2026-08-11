import { describe, expect, it } from "vitest";

import {
  evaluateConfiguredMonetairePlayAuthorization,
  jurisdictionDecisionRequestId,
} from "./configured-jurisdiction";

describe("configured Monetaire jurisdiction authorization", () => {
  it("fails closed when the deployment jurisdiction is missing or not allowlisted", () => {
    expect(
      evaluateConfiguredMonetairePlayAuthorization({
        MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION: "",
        MONETAIRE_PLAY_JURISDICTIONS: ["US"],
      }),
    ).toMatchObject({
      allowed: false,
      jurisdictionCode: null,
      reasonCode: "DEPLOYMENT_JURISDICTION_NOT_ALLOWED",
    });
    expect(
      evaluateConfiguredMonetairePlayAuthorization({
        MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION: "CA",
        MONETAIRE_PLAY_JURISDICTIONS: ["US"],
      }).allowed,
    ).toBe(false);
  });

  it("allows only the configured deployment jurisdiction in the allowlist", () => {
    expect(
      evaluateConfiguredMonetairePlayAuthorization({
        MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION: "US",
        MONETAIRE_PLAY_JURISDICTIONS: ["US"],
      }),
    ).toMatchObject({
      allowed: true,
      jurisdictionCode: "US",
      reasonCode: "DEPLOYMENT_JURISDICTION_ALLOWLIST",
    });
  });

  it("bounds a client request id while preserving server-generated entropy", () => {
    const nonce = "00000000-0000-4000-8000-000000000001";
    const stored = jurisdictionDecisionRequestId("r".repeat(128), nonce);

    expect(stored).toHaveLength(128);
    expect(stored.endsWith(`:${nonce}`)).toBe(true);
    expect(stored.slice(0, 91)).toBe("r".repeat(91));
  });
});

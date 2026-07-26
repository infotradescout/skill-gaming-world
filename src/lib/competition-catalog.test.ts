import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  closeDemoCompetitionAndReveal,
  competitionPublicationEvidence,
  getCuratedCompetitionBundle,
  publicCompetitionSnapshot,
  resetCompetitionCatalogForTests,
} from "./competition-catalog";
import { resetDemoStoreForTests } from "./demo-store";

beforeEach(() => {
  process.env.DEMO_MODE = "true";
  process.env.SESSION_SECRET =
    "catalog-test-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "catalog-test-ranked-seed-key-at-least-32-characters";
  resetDemoStoreForTests();
  resetCompetitionCatalogForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("safe-demo ranked publication adapter", () => {
  it("creates one random encrypted publication and reuses its immutable contract", () => {
    const first = getCuratedCompetitionBundle();
    const evidence = competitionPublicationEvidence();
    const second = getCuratedCompetitionBundle();

    expect(second.deal.commitment).toBe(first.deal.commitment);
    expect(second.publicationCommitment).toBe(first.publicationCommitment);
    expect(evidence.cipher).toBe("AES_256_GCM");
    expect(evidence.demoOnly).toBe(true);
    expect(evidence.lifecycle.map((event) => event.type)).toEqual([
      "DEAL_VALIDATED",
      "COMPETITION_PUBLISHED",
      "COMPETITION_ACTIVATED",
    ]);
    expect(evidence.publicationCommitment).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.dealCommitment).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.validationEvidenceReference).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(evidence.lifecycle[0].atServerMs).toBe(
      evidence.validatedAtServerMs,
    );
    expect(Object.keys(evidence)).not.toEqual(
      expect.arrayContaining([
        "authTag",
        "ciphertext",
        "encryptionKeyFingerprint",
        "iv",
        "seed",
        "revealNonce",
      ]),
    );
  });

  it("fails closed without the dedicated ranked-material key", () => {
    delete process.env.COMPETITION_SEED_ENCRYPTION_KEY;
    resetCompetitionCatalogForTests();

    expect(() => getCuratedCompetitionBundle()).toThrow(
      "RANKED_COMPETITION_KEY_REQUIRED",
    );
  });

  it("does not silently replace a publication after key rotation", () => {
    getCuratedCompetitionBundle();
    process.env.COMPETITION_SEED_ENCRYPTION_KEY =
      "rotated-ranked-seed-key-at-least-32-characters";

    expect(() => getCuratedCompetitionBundle()).toThrow(
      "RANKED_COMPETITION_KEY_ROTATION_REQUIRES_REPUBLICATION",
    );
  });

  it("fails closed when authenticated publication metadata is replaced", () => {
    getCuratedCompetitionBundle();
    const state = globalThis.__monetaireCompetitionCatalogState;
    if (!state?.publication) {
      throw new Error("Expected a publication record.");
    }
    state.publication = {
      ...state.publication,
      closesAtServerMs: state.publication.closesAtServerMs + 1,
    };

    expect(() => getCuratedCompetitionBundle()).toThrow(
      "RANKED_COMPETITION_PUBLICATION_DECRYPTION_FAILED",
    );
  });

  it("fails closed when encrypted ranked material is modified", () => {
    getCuratedCompetitionBundle();
    const state = globalThis.__monetaireCompetitionCatalogState;
    if (!state?.publication) {
      throw new Error("Expected a publication record.");
    }
    const replacement =
      state.publication.ciphertext[0] === "A" ? "B" : "A";
    state.publication = {
      ...state.publication,
      ciphertext:
        replacement + state.publication.ciphertext.slice(1),
    };

    expect(() => getCuratedCompetitionBundle()).toThrow(
      "RANKED_COMPETITION_PUBLICATION_DECRYPTION_FAILED",
    );
  });

  it("appends one verifiable close/reveal record after the published window", () => {
    const evidence = competitionPublicationEvidence();
    expect(() => closeDemoCompetitionAndReveal()).toThrow(
      "Seed cannot be revealed before the competition closes",
    );
    vi.useFakeTimers();
    vi.setSystemTime(evidence.closesAtServerMs);
    const reveal = closeDemoCompetitionAndReveal();
    vi.setSystemTime(evidence.closesAtServerMs + 10_000);
    const exactRetry = closeDemoCompetitionAndReveal();
    const snapshot = publicCompetitionSnapshot();

    expect(exactRetry).toEqual(reveal);
    expect(reveal.publicationCommitment).toBe(
      evidence.publicationCommitment,
    );
    expect(reveal.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.status).toBe("CLOSED");
    expect(snapshot.seedReveal).toBe(reveal.seed);
    expect(snapshot.revealNonce).toBe(reveal.revealNonce);
    expect(getCuratedCompetitionBundle().competition.status).toBe(
      "CLOSED",
    );
  });
});

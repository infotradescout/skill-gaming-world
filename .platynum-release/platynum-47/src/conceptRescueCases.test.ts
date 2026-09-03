/** @vitest-environment node */
/**
 * Concept Rescue — two additional diverse proof cases beyond Steady Paws.
 *
 * Case 2: raw idea / pitch-deck-style artifact ("NovaDesk", synthetic SaaS pitch).
 * Case 3: repository / technical artifact ("QueueForge", synthetic README).
 *
 * These assertions describe ACTUAL observed runtime behavior, including known gaps.
 * Where the runtime under-detects or over-generalizes, the assertion documents that
 * real behavior rather than asserting the "should be" behavior — see
 * .selective-intelligence/concept-rescue-additional-cases-evidence.md for the honest
 * write-up, decision gates, and challenge-review pass.
 */
import { describe, expect, it } from "vitest";
import {
  CASE2_DECK_ARTIFACT,
  CASE2_USER_TEXT,
  CASE3_REPO_ARTIFACT,
  CASE3_USER_TEXT,
} from "./conceptRescueCases.fixtures.ts";
import { detectContradictions, runConceptRescue } from "./conceptRescue.ts";

describe("Concept Rescue — Case 2 (raw idea / pitch-deck artifact, NovaDesk fixture)", () => {
  it("still blocks premature build even though relationship classification degrades on paraphrase", () => {
    const result = runConceptRescue({ userText: CASE2_USER_TEXT, artifactText: CASE2_DECK_ARTIFACT });

    // Safe default holds regardless of relationship classification quality.
    expect(result.prematureBuildBlocked).toBe(true);
    expect(result.normalizedContext.artifactOwnership).toBe("third_party");
    expect(result.normalizedContext.buildAuthorized).toBe(false);
    expect(result.normalizedContext.commercialReuseAuthorized).toBe(false);

    // KNOWN GAP (see evidence doc "Case 2 — honest failures"): the helper/advisor
    // regex in normalizeContextFromInput only matches literal phrasing ("help the
    // creator", "advisor", "validate"). "I want to help whoever is behind it" does
    // not match, so relationship/intent fall through to "unknown" instead of
    // helper_or_advisor / help_original_creator, even though a human reader would
    // classify this as helper intent immediately.
    expect(result.normalizedContext.userRelationship).toBe("unknown");
    expect(result.normalizedContext.primaryIntent).toBe("unknown");
  });

  it("detects seven of the artifact's planted issues via generic content patterns (not Steady-Paws-specific)", () => {
    const hits = detectContradictions(CASE2_DECK_ARTIFACT);
    const ids = hits.map((h) => h.ruleId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "CR-PRICE-01",
        "CR-LEN-01",
        "CR-CRED-01",
        "CR-STAT-01",
        "CR-TEST-01",
        "CR-DELIV-01",
        "CR-TERM-01",
      ]),
    );
    expect(hits).toHaveLength(7);

    // KNOWN GAP: the deck's own placeholder marker ("[ Insert TAM/SAM/SOM chart
    // here ]") is NOT caught. CR-PLACE-01 only matches the literal substrings
    // "graph here" / "insert chart" / "{graph}" / "lorem ipsum" — a paraphrased
    // placeholder slips through.
    expect(ids).not.toContain("CR-PLACE-01");
  });

  it("produces a Track A creator package that is still the static Steady Paws template, not artifact-derived", () => {
    const result = runConceptRescue({ userText: CASE2_USER_TEXT, artifactText: CASE2_DECK_ARTIFACT });
    // KNOWN GAP (headline finding — see evidence doc): buildTrackA() in
    // conceptRescue.ts returns hard-coded senior-dog / traction-product copy
    // regardless of the artifact actually diagnosed. Only criticalContradictions,
    // evidenceGaps-by-category, and the recommendation verdict vary by input;
    // valuablePremise / offerHypotheses / sevenDaySequence / creatorFacingMessage
    // do not. This assertion pins that current (wrong-for-this-artifact) behavior
    // so a future generalization fix is visible as an intentional test change.
    expect(result.trackA.valuablePremise).toMatch(/senior or mobility-challenged dogs/i);
    expect(result.trackA.offerHypotheses.join(" ")).toMatch(/traction/i);
  });

  it("recommends revise at 7 surfaced issues (count-based threshold, not severity-weighted)", () => {
    const result = runConceptRescue({ userText: CASE2_USER_TEXT, artifactText: CASE2_DECK_ARTIFACT });
    expect(result.trackA.recommendation).toBe("revise");
    expect(result.buildStage).toBe("unfinished_proof_of_concept");
  });
});

describe("Concept Rescue — Case 3 (repository / technical artifact, QueueForge fixture)", () => {
  it("still blocks premature build even though relationship classification degrades on paraphrase", () => {
    const result = runConceptRescue({ userText: CASE3_USER_TEXT, artifactText: CASE3_REPO_ARTIFACT });
    expect(result.prematureBuildBlocked).toBe(true);
    expect(result.normalizedContext.artifactOwnership).toBe("third_party");
    expect(result.normalizedContext.buildAuthorized).toBe(false);

    // Same known gap as Case 2: "help the maintainer see what's overclaimed" does
    // not match the narrow helper regex.
    expect(result.normalizedContext.userRelationship).toBe("unknown");
    expect(result.normalizedContext.primaryIntent).toBe("unknown");
  });

  it("detects four generic issues but misses every repo-specific (declared-vs-actual) contradiction", () => {
    const hits = detectContradictions(CASE3_REPO_ARTIFACT);
    const ids = hits.map((h) => h.ruleId);
    expect(ids).toEqual(
      expect.arrayContaining(["CR-PRICE-01", "CR-LEN-01", "CR-CRED-01", "CR-TEST-01"]),
    );
    expect(hits).toHaveLength(4);

    // KNOWN GAPS — none of these have a corresponding rule in DETECTORS (see
    // .selective-intelligence/concept-rescue-package.md §2.6, which has no rule
    // for "declared status vs. actual repo state"):
    //   - "v1.0.0 (stable)" heading contradicts package.json "0.0.1-alpha" in the
    //     same artifact — a version-truth contradiction, structurally identical in
    //     spirit to CR-LEN-01 but about software state, not program length.
    //   - "CI badge: passing" with "no CI workflow file present" — a false
    //     completeness signal, conceptually close to CR-VIS-01 (visual completion
    //     presented as production readiness) but CR-VIS-01 is not implemented as a
    //     content detector in this runtime at all.
    //   - "99.99% uptime SLA" and "Fortune 500 companies rely on" are unverified
    //     stats / social proof, but CR-STAT-01's regex only matches
    //     "beta X%" / "X% of users|dogs|pets|customers" / "n=X" — an SLA-style
    //     percentage and a named-tier social-proof claim do not match.
    //   - "insert benchmark chart here" (under TODO) is a placeholder, but
    //     CR-PLACE-01 only matches the literal substring "insert chart", not
    //     "insert benchmark chart here".
    expect(ids).not.toContain("CR-PLACE-01");
    expect(ids).not.toContain("CR-STAT-01");
  });

  it("recommends revise at exactly the 4-issue threshold (see challenge review in evidence doc)", () => {
    const result = runConceptRescue({ userText: CASE3_USER_TEXT, artifactText: CASE3_REPO_ARTIFACT });
    expect(result.trackA.recommendation).toBe("revise");
    expect(result.trackA.recommendationRationale).toMatch(/Surfaced 4 issues/);
    // ContradictionHit has no severity field in this runtime (spec §2.4 calls for
    // one on the logical Contradiction model). The revise/pause split in
    // buildTrackA() is therefore a raw count threshold, not severity-weighted —
    // this is exactly what the challenge-review pass in the evidence doc argues
    // against for this case.
  });
});


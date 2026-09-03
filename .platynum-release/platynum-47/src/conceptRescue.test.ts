/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import {
  CONCEPT_RESCUE_AMBIGUOUS_INPUT,
  CONCEPT_RESCUE_CORRECTION_INPUT,
  CONCEPT_RESCUE_FIXTURE_ARTIFACT,
  CONCEPT_RESCUE_REQUIRED_INPUT,
} from "./conceptRescue.fixture.ts";
import {
  REQUIRED_HELPER_CONTEXT,
  detectContradictions,
  isConceptRescueIntent,
  markLocalFlowProven,
  normalizeContextFromInput,
  prematureBuildBlocked,
  runConceptRescue,
} from "./conceptRescue.ts";
import {
  bindSiCheckpoint,
  canExecuteSideEffects,
  continuePastIntentGate,
  dislikeCheckpoint,
  isApprovalPending,
  queueSideEffect,
  startRunWithIntent,
  submitCorrection,
} from "./steering.ts";
import { approveSession, interruptSession } from "./build.ts";

describe("Concept Rescue diagnosis (fixture content)", () => {
  it("normalizes required helper context without assuming ownership", () => {
    const ctx = normalizeContextFromInput(CONCEPT_RESCUE_REQUIRED_INPUT);
    expect(ctx.artifactOwnership).toBe("third_party");
    expect(ctx.userRelationship).toBe("helper_or_advisor");
    expect(ctx.primaryIntent).toBe("help_original_creator");
    expect(ctx.secondaryIntent).toBe("derive_generalized_workflow");
    expect(ctx.commercialReuseAuthorized).toBe(false);
    expect(ctx.buildAuthorized).toBe(false);
    expect(isConceptRescueIntent(CONCEPT_RESCUE_REQUIRED_INPUT)).toBe(true);
  });

  it("retains dual intent and required normalized fields", () => {
    const result = runConceptRescue({
      userText: CONCEPT_RESCUE_REQUIRED_INPUT,
      artifactText: CONCEPT_RESCUE_FIXTURE_ARTIFACT,
    });
    expect(result.normalizedContext).toMatchObject({
      artifactOwnership: REQUIRED_HELPER_CONTEXT.artifactOwnership,
      userRelationship: REQUIRED_HELPER_CONTEXT.userRelationship,
      primaryIntent: REQUIRED_HELPER_CONTEXT.primaryIntent,
      secondaryIntent: REQUIRED_HELPER_CONTEXT.secondaryIntent,
      commercialReuseAuthorized: false,
      buildAuthorized: false,
    });
    expect(result.contextDisplay.notAuthorized.join(" ")).toMatch(/rebrand|funnel|checkout/i);
  });

  it("detects fixture contradictions from supplied content (not a global hard-coded verdict)", () => {
    const hits = detectContradictions(CONCEPT_RESCUE_FIXTURE_ARTIFACT);
    const ids = hits.map((h) => h.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["CR-LEN-01", "CR-PRICE-01", "CR-PLACE-01"]));
    expect(hits.some((h) => /Graph here/i.test(h.evidenceExcerpt) || h.ruleId === "CR-PLACE-01")).toBe(
      true,
    );
    expect(hits.some((h) => h.category === "unverified_stats")).toBe(true);
    expect(hits.some((h) => h.category === "regulated_claims")).toBe(true);
    expect(hits.some((h) => h.category === "commerce_terms")).toBe(true);
    expect(hits.some((h) => h.category === "vague_deliverables")).toBe(true);
    expect(hits.some((h) => h.category === "testimonials")).toBe(true);

    // Clean artifact should not inherit Steady-Paws-specific hard verdicts.
    const clean = detectContradictions("A one-line note about walking more with rugs.");
    expect(clean.length).toBe(0);
  });

  it("classifies stage unfinished_proof_of_concept without implying demand", () => {
    const result = runConceptRescue({
      userText: CONCEPT_RESCUE_REQUIRED_INPUT,
      artifactText: CONCEPT_RESCUE_FIXTURE_ARTIFACT,
    });
    expect(result.buildStage).toBe("unfinished_proof_of_concept");
    expect(result.buildStageEvidence.join(" ")).not.toMatch(/measured demand proven/i);
  });

  it("keeps unverified claims labelled and isolates Track A vs Track B", () => {
    const result = runConceptRescue({
      userText: CONCEPT_RESCUE_REQUIRED_INPUT,
      artifactText: CONCEPT_RESCUE_FIXTURE_ARTIFACT,
    });
    expect(result.statements.some((s) => s.grade === "creator_claim")).toBe(true);
    expect(result.statements.some((s) => s.grade === "user_context")).toBe(true);
    expect(result.statements.every((s) => s.grade !== "verified_fact" || /FIXTURE ONLY/i.test(s.text))).toBe(
      true,
    );
    expect(result.trackA.offerHypotheses).toHaveLength(3);
    expect(result.trackA.creatorFacingMessage).toMatch(/not take it over/i);
    expect(result.trackB.anonymizedLesson).not.toMatch(/Steady Paws/i);
    expect(result.trackB.ownershipIpGuardrails.join(" ")).toMatch(/Third-party/i);
  });

  it("blocks premature commercial builds before approval", () => {
    const result = runConceptRescue({
      userText: CONCEPT_RESCUE_REQUIRED_INPUT,
      artifactText: CONCEPT_RESCUE_FIXTURE_ARTIFACT,
      interpretationApproved: false,
    });
    expect(result.prematureBuildBlocked).toBe(true);
    expect(result.blockReasons.join(" ")).toMatch(/buildAuthorized/i);

    const stillBlocked = prematureBuildBlocked(result.normalizedContext, true, true);
    expect(stillBlocked.blocked).toBe(true);
  });
});

describe("Concept Rescue controlled correction (steering + SI wiring)", () => {
  it("interrupts ambiguous build intent, RETRACTs, re-gates, and invalidates stale build authority", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || "{}")) as {
        correction?: string;
        checkpointId?: string;
        intentHash?: string;
      };
      if (url.includes("/api/model/interrupt")) {
        const isSubmit = Boolean(body.correction && body.correction.length > 20);
        return {
          ok: true,
          json: async () => ({
            sessionId: "sess-cr-1",
            interruptedCheckpointId: body.checkpointId || "cp-1",
            operation: isSubmit ? "RETRACT" : "REPLACE",
            newCheckpoint: {
              checkpoint_id: isSubmit ? "cp-2" : "cp-1b",
              intent_hash: isSubmit ? "hash-2" : "hash-1b",
              intent_summary: isSubmit
                ? "Help the original creator validate; prove Concept Rescue; do not build a sales page."
                : "Ambiguous improve request",
              status: "proposed",
            },
            siCheckpointId: isSubmit ? "cp-2" : "cp-1b",
            siIntentHash: isSubmit ? "hash-2" : "hash-1b",
            resumeRequiresApproval: true,
            mutationFrozen: true,
            generationAuthority: false,
            executionLocked: true,
            claimScope: "si_session_state",
            note: "SI session-state interrupt",
          }),
        } as Response;
      }
      if (url.includes("/api/model/approve")) {
        if (body.checkpointId === "cp-1" || body.intentHash === "hash-1") {
          return {
            ok: false,
            json: async () => ({
              error: "stale checkpoint; only currentCheckpointId may be approved",
              code: "STALE_CHECKPOINT",
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            sessionId: "sess-cr-1",
            siCheckpointId: body.checkpointId,
            siIntentHash: body.intentHash,
            executionLocked: false,
            generationAuthority: true,
            claimScope: "si_session_state",
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Ambiguous first interpretation.
    let run = startRunWithIntent(
      CONCEPT_RESCUE_AMBIGUOUS_INPUT,
      "Create a better version of the referenced proof of concept (sales page).",
    );
    run = bindSiCheckpoint(run, "cp-1", "hash-1");
    expect(isApprovalPending(run)).toBe(true);
    expect(canExecuteSideEffects(run)).toBe(false);
    expect(queueSideEffect(run, "Generate sales page scaffold", true).blocked).toBe(true);

    // Correct → interrupt freeze
    const firstId = run.checkpoints[0]!.id;
    run = dislikeCheckpoint(run, firstId);
    await interruptSession("sess-cr-1", "nope", "cp-1");

    const corrected = await interruptSession(
      "sess-cr-1",
      CONCEPT_RESCUE_CORRECTION_INPUT,
      "cp-1",
    );
    expect(corrected.operation).toBe("RETRACT");
    expect(corrected.siCheckpointId).toBe("cp-2");
    expect(corrected.siIntentHash).toBe("hash-2");

    run = submitCorrection(
      run,
      firstId,
      CONCEPT_RESCUE_CORRECTION_INPUT,
      corrected.siCheckpointId,
      corrected.siIntentHash,
      corrected.operation,
    );

    expect(run.lastSiOperation).toBe("RETRACT");
    expect(run.siCheckpointId).toBe("cp-2");
    expect(isApprovalPending(run)).toBe(true);
    expect(canExecuteSideEffects(run)).toBe(false);
    expect(queueSideEffect(run, "Generate sales page scaffold", true).blocked).toBe(true);

    // Stale approval cannot authorize replacement work.
    await expect(approveSession("sess-cr-1", "cp-1", "hash-1")).rejects.toThrow(/stale checkpoint/i);

    // Diagnosis under corrected context still blocks commercial build.
    const rescue = runConceptRescue({
      userText: CONCEPT_RESCUE_CORRECTION_INPUT,
      artifactText: CONCEPT_RESCUE_FIXTURE_ARTIFACT,
      interpretationApproved: false,
    });
    expect(rescue.prematureBuildBlocked).toBe(true);
    expect(rescue.normalizedContext.artifactOwnership).toBe("third_party");

    // Approve current only — analysis allowed; buildAuthorized still false.
    const approved = await approveSession("sess-cr-1", "cp-2", "hash-2");
    run = bindSiCheckpoint(run, approved.siCheckpointId, approved.siIntentHash);
    run = continuePastIntentGate(run);
    expect(canExecuteSideEffects(run)).toBe(true);

    const afterApprove = runConceptRescue({
      userText: CONCEPT_RESCUE_CORRECTION_INPUT,
      artifactText: CONCEPT_RESCUE_FIXTURE_ARTIFACT,
      interpretationApproved: true,
      decisionId: "cr-decision-test",
      checkpointId: approved.siCheckpointId,
      intentHash: approved.siIntentHash,
    });
    expect(afterApprove.prematureBuildBlocked).toBe(true);
    expect(afterApprove.blockReasons.join(" ")).toMatch(/buildAuthorized/i);
    expect(afterApprove.audit.checkpointId).toBe("cp-2");
    expect(afterApprove.audit.intentHash).toBe("hash-2");
    expect(afterApprove.nextBestAction).toMatch(/validation|interview/i);

    const proven = markLocalFlowProven(afterApprove);
    expect(proven.statusVocabulary).toBe("Concept Rescue local flow-proven");
    expect(proven.statusVocabulary).not.toMatch(/production|cross-client|cross-model/i);

    vi.unstubAllGlobals();
  });
});


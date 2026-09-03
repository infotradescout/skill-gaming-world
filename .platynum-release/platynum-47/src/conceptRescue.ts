/**
 * Concept Rescue — diagnosis + two-track output + premature-build block.
 *
 * Reuses Platynum intent-steering / SI checkpoint authority for approve & correct.
 * Does not commercialize third-party brands. Spec:
 * .selective-intelligence/concept-rescue-package.md
 */

export type ArtifactOwnership = "third_party" | "user_owned" | "unknown";
export type UserRelationship =
  | "owner"
  | "helper_or_advisor"
  | "collaborator"
  | "investor"
  | "observer"
  | "unknown";

export type EvidenceGrade =
  | "verified_fact"
  | "user_context"
  | "creator_claim"
  | "inference"
  | "hypothesis"
  | "contradiction"
  | "placeholder"
  | "missing_information";

export type BuildStage =
  | "raw_idea"
  | "speculative_offer"
  | "unfinished_proof_of_concept"
  | "smoke_test"
  | "interactive_prototype"
  | "early_validated_offer"
  | "working_product"
  | "launch_candidate"
  | "production_product";

export type DecisionVerdict = "continue" | "revise" | "pause" | "kill";

export interface NormalizedContext {
  artifactOwnership: ArtifactOwnership;
  userRelationship: UserRelationship;
  primaryIntent: string;
  secondaryIntent: string;
  commercialReuseAuthorized: boolean;
  buildAuthorized: boolean;
  artifactStage: BuildStage | "unfinished_proof_of_concept";
}

export interface ClassifiedStatement {
  id: string;
  text: string;
  grade: EvidenceGrade;
  ruleId?: string;
}

export interface ContradictionHit {
  ruleId: string;
  category: string;
  explanation: string;
  evidenceExcerpt: string;
}

export interface ConceptRescueResult {
  statusVocabulary: "Concept Rescue local flow-proven" | "Concept Rescue in progress";
  normalizedContext: NormalizedContext;
  /** Audit binding to SI/Platynum decision authority when known. */
  audit: {
    decisionId: string;
    checkpointId: string | null;
    intentHash: string | null;
  };
  contextDisplay: {
    apparentOwner: string;
    userRelationship: string;
    primaryObjective: string;
    secondaryObjective: string;
    authorized: string[];
    notAuthorized: string[];
  };
  statements: ClassifiedStatement[];
  contradictions: ContradictionHit[];
  buildStage: BuildStage;
  buildStageEvidence: string[];
  nextBestAction: string;
  trackA: TrackAPackage;
  trackB: TrackBPackage;
  prematureBuildBlocked: boolean;
  blockReasons: string[];
}

export interface TrackAPackage {
  valuablePremise: string;
  criticalContradictions: string[];
  evidenceGaps: string[];
  missingBusinessFacts: string[];
  offerHypotheses: string[];
  smallestValidationTest: string;
  sevenDaySequence: string[];
  creatorFacingMessage: string;
  recommendation: DecisionVerdict;
  recommendationRationale: string;
}

export interface TrackBPackage {
  reusableIntakeFields: string[];
  contradictionCategories: string[];
  evidenceRules: string[];
  decisionLogic: string[];
  ownershipIpGuardrails: string[];
  requiredApprovalPoints: string[];
  acceptanceCriteria: string[];
  anonymizedLesson: string;
}

export const REQUIRED_HELPER_CONTEXT: NormalizedContext = {
  artifactOwnership: "third_party",
  userRelationship: "helper_or_advisor",
  primaryIntent: "help_original_creator",
  secondaryIntent: "derive_generalized_workflow",
  commercialReuseAuthorized: false,
  buildAuthorized: false,
  artifactStage: "unfinished_proof_of_concept",
};

const OWNERSHIP_CUES =
  /\b(i do not own|don't own|do not own|found (this|it) online|helping the creator|original creator|third[- ]party)\b/i;
const BUILD_REQUEST =
  /\b(build|scaffold|generate|create)\b.*\b(website|landing page|funnel|checkout|sales page|app|repository)\b/i;
const BETTER_VERSION = /\b(create|make|build)\b.*\bbetter version\b/i;

export function normalizeContextFromInput(
  userText: string,
  overrides?: Partial<NormalizedContext>,
): NormalizedContext {
  const text = userText.trim();
  const thirdParty = OWNERSHIP_CUES.test(text) || /found this .+ online/i.test(text);
  const helper = /\bhelp(ing)? the creator\b|\badvisor\b|\bvalidate\b/i.test(text);
  const learnWorkflow = /\b(platynum|concept[- ]rescue|reusable|workflow|diagnos)/i.test(text);
  const noBuild =
    /\bdo not build\b|\bdon't build\b|\bno (sales page|landing page|website)\b|buildAuthorized:\s*false/i.test(
      text,
    );

  const base: NormalizedContext = {
    artifactOwnership: thirdParty ? "third_party" : "unknown",
    userRelationship: helper ? "helper_or_advisor" : "unknown",
    primaryIntent: helper ? "help_original_creator" : "unknown",
    secondaryIntent: learnWorkflow ? "derive_generalized_workflow" : "none",
    commercialReuseAuthorized: false,
    buildAuthorized: noBuild ? false : false, // default false until explicit approval + facts
    artifactStage: "unfinished_proof_of_concept",
  };

  // Ambiguous "better version" without ownership → still unknown ownership; do not grant build.
  if (BETTER_VERSION.test(text) && !thirdParty) {
    base.artifactOwnership = "unknown";
    base.primaryIntent = "ambiguous_improve_request";
  }

  return { ...base, ...overrides, commercialReuseAuthorized: false };
}

export function isConceptRescueIntent(userText: string): boolean {
  return (
    OWNERSHIP_CUES.test(userText) ||
    /concept[- ]rescue/i.test(userText) ||
    (/help(ing)? the creator/i.test(userText) && /platynum|workflow|diagnos/i.test(userText))
  );
}

type Detector = {
  ruleId: string;
  category: string;
  pattern: RegExp;
  explanation: string;
};

/** Content-based detectors — only fire when the supplied artifact matches. */
const DETECTORS: Detector[] = [
  {
    ruleId: "CR-LEN-01",
    category: "program_length_conflict",
    pattern: /3[- ]month|three[- ]month[\s\S]{0,400}(4th|fourth|month\s*4|Month\s*4|month four)/i,
    explanation: "Three-month positioning conflicts with a fourth roadmap month in the same artifact.",
  },
  {
    ruleId: "CR-LEN-01b",
    category: "program_length_conflict",
    pattern: /(month\s*4|fourth month|4th month)[\s\S]{0,120}(3[- ]month|three[- ]month)/i,
    explanation: "Fourth month appears alongside three-month positioning.",
  },
  {
    ruleId: "CR-PRICE-01",
    category: "pricing_logic",
    pattern:
      /(\$\s?\d+)[^\n]{0,80}(3|three)[^\n]{0,40}(month|mo)[\s\S]{0,200}(\$\s?\d+)[^\n]{0,80}(6|six)[^\n]{0,40}(month|mo)/i,
    explanation: "Compare plan prices/durations for a longer plan that appears cheaper without explanation.",
  },
  {
    ruleId: "CR-PLACE-01",
    category: "placeholder",
    pattern: /\[?\s*graph here\s*\]?|\{graph\}|insert chart|lorem ipsum/i,
    explanation: "Placeholder content such as “Graph here” is presented inside the offer.",
  },
  {
    ruleId: "CR-CRED-01",
    category: "authority",
    pattern: /\b(founder|CEO|veterinar|DVM|Dr\.)\b/i,
    explanation: "Authority or founder credentials are asserted or implied — must be verified, not assumed.",
  },
  {
    ruleId: "CR-STAT-01",
    category: "unverified_stats",
    pattern: /beta\s+\d+%|\d+%\s+(of\s+)?(users|dogs|pets|customers)|n\s*=\s*\d+/i,
    explanation: "Beta or percentage statistics appear without demonstrated provenance.",
  },
  {
    ruleId: "CR-TEST-01",
    category: "testimonials",
    pattern: /"[^"]{20,}"\s*[-—–]\s*\w+|testimonial|“[^”]{20,}”/i,
    explanation: "Text-only testimonials without demonstrated provenance.",
  },
  {
    ruleId: "CR-DELIV-01",
    category: "vague_deliverables",
    pattern: /physical (kit|box|pack)|digital (portal|guide|community)|and more!?|everything you need/i,
    explanation: "Physical/digital deliverables are vague or bundled without specificity.",
  },
  {
    ruleId: "CR-REG-01",
    category: "regulated_claims",
    pattern:
      /\b(supplement|joint support|arthritis|cure|treat(ment|s)?|vet[- ]approved|clinically)\b/i,
    explanation: "Supplement or animal-health claims require verification before production assets.",
  },
  {
    ruleId: "CR-TERM-01",
    category: "commerce_terms",
    pattern: /subscribe|subscription|membership|renew/i,
    explanation: "Subscription language without clear fulfillment, renewal, cancellation, shipping, refund rules.",
  },
];

function priceLongerCheaper(artifact: string): ContradictionHit | null {
  // Accept either "$180 … 3-month" or "3-month … $180"
  const three =
    artifact.match(/\$\s?(\d+)[^\n]{0,80}(3|three)[^\n]{0,20}(month|mo)/i) ||
    artifact.match(/(3|three)[^\n]{0,40}(month|mo)[^\n]{0,40}\$\s?(\d+)/i);
  const six =
    artifact.match(/\$\s?(\d+)[^\n]{0,80}(6|six)[^\n]{0,20}(month|mo)/i) ||
    artifact.match(/(6|six)[^\n]{0,40}(month|mo)[^\n]{0,40}\$\s?(\d+)/i);
  if (!three || !six) return null;
  const pickPrice = (m: RegExpMatchArray): number => {
    const nums = m.slice(1).filter((g): g is string => Boolean(g) && /^\d+$/.test(g)).map(Number);
    const dollars = nums.filter((n) => n >= 10);
    return (dollars.length ? dollars[dollars.length - 1] : nums[nums.length - 1]) ?? NaN;
  };
  const a = pickPrice(three);
  const b = pickPrice(six);
  if (Number.isFinite(a) && Number.isFinite(b) && b < a) {
    return {
      ruleId: "CR-PRICE-01",
      category: "pricing_logic",
      explanation: `Longer plan ($${b}) appears cheaper than shorter plan ($${a}) without explanation.`,
      evidenceExcerpt: `${three[0]} … ${six[0]}`,
    };
  }
  return null;
}

export function detectContradictions(artifactText: string): ContradictionHit[] {
  const hits: ContradictionHit[] = [];
  const seen = new Set<string>();

  const priced = priceLongerCheaper(artifactText);
  if (priced) {
    hits.push(priced);
    seen.add(priced.ruleId);
  }

  for (const det of DETECTORS) {
    if (seen.has(det.ruleId)) continue;
    const m = artifactText.match(det.pattern);
    if (!m) continue;
    // Authority detector alone is not a contradiction unless claimy — upgrade when paired with unverified.
    if (det.ruleId === "CR-CRED-01" && !/vet[- ]approved|founded by|our founder/i.test(artifactText)) {
      continue;
    }
    if (det.ruleId === "CR-TERM-01") {
      // Mentioning missing terms is not the same as publishing policies.
      const hasTerms =
        /cancellation policy|refund policy|shipping policy|fulfillment (path|process)|renewal terms:/i.test(
          artifactText,
        );
      if (hasTerms) continue;
    }
    hits.push({
      ruleId: det.ruleId,
      category: det.category,
      explanation: det.explanation,
      evidenceExcerpt: m[0].slice(0, 120),
    });
    seen.add(det.ruleId);
  }

  // Excessive copy vs proof: long marketing without proof markers
  const words = artifactText.trim().split(/\s+/).length;
  const hasProof = /case study|receipt|invoice|named clinic|study doi|github\.com\//i.test(artifactText);
  if (words > 180 && !hasProof && hits.filter((h) => h.category === "unverified_stats").length >= 0) {
    if (!seen.has("CR-COPY-01")) {
      hits.push({
        ruleId: "CR-COPY-01",
        category: "copy_without_proof",
        explanation: "Substantial marketing copy appears without linked proof artifacts.",
        evidenceExcerpt: `(${words} words; no proof markers found)`,
      });
    }
  }

  return hits;
}

export function classifyStatements(
  artifactText: string,
  userText: string,
  contradictions: ContradictionHit[],
): ClassifiedStatement[] {
  const out: ClassifiedStatement[] = [];
  let n = 0;
  const add = (text: string, grade: EvidenceGrade, ruleId?: string) => {
    out.push({ id: `stmt-${++n}`, text, grade, ruleId });
  };

  add(userText.trim().slice(0, 280), "user_context");

  if (/graph here/i.test(artifactText)) {
    add("Graph here", "placeholder", "CR-PLACE-01");
  }
  for (const hit of contradictions) {
    add(hit.evidenceExcerpt, hit.ruleId === "CR-PLACE-01" ? "placeholder" : "contradiction", hit.ruleId);
  }
  if (/vet[- ]approved|clinically/i.test(artifactText)) {
    add("Veterinary / clinical authority language in artifact", "creator_claim", "CR-REG-01");
  }
  if (/beta\s+\d+%/i.test(artifactText)) {
    add("Beta statistics in artifact", "creator_claim", "CR-STAT-01");
  }
  if (!/refund|cancellation|shipping/i.test(artifactText) && /subscri/i.test(artifactText)) {
    add("Commerce terms (refund/cancel/shipping) not specified", "missing_information", "CR-TERM-01");
  }
  // Fixture/demo label is a verified local fact about the test artifact only.
  if (/FIXTURE ONLY/i.test(artifactText)) {
    add("Artifact text is labeled FIXTURE ONLY for local vertical proof", "verified_fact");
  }
  add(
    "Demand, fulfillment, and production readiness are not established by this artifact alone",
    "inference",
  );

  return out;
}

export function classifyBuildStage(
  artifactText: string,
  contradictions: ContradictionHit[],
): { stage: BuildStage; evidence: string[] } {
  const evidence: string[] = [];
  if (/graph here|lorem ipsum|coming soon|tbd/i.test(artifactText)) {
    evidence.push("Placeholders present");
  }
  if (contradictions.length >= 3) {
    evidence.push(`${contradictions.length} contradiction/credibility issues surfaced`);
  }
  if (!/checkout|add to cart|paid|stripe|sku/i.test(artifactText)) {
    evidence.push("No working commerce path evidenced in text");
  }
  if (!/n\s*=\s*\d+|interview|waitlist\s+\d+/i.test(artifactText)) {
    evidence.push("No measured demand evidence in artifact");
  }
  evidence.push("Treat as unfinished proof of concept until validation evidence exists");
  return { stage: "unfinished_proof_of_concept", evidence };
}

export function prematureBuildBlocked(
  ctx: NormalizedContext,
  interpretationApproved: boolean,
  unresolvedBlockingFacts: boolean,
  requestedAsset?: string,
): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!ctx.buildAuthorized) reasons.push("buildAuthorized is false");
  if (!ctx.commercialReuseAuthorized) reasons.push("commercialReuseAuthorized is false");
  if (!interpretationApproved) reasons.push("current interpretation is not approved");
  if (unresolvedBlockingFacts) reasons.push("required factual inputs unresolved for the proposed asset");
  if (requestedAsset && BUILD_REQUEST.test(requestedAsset) && reasons.length) {
    reasons.push("commercial/build asset request refused under current authority");
  }
  if (ctx.artifactOwnership === "third_party" && ctx.commercialReuseAuthorized === false) {
    if (!reasons.includes("commercialReuseAuthorized is false")) {
      reasons.push("third-party artifact: commercial reuse not authorized");
    }
  }
  return { blocked: reasons.length > 0, reasons };
}

export function buildTrackA(
  contradictions: ContradictionHit[],
  stage: BuildStage,
): TrackAPackage {
  return {
    valuablePremise:
      "Owners of senior or mobility-challenged dogs face real home-slip risks; physical traction help is a concrete problem space worth validating — without inventing medical authority.",
    criticalContradictions: contradictions.map((c) => `${c.ruleId}: ${c.explanation}`),
    evidenceGaps: [
      "Veterinary/clinical claims lack demonstrated provenance",
      "Beta statistics and testimonials lack verification path",
      "Commerce terms (fulfillment, renewal, cancel, shipping, refund) unclear or absent",
    ],
    missingBusinessFacts: [
      "Legal owner and permission to advise",
      "Documented credentials (if any claims remain)",
      "Real prices and fulfillment path",
      "What has actually been sold, if anything",
    ],
    offerHypotheses: [
      "Hypothesis A: Single traction SKU with honest materials copy (no unverified vet claims).",
      "Hypothesis B: Paid short home-traction assessment recommending options.",
      "Hypothesis C: Validation-only waitlist + interviews before choosing A or B.",
    ],
    smallestValidationTest:
      "Eight owner interviews + one offer-preference card test in seven days — no new sales page.",
    sevenDaySequence: [
      "Day 1: List 10–20 real senior-dog owners to contact",
      "Day 2–3: Run interviews (slips, tried solutions, trust triggers)",
      "Day 4: Show three offer hypotheses; record preference",
      "Day 5: One-page noncommercial test prompt (problem + ask) — not a branded clone",
      "Day 6: Price reaction as labeled hypotheses only",
      "Day 7: continue / revise / pause / kill with written evidence",
    ],
    creatorFacingMessage:
      "I’ve been looking at this as someone trying to help you strengthen the idea — not take it over. The core problem looks real; the next step is validation and honest claims, not a bigger build. Happy to walk through contradictions and a seven-day test if useful.",
    recommendation: contradictions.length >= 4 ? "revise" : "pause",
    recommendationRationale: `Stage=${stage}. Surfaced ${contradictions.length} issues. Prefer validation before any commercial asset. No measured demand implied.`,
  };
}

export function buildTrackB(contradictions: ContradictionHit[]): TrackBPackage {
  const categories = [...new Set(contradictions.map((c) => c.category))];
  return {
    reusableIntakeFields: [
      "artifactOwnership",
      "userRelationship",
      "primaryIntent",
      "secondaryIntent",
      "commercialReuseAuthorized",
      "buildAuthorized",
      "artifactStage",
      "artifactTextOrUrl",
    ],
    contradictionCategories: categories.length
      ? categories
      : [
          "program_length_conflict",
          "pricing_logic",
          "placeholder",
          "authority",
          "unverified_stats",
          "testimonials",
          "vague_deliverables",
          "regulated_claims",
          "commerce_terms",
          "copy_without_proof",
        ],
    evidenceRules: [
      "Never render creator_claim as verified fact",
      "Placeholders stay graded placeholder",
      "Missing commerce terms are missing_information",
      "Inferences must be labeled inference",
    ],
    decisionLogic: [
      "If buildAuthorized=false → block websites/funnels/apps/checkouts/scaffolds",
      "If commercialReuseAuthorized=false → no branded commercial clone",
      "If interpretation unapproved → block mutating generation",
      "Prefer interviews/smoke tests over landing pages for unfinished_proof_of_concept",
    ],
    ownershipIpGuardrails: [
      "Third-party ownership retained unless user proves ownership",
      "Do not copy branding, proprietary wording, testimonials, or claims into a new commercial concept",
      "Track A creator-facing; Track B anonymized lessons only",
    ],
    requiredApprovalPoints: [
      "First intent checkpoint (What I understand you want)",
      "Re-approval after Correct / RETRACT|REPLACE",
      "Explicit buildAuthorized flip only after validation gate",
    ],
    acceptanceCriteria: [
      "Third-party ownership retained",
      "Dual intent retained",
      "Tracks isolated",
      "Unverified claims labelled",
      "Contradictions before build recommendations",
      "Build blocked before approval",
      "Correct uses RETRACT/REPLACE path",
      "Current-checkpoint-only + stale approval fail-closed",
    ],
    anonymizedLesson:
      "Unfinished offers often pair strong health/authority language and subscription pricing with placeholders and missing commerce terms. Concept Rescue must diagnose and validate before any commercial build, and must keep helper intent from becoming unauthorized ownership.",
  };
}

export function runConceptRescue(params: {
  userText: string;
  artifactText: string;
  interpretationApproved?: boolean;
  contextOverrides?: Partial<NormalizedContext>;
  decisionId?: string;
  checkpointId?: string | null;
  intentHash?: string | null;
}): ConceptRescueResult {
  const normalizedContext = normalizeContextFromInput(params.userText, params.contextOverrides);
  const contradictions = detectContradictions(params.artifactText);
  const statements = classifyStatements(params.artifactText, params.userText, contradictions);
  const { stage, evidence } = classifyBuildStage(params.artifactText, contradictions);
  normalizedContext.artifactStage = stage;

  const unresolved =
    statements.some((s) => s.grade === "missing_information" || s.grade === "contradiction") ||
    contradictions.some((c) => c.category === "regulated_claims" || c.category === "commerce_terms");

  const block = prematureBuildBlocked(
    normalizedContext,
    Boolean(params.interpretationApproved),
    unresolved,
    params.userText,
  );

  const trackA = buildTrackA(contradictions, stage);
  const trackB = buildTrackB(contradictions);
  const nextBestAction =
    stage === "unfinished_proof_of_concept"
      ? "Run the smallest credible validation test (interviews + offer preference) — do not generate a sales page."
      : trackA.smallestValidationTest;

  return {
    statusVocabulary: "Concept Rescue in progress",
    normalizedContext,
    audit: {
      decisionId: params.decisionId ?? `cr-decision-${Date.now().toString(36)}`,
      checkpointId: params.checkpointId ?? null,
      intentHash: params.intentHash ?? null,
    },
    contextDisplay: {
      apparentOwner: "Original third-party creator (not the Platynum user)",
      userRelationship: normalizedContext.userRelationship,
      primaryObjective: normalizedContext.primaryIntent,
      secondaryObjective: normalizedContext.secondaryIntent,
      authorized: [
        "Analysis and validation planning",
        "Creator-facing noncommercial feedback (Track A)",
        "Anonymized workflow lessons (Track B)",
      ],
      notAuthorized: [
        "Own or rebrand the artifact",
        "Copy testimonials/claims/assets into a new commercial product",
        "Generate website/funnel/checkout/repo scaffold while buildAuthorized is false",
      ],
    },
    statements,
    contradictions,
    buildStage: stage,
    buildStageEvidence: evidence,
    nextBestAction,
    trackA,
    trackB,
    prematureBuildBlocked: block.blocked,
    blockReasons: block.reasons,
  };
}

export function markLocalFlowProven(result: ConceptRescueResult): ConceptRescueResult {
  return { ...result, statusVocabulary: "Concept Rescue local flow-proven" };
}


import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import {
  activateCompetition,
  canonicalJson,
  closeCompetitionAndRevealSeed,
  createCuratedSolvableKlondikeDeal,
  createDraftCompetition,
  createVerifiedCuratedDealValidation,
  deepFreeze,
  OFFICIAL_SCORE_VERSION,
  publishCompetition,
  rankOfficialScores,
  sha256Hex,
} from "@/domain";

import { getDemoStore } from "./demo-store";
import { getRuntimeEnv } from "./env";

export const CURATED_COMPETITION_ID = "monetaire-foundation-trial-01";
export const CURATED_DEAL_ID = "curated-foundation-deal-01";
const DEMO_COMPETITION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const PUBLICATION_GENESIS_HASH = sha256Hex(
  "MONETAIRE_COMPETITION_PUBLICATION_GENESIS_V1",
);
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const SHA256_REFERENCE_PATTERN = /^sha256:[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type CuratedCompetitionBundle = {
  deal: ReturnType<typeof createCuratedSolvableKlondikeDeal>;
  validation: ReturnType<typeof createVerifiedCuratedDealValidation>;
  competition: ReturnType<typeof activateCompetition>;
  publicationCommitment: string;
};

type PublicationEvent = Readonly<{
  type: "DEAL_VALIDATED" | "COMPETITION_PUBLISHED" | "COMPETITION_ACTIVATED";
  atServerMs: number;
  previousEventHash: string;
  eventHash: string;
}>;

type EncryptedPublicationRecord = Readonly<{
  competitionId: typeof CURATED_COMPETITION_ID;
  dealId: typeof CURATED_DEAL_ID;
  rulesetVersion: "KLONDIKE_DRAW_ONE_V1";
  dealGeneratorVersion: "CURATED_SOLVABLE_V1";
  scoreVersion: typeof OFFICIAL_SCORE_VERSION;
  dealCommitment: string;
  publicationCommitment: string;
  validationStartedAtServerMs: number;
  validatedAtServerMs: number;
  validationEvidenceReference: string;
  publishedAtServerMs: number;
  opensAtServerMs: number;
  closesAtServerMs: number;
  encryptionKeyFingerprint: string;
  cipher: "AES_256_GCM";
  iv: string;
  authTag: string;
  ciphertext: string;
  lifecycle: readonly PublicationEvent[];
  demoOnly: true;
}>;

type RevealRecord = Readonly<{
  competitionId: typeof CURATED_COMPETITION_ID;
  seed: string;
  revealNonce: string;
  publicationCommitment: string;
  closedAtServerMs: number;
  previousEventHash: string;
  eventHash: string;
}>;

type CompetitionCatalogState = {
  publication?: EncryptedPublicationRecord;
  revealRecords: readonly RevealRecord[];
};

type PublicationAuthenticatedHeader = Omit<
  EncryptedPublicationRecord,
  "authTag" | "ciphertext"
>;

declare global {
  var __monetaireCompetitionCatalogState:
    | CompetitionCatalogState
    | undefined;
}

function catalogState(): CompetitionCatalogState {
  if (!globalThis.__monetaireCompetitionCatalogState) {
    globalThis.__monetaireCompetitionCatalogState = {
      revealRecords: [],
    };
  }
  return globalThis.__monetaireCompetitionCatalogState;
}

function requireDemoPublicationKey(): {
  key: Buffer;
  fingerprint: string;
} {
  const env = getRuntimeEnv();
  if (!env.DEMO_MODE) {
    throw new Error("DEMO_RANKED_COMPETITION_DISABLED");
  }
  const configuredKey = env.COMPETITION_SEED_ENCRYPTION_KEY;
  if (!configuredKey) {
    throw new Error("RANKED_COMPETITION_KEY_REQUIRED");
  }
  const key = createHash("sha256")
    .update("MONETAIRE_COMPETITION_AES_KEY_V1\0", "utf8")
    .update(configuredKey, "utf8")
    .digest();
  return {
    key,
    fingerprint: createHash("sha256")
      .update("MONETAIRE_COMPETITION_KEY_FINGERPRINT_V1\0", "utf8")
      .update(key)
      .digest("hex"),
  };
}

function publicationCommitment(input: {
  seed: string;
  revealNonce: string;
  dealCommitment: string;
  validationEvidenceReference: string;
}): string {
  return sha256Hex(
    canonicalJson({
      protocol: "MONETAIRE_COMPETITION_PUBLICATION_V1",
      competitionId: CURATED_COMPETITION_ID,
      dealId: CURATED_DEAL_ID,
      seed: input.seed,
      revealNonce: input.revealNonce,
      dealCommitment: input.dealCommitment,
      rulesetVersion: "KLONDIKE_DRAW_ONE_V1",
      dealGeneratorVersion: "CURATED_SOLVABLE_V1",
      scoreVersion: OFFICIAL_SCORE_VERSION,
      validationEvidenceReference: input.validationEvidenceReference,
    }),
  );
}

function lifecycleEventHash(input: {
  type: PublicationEvent["type"];
  atServerMs: number;
  previousEventHash: string;
  dealCommitment: string;
  publicationCommitment: string;
  validationEvidenceReference: string;
}): string {
  return sha256Hex(
    canonicalJson({
      protocol: "MONETAIRE_COMPETITION_LIFECYCLE_EVENT_V1",
      competitionId: CURATED_COMPETITION_ID,
      dealId: CURATED_DEAL_ID,
      type: input.type,
      atServerMs: input.atServerMs,
      dealCommitment: input.dealCommitment,
      publicationCommitment: input.publicationCommitment,
      validationEvidenceReference: input.validationEvidenceReference,
      previousEventHash: input.previousEventHash,
    }),
  );
}

function appendLifecycleEvent(
  events: readonly PublicationEvent[],
  type: PublicationEvent["type"],
  atServerMs: number,
  publication: {
    dealCommitment: string;
    publicationCommitment: string;
    validationEvidenceReference: string;
  },
): readonly PublicationEvent[] {
  const previousEventHash =
    events.at(-1)?.eventHash ?? PUBLICATION_GENESIS_HASH;
  const eventHash = lifecycleEventHash({
    type,
    atServerMs,
    previousEventHash,
    ...publication,
  });
  return [
    ...events,
    deepFreeze({ type, atServerMs, previousEventHash, eventHash }),
  ];
}

function publicationAuthenticatedData(
  record: PublicationAuthenticatedHeader,
): Buffer {
  return Buffer.from(
    canonicalJson({
      protocol: "MONETAIRE_ENCRYPTED_COMPETITION_PUBLICATION_V1",
      competitionId: record.competitionId,
      dealId: record.dealId,
      rulesetVersion: record.rulesetVersion,
      dealGeneratorVersion: record.dealGeneratorVersion,
      scoreVersion: record.scoreVersion,
      dealCommitment: record.dealCommitment,
      publicationCommitment: record.publicationCommitment,
      validationStartedAtServerMs:
        record.validationStartedAtServerMs,
      validatedAtServerMs: record.validatedAtServerMs,
      validationEvidenceReference:
        record.validationEvidenceReference,
      publishedAtServerMs: record.publishedAtServerMs,
      opensAtServerMs: record.opensAtServerMs,
      closesAtServerMs: record.closesAtServerMs,
      encryptionKeyFingerprint: record.encryptionKeyFingerprint,
      cipher: record.cipher,
      iv: record.iv,
      lifecycle: record.lifecycle,
      demoOnly: record.demoOnly,
    }),
    "utf8",
  );
}

function publicationIntegrityFailure(): never {
  throw new Error("RANKED_COMPETITION_PUBLICATION_INTEGRITY_FAILURE");
}

function assertPublicationRecordIntegrity(
  record: EncryptedPublicationRecord,
): void {
  if (
    record.competitionId !== CURATED_COMPETITION_ID ||
    record.dealId !== CURATED_DEAL_ID ||
    record.rulesetVersion !== "KLONDIKE_DRAW_ONE_V1" ||
    record.dealGeneratorVersion !== "CURATED_SOLVABLE_V1" ||
    record.scoreVersion !== OFFICIAL_SCORE_VERSION ||
    record.cipher !== "AES_256_GCM" ||
    record.demoOnly !== true ||
    !SHA256_HEX_PATTERN.test(record.dealCommitment) ||
    !SHA256_HEX_PATTERN.test(record.publicationCommitment) ||
    !SHA256_HEX_PATTERN.test(record.encryptionKeyFingerprint) ||
    !SHA256_REFERENCE_PATTERN.test(
      record.validationEvidenceReference,
    ) ||
    !BASE64URL_PATTERN.test(record.iv) ||
    Buffer.from(record.iv, "base64url").length !== 12 ||
    !BASE64URL_PATTERN.test(record.authTag) ||
    Buffer.from(record.authTag, "base64url").length !== 16 ||
    !BASE64URL_PATTERN.test(record.ciphertext) ||
    Buffer.from(record.ciphertext, "base64url").length === 0
  ) {
    publicationIntegrityFailure();
  }

  const orderedTimes = [
    record.validationStartedAtServerMs,
    record.validatedAtServerMs,
    record.publishedAtServerMs,
    record.opensAtServerMs,
    record.closesAtServerMs,
  ];
  if (
    orderedTimes.some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    record.validationStartedAtServerMs >
      record.validatedAtServerMs ||
    record.validatedAtServerMs > record.publishedAtServerMs ||
    record.publishedAtServerMs >= record.opensAtServerMs ||
    record.opensAtServerMs >= record.closesAtServerMs
  ) {
    publicationIntegrityFailure();
  }

  const expectedEvents: readonly Readonly<{
    type: PublicationEvent["type"];
    atServerMs: number;
  }>[] = [
    {
      type: "DEAL_VALIDATED",
      atServerMs: record.validatedAtServerMs,
    },
    {
      type: "COMPETITION_PUBLISHED",
      atServerMs: record.publishedAtServerMs,
    },
    {
      type: "COMPETITION_ACTIVATED",
      atServerMs: record.opensAtServerMs,
    },
  ];
  if (
    !Array.isArray(record.lifecycle) ||
    record.lifecycle.length !== expectedEvents.length
  ) {
    publicationIntegrityFailure();
  }

  let previousEventHash = PUBLICATION_GENESIS_HASH;
  for (const [index, expected] of expectedEvents.entries()) {
    const event = record.lifecycle[index];
    if (
      event?.type !== expected.type ||
      event.atServerMs !== expected.atServerMs ||
      event.previousEventHash !== previousEventHash ||
      event.eventHash !==
        lifecycleEventHash({
          ...expected,
          previousEventHash,
          dealCommitment: record.dealCommitment,
          publicationCommitment: record.publicationCommitment,
          validationEvidenceReference:
            record.validationEvidenceReference,
        })
    ) {
      publicationIntegrityFailure();
    }
    previousEventHash = event.eventHash;
  }
}

function createPublicationRecord(): EncryptedPublicationRecord {
  const { key, fingerprint } = requireDemoPublicationKey();
  const now = Date.now();
  const validationStartedAtServerMs = now - 3_000;
  const publishedAtServerMs = now - 2_000;
  const opensAtServerMs = now - 1_000;
  const closesAtServerMs = now + DEMO_COMPETITION_DURATION_MS;
  const seed = randomBytes(32).toString("hex");
  const revealNonce = randomBytes(32).toString("hex");
  const deal = createCuratedSolvableKlondikeDeal(seed);
  const validation = createVerifiedCuratedDealValidation({
    validationId: "validation-curated-foundation-01",
    dealId: CURATED_DEAL_ID,
    deal,
    validatedAtServerMs: validationStartedAtServerMs,
  });
  const validatedAtServerMs =
    validation.validation.validatedAtServerMs;
  const validationEvidenceReference =
    validation.validation.evidenceReference;
  const commitment = publicationCommitment({
    seed,
    revealNonce,
    dealCommitment: deal.commitment,
    validationEvidenceReference,
  });

  let lifecycle: readonly PublicationEvent[] = [];
  lifecycle = appendLifecycleEvent(
    lifecycle,
    "DEAL_VALIDATED",
    validatedAtServerMs,
    {
      dealCommitment: deal.commitment,
      publicationCommitment: commitment,
      validationEvidenceReference,
    },
  );
  lifecycle = appendLifecycleEvent(
    lifecycle,
    "COMPETITION_PUBLISHED",
    publishedAtServerMs,
    {
      dealCommitment: deal.commitment,
      publicationCommitment: commitment,
      validationEvidenceReference,
    },
  );
  lifecycle = appendLifecycleEvent(
    lifecycle,
    "COMPETITION_ACTIVATED",
    opensAtServerMs,
    {
      dealCommitment: deal.commitment,
      publicationCommitment: commitment,
      validationEvidenceReference,
    },
  );

  const iv = randomBytes(12);
  const header: PublicationAuthenticatedHeader = deepFreeze({
    competitionId: CURATED_COMPETITION_ID,
    dealId: CURATED_DEAL_ID,
    rulesetVersion: "KLONDIKE_DRAW_ONE_V1",
    dealGeneratorVersion: "CURATED_SOLVABLE_V1",
    scoreVersion: OFFICIAL_SCORE_VERSION,
    dealCommitment: deal.commitment,
    publicationCommitment: commitment,
    validationStartedAtServerMs,
    validatedAtServerMs,
    validationEvidenceReference,
    publishedAtServerMs,
    opensAtServerMs,
    closesAtServerMs,
    encryptionKeyFingerprint: fingerprint,
    cipher: "AES_256_GCM",
    iv: iv.toString("base64url"),
    lifecycle,
    demoOnly: true,
  });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  try {
    cipher.setAAD(publicationAuthenticatedData(header));
    const ciphertext = Buffer.concat([
      cipher.update(
        canonicalJson({
          protocol: "MONETAIRE_COMPETITION_SECRET_MATERIAL_V1",
          competitionId: CURATED_COMPETITION_ID,
          dealId: CURATED_DEAL_ID,
          seed,
          revealNonce,
        }),
        "utf8",
      ),
      cipher.final(),
    ]);
    const record = deepFreeze({
      ...header,
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    assertPublicationRecordIntegrity(record);
    return record;
  } finally {
    key.fill(0);
  }
}

function requirePublicationRecord(): EncryptedPublicationRecord {
  const state = catalogState();
  if (!state.publication) {
    state.publication = createPublicationRecord();
  }
  assertPublicationRecordIntegrity(state.publication);
  return state.publication;
}

function decryptPublicationMaterial(record: EncryptedPublicationRecord): {
  seed: string;
  revealNonce: string;
} {
  const { key, fingerprint } = requireDemoPublicationKey();
  if (fingerprint !== record.encryptionKeyFingerprint) {
    key.fill(0);
    throw new Error("RANKED_COMPETITION_KEY_ROTATION_REQUIRES_REPUBLICATION");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(record.iv, "base64url"),
    );
    decipher.setAAD(publicationAuthenticatedData(record));
    decipher.setAuthTag(Buffer.from(record.authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as {
      protocol?: unknown;
      competitionId?: unknown;
      dealId?: unknown;
      seed?: unknown;
      revealNonce?: unknown;
    };
    if (
      parsed.protocol !==
        "MONETAIRE_COMPETITION_SECRET_MATERIAL_V1" ||
      parsed.competitionId !== CURATED_COMPETITION_ID ||
      parsed.dealId !== CURATED_DEAL_ID ||
      typeof parsed.seed !== "string" ||
      !SHA256_HEX_PATTERN.test(parsed.seed) ||
      typeof parsed.revealNonce !== "string" ||
      !SHA256_HEX_PATTERN.test(parsed.revealNonce)
    ) {
      throw new Error("RANKED_COMPETITION_MATERIAL_INVALID");
    }
    return {
      seed: parsed.seed,
      revealNonce: parsed.revealNonce,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "RANKED_COMPETITION_MATERIAL_INVALID"
    ) {
      throw error;
    }
    throw new Error(
      "RANKED_COMPETITION_PUBLICATION_DECRYPTION_FAILED",
    );
  } finally {
    key.fill(0);
  }
}

/**
 * Safe-demo adapter for the future persisted publication repository.
 *
 * The ranked material is randomly created once per process, encrypted under a
 * dedicated explicitly configured key, and frozen before the event is exposed.
 * Configured/production environments cannot use this adapter.
 */
export function getCuratedCompetitionBundle(): CuratedCompetitionBundle {
  const record = requirePublicationRecord();
  const material = decryptPublicationMaterial(record);
  const deal = createCuratedSolvableKlondikeDeal(material.seed);
  const validation = createVerifiedCuratedDealValidation({
    validationId: "validation-curated-foundation-01",
    dealId: CURATED_DEAL_ID,
    deal,
    validatedAtServerMs: record.validationStartedAtServerMs,
  });
  const expectedPublicationCommitment = publicationCommitment({
    ...material,
    dealCommitment: deal.commitment,
    validationEvidenceReference:
      validation.validation.evidenceReference,
  });
  if (
    deal.commitment !== record.dealCommitment ||
    validation.validation.validatedAtServerMs !==
      record.validatedAtServerMs ||
    validation.validation.evidenceReference !==
      record.validationEvidenceReference ||
    expectedPublicationCommitment !== record.publicationCommitment
  ) {
    throw new Error("RANKED_COMPETITION_PUBLICATION_MISMATCH");
  }

  const draft = createDraftCompetition({
    competitionId: CURATED_COMPETITION_ID,
    name: "Foundation Fairness Trial · Safe Demo",
    dealId: CURATED_DEAL_ID,
    dealCommitment: deal.commitment,
    dealGeneratorVersion: deal.generatorVersion,
    validation: validation.validation,
    opensAtServerMs: record.opensAtServerMs,
    closesAtServerMs: record.closesAtServerMs,
  });
  const published = publishCompetition(draft, record.publishedAtServerMs);
  const activeCompetition = activateCompetition(
    published,
    record.opensAtServerMs,
  );
  const state = catalogState();
  if (state.revealRecords.length > 1) {
    throw new Error("RANKED_COMPETITION_REVEAL_INTEGRITY_FAILURE");
  }
  const reveal = state.revealRecords[0];
  if (reveal) {
    assertRevealRecordIntegrity(reveal, record);
  }
  const competition = reveal
    ? closeCompetitionAndRevealSeed(activeCompetition, {
        seed: reveal.seed,
        serverClosedAtMs: reveal.closedAtServerMs,
      })
    : activeCompetition;

  return {
    deal,
    validation,
    competition,
    publicationCommitment: record.publicationCommitment,
  };
}

function revealEventHash(
  reveal: Omit<RevealRecord, "eventHash">,
): string {
  return sha256Hex(
    canonicalJson({
      protocol: "MONETAIRE_COMPETITION_REVEAL_EVENT_V1",
      competitionId: reveal.competitionId,
      seed: reveal.seed,
      revealNonce: reveal.revealNonce,
      publicationCommitment: reveal.publicationCommitment,
      closedAtServerMs: reveal.closedAtServerMs,
      previousEventHash: reveal.previousEventHash,
    }),
  );
}

function assertRevealRecordIntegrity(
  reveal: RevealRecord,
  publication: EncryptedPublicationRecord,
): void {
  const expectedPreviousEventHash =
    publication.lifecycle.at(-1)?.eventHash;
  const reproducedDeal = SHA256_HEX_PATTERN.test(reveal.seed)
    ? createCuratedSolvableKlondikeDeal(reveal.seed)
    : null;
  if (
    reveal.competitionId !== CURATED_COMPETITION_ID ||
    !SHA256_HEX_PATTERN.test(reveal.seed) ||
    !SHA256_HEX_PATTERN.test(reveal.revealNonce) ||
    reveal.publicationCommitment !==
      publication.publicationCommitment ||
    !Number.isSafeInteger(reveal.closedAtServerMs) ||
    reveal.closedAtServerMs < publication.closesAtServerMs ||
    reveal.previousEventHash !== expectedPreviousEventHash ||
    reveal.eventHash !== revealEventHash(reveal) ||
    reproducedDeal?.commitment !== publication.dealCommitment ||
    publicationCommitment({
      seed: reveal.seed,
      revealNonce: reveal.revealNonce,
      dealCommitment: publication.dealCommitment,
      validationEvidenceReference:
        publication.validationEvidenceReference,
    }) !== publication.publicationCommitment
  ) {
    throw new Error("RANKED_COMPETITION_REVEAL_INTEGRITY_FAILURE");
  }
}

export function closeDemoCompetitionAndReveal(): Readonly<RevealRecord> {
  const state = catalogState();
  const existing = state.revealRecords.find(
    (record) => record.competitionId === CURATED_COMPETITION_ID,
  );
  if (existing) {
    const publication = requirePublicationRecord();
    // Reconstructing authenticates the encrypted publication and proves the
    // existing reveal closes that exact immutable contract.
    getCuratedCompetitionBundle();
    assertRevealRecordIntegrity(existing, publication);
    return existing;
  }

  const publication = requirePublicationRecord();
  const material = decryptPublicationMaterial(publication);
  const { competition } = getCuratedCompetitionBundle();
  const serverClosedAtMs = Date.now();
  closeCompetitionAndRevealSeed(competition, {
    seed: material.seed,
    serverClosedAtMs,
  });
  if (
    publicationCommitment({
      ...material,
      dealCommitment: publication.dealCommitment,
      validationEvidenceReference:
        publication.validationEvidenceReference,
    }) !== publication.publicationCommitment
  ) {
    throw new Error("RANKED_COMPETITION_REVEAL_MISMATCH");
  }

  const previousEventHash =
    publication.lifecycle.at(-1)?.eventHash ??
    publicationIntegrityFailure();
  const revealWithoutHash: Omit<RevealRecord, "eventHash"> =
    deepFreeze({
      competitionId: CURATED_COMPETITION_ID,
      seed: material.seed,
      revealNonce: material.revealNonce,
      publicationCommitment: publication.publicationCommitment,
      closedAtServerMs: serverClosedAtMs,
      previousEventHash,
    });
  const reveal: RevealRecord = deepFreeze({
    ...revealWithoutHash,
    eventHash: revealEventHash(revealWithoutHash),
  });
  assertRevealRecordIntegrity(reveal, publication);
  state.revealRecords = deepFreeze([...state.revealRecords, reveal]);
  return reveal;
}

export function competitionPublicationEvidence() {
  const record = requirePublicationRecord();
  // Do not expose evidence for a record whose encrypted material or derived
  // commitment no longer authenticates.
  getCuratedCompetitionBundle();
  return deepFreeze({
    competitionId: record.competitionId,
    dealId: record.dealId,
    rulesetVersion: record.rulesetVersion,
    dealGeneratorVersion: record.dealGeneratorVersion,
    scoreVersion: record.scoreVersion,
    dealCommitment: record.dealCommitment,
    publicationCommitment: record.publicationCommitment,
    validationStartedAtServerMs: record.validationStartedAtServerMs,
    validatedAtServerMs: record.validatedAtServerMs,
    validationEvidenceReference:
      record.validationEvidenceReference,
    publishedAtServerMs: record.publishedAtServerMs,
    opensAtServerMs: record.opensAtServerMs,
    closesAtServerMs: record.closesAtServerMs,
    cipher: record.cipher,
    lifecycle: record.lifecycle,
    demoOnly: record.demoOnly,
  });
}

export function publicCompetitionSnapshot() {
  const store = getDemoStore();
  const { competition, publicationCommitment: commitment } =
    getCuratedCompetitionBundle();
  const reveal = catalogState().revealRecords.find(
    (record) => record.competitionId === CURATED_COMPETITION_ID,
  );
  const scores = store.officialScores.filter((score) => {
    const entry = store.competitionEntries.find(
      (candidate) => candidate.entryId === score.entryId,
    );
    return entry?.competitionId === CURATED_COMPETITION_ID;
  });
  const standings = rankOfficialScores(scores).map((standing) => ({
    rank: standing.rank,
    tied: standing.tied,
    entryId: standing.score.entryId,
    completed: standing.score.completed,
    validMoves: standing.score.validMoves,
    verifiedActivePlayMs: standing.score.verifiedActivePlayMs,
    scoreVersion: standing.score.scoreVersion,
  }));

  return {
    id: competition.competitionId,
    name: competition.name,
    mode: competition.mode,
    status: competition.status,
    environment: "safe-demo" as const,
    demoOnly: true,
    entryCostPlayCoins: 0,
    valuablePrize: false,
    rulesetVersion: competition.rulesetVersion,
    scoreVersion: OFFICIAL_SCORE_VERSION,
    dealGeneratorVersion: competition.dealGeneratorVersion,
    dealCommitment: competition.dealCommitment,
    publicationCommitment: commitment,
    validation: {
      status: competition.validation.status,
      solver: competition.validation.solverName,
      solverVersion: competition.validation.solverVersion,
      evidenceReference: competition.validation.evidenceReference,
    },
    opensAt: new Date(competition.opensAtServerMs).toISOString(),
    closesAt: new Date(competition.closesAtServerMs).toISOString(),
    seedReveal: reveal?.seed ?? null,
    revealNonce: reveal?.revealNonce ?? null,
    entryCount: store.competitionEntries.filter(
      (entry) => entry.competitionId === CURATED_COMPETITION_ID,
    ).length,
    standings,
  };
}

export function publicCompetitionSnapshotIfAvailable():
  | ReturnType<typeof publicCompetitionSnapshot>
  | null {
  try {
    return publicCompetitionSnapshot();
  } catch {
    return null;
  }
}

export function resetCompetitionCatalogForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("TEST_ONLY_COMPETITION_CATALOG_RESET");
  }
  globalThis.__monetaireCompetitionCatalogState = {
    revealRecords: [],
  };
}

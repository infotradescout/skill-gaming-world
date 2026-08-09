export type DemoCompetitionStanding = {
  entryId?: string;
  rank: number;
  tied: boolean;
  completed: boolean;
  validMoves: number;
  verifiedActivePlayMs: number;
};

export type DemoCompetitionSnapshot = {
  id: string;
  name: string;
  mode: string;
  status: string;
  entryCostPlayCoins: number;
  valuablePrize: boolean;
  rulesetVersion: string;
  dealGeneratorVersion: string;
  dealCommitment: string;
  validation: {
    status: string;
    solver: string;
    solverVersion: string;
    evidenceReference: string;
  };
  opensAt: string;
  closesAt: string;
  seedReveal: string | null;
  entryCount: number;
  standings: DemoCompetitionStanding[];
};

export type PersistentCompetitionStanding = {
  entryId?: string;
  scoreId?: string | null;
  rank: number;
  tied: boolean;
  completed: boolean;
  validMoveCount: number;
  verifiedActiveDurationMs: number;
  displayName?: string;
};

export type PersistentCompetitionSnapshot = {
  competitionId: string;
  publicName: string;
  status: string;
  entryCostPlayCoins: number;
  valuablePrize: boolean;
  dealCommitment: string | null;
  rulesetVersion: string;
  scoringVersion: string | null;
  dealGeneratorVersion: string | null;
  validation: {
    validationId: string;
    status: string;
    protocol: string;
    validatorKey: string;
    validatorVersion: string;
    evidenceHash: string | null;
    validatedAtServerMs: number | null;
  } | null;
  opensAtServerMs: number;
  closesAtServerMs: number;
  closedAtServerMs: number | null;
  seedReveal: string | null;
  revealedAtServerMs: number | null;
  canonicalDealHash: string | null;
  seedVerified: boolean | null;
  entryCount: number;
  finalLeaderboardSnapshot: {
    scoringVersion: string;
    snapshotHash: string;
    createdAtServerMs: number;
    standings: Array<{
      rank: number;
      entryId: string;
      scoreId: string;
      tied: boolean;
    }>;
  } | null;
  standings: PersistentCompetitionStanding[];
};

export type RuntimeCompetitionSnapshot =
  | DemoCompetitionSnapshot
  | PersistentCompetitionSnapshot;

export type CompetitionView = {
  id: string;
  name: string;
  status: string;
  entryCostPlayCoins: number;
  valuablePrize: boolean;
  dealCommitment: string | null;
  rulesetVersion: string | null;
  scoringVersion: string | null;
  dealGeneratorVersion: string | null;
  validation: (DemoCompetitionSnapshot["validation"] & {
    protocol?: string;
    validationId?: string;
  }) | null;
  opensAt: string;
  closesAt: string;
  closedAt: string | null;
  seedReveal: string | null;
  revealedAt: string | null;
  canonicalDealHash: string | null;
  seedVerified: boolean | null;
  entryCount: number | null;
  finalLeaderboardSnapshot: {
    scoringVersion: string;
    snapshotHash: string;
    createdAt: string;
    standings: Array<{
      rank: number;
      entryId: string;
      scoreId: string;
      tied: boolean;
    }>;
  } | null;
  environment: "safe-demo" | "configured";
  standings: Array<{
    entryId: string | null;
    rank: number;
    tied: boolean;
    completed: boolean;
    validMoves: number;
    verifiedActivePlayMs: number;
    displayName: string | null;
  }>;
};

export function isPersistentCompetitionSnapshot(
  snapshot: RuntimeCompetitionSnapshot,
): snapshot is PersistentCompetitionSnapshot {
  return "competitionId" in snapshot;
}

export function competitionView(
  snapshot: RuntimeCompetitionSnapshot,
): CompetitionView {
  if (isPersistentCompetitionSnapshot(snapshot)) {
    return {
      id: snapshot.competitionId,
      name: snapshot.publicName,
      status: snapshot.status,
      entryCostPlayCoins: snapshot.entryCostPlayCoins,
      valuablePrize: snapshot.valuablePrize,
      dealCommitment: snapshot.dealCommitment,
      rulesetVersion: snapshot.rulesetVersion,
      scoringVersion: snapshot.scoringVersion,
      dealGeneratorVersion: snapshot.dealGeneratorVersion,
      validation: snapshot.validation
        ? {
            validationId: snapshot.validation.validationId,
            status: snapshot.validation.status,
            solver: snapshot.validation.validatorKey,
            solverVersion: snapshot.validation.validatorVersion,
            evidenceReference: snapshot.validation.evidenceHash
              ? `sha256:${snapshot.validation.evidenceHash}`
              : snapshot.validation.protocol,
            protocol: snapshot.validation.protocol,
          }
        : null,
      opensAt: new Date(snapshot.opensAtServerMs).toISOString(),
      closesAt: new Date(snapshot.closesAtServerMs).toISOString(),
      closedAt:
        snapshot.closedAtServerMs === null
          ? null
          : new Date(snapshot.closedAtServerMs).toISOString(),
      seedReveal: snapshot.seedReveal,
      revealedAt:
        snapshot.revealedAtServerMs === null
          ? null
          : new Date(snapshot.revealedAtServerMs).toISOString(),
      canonicalDealHash: snapshot.canonicalDealHash,
      seedVerified: snapshot.seedVerified,
      entryCount: snapshot.entryCount,
      finalLeaderboardSnapshot: snapshot.finalLeaderboardSnapshot
        ? {
            scoringVersion: snapshot.finalLeaderboardSnapshot.scoringVersion,
            snapshotHash: snapshot.finalLeaderboardSnapshot.snapshotHash,
            createdAt: new Date(
              snapshot.finalLeaderboardSnapshot.createdAtServerMs,
            ).toISOString(),
            standings: snapshot.finalLeaderboardSnapshot.standings,
          }
        : null,
      environment: "configured",
      standings: snapshot.standings.map((standing) => ({
        entryId: standing.entryId ?? null,
        rank: standing.rank,
        tied: standing.tied,
        completed: standing.completed,
        validMoves: standing.validMoveCount,
        verifiedActivePlayMs: standing.verifiedActiveDurationMs,
        displayName: standing.displayName ?? null,
      })),
    };
  }

  return {
    id: snapshot.id,
    name: snapshot.name,
    status: snapshot.status,
    entryCostPlayCoins: snapshot.entryCostPlayCoins,
    valuablePrize: snapshot.valuablePrize,
    dealCommitment: snapshot.dealCommitment,
    rulesetVersion: snapshot.rulesetVersion,
    scoringVersion: null,
    dealGeneratorVersion: snapshot.dealGeneratorVersion,
    validation: snapshot.validation,
    opensAt: snapshot.opensAt,
    closesAt: snapshot.closesAt,
    closedAt: null,
    seedReveal: snapshot.seedReveal,
    revealedAt: null,
    canonicalDealHash: null,
    seedVerified: snapshot.seedReveal === null ? null : true,
    entryCount: snapshot.entryCount,
    finalLeaderboardSnapshot: null,
    environment: "safe-demo",
    standings: snapshot.standings.map((standing) => ({
      entryId: standing.entryId ?? null,
      rank: standing.rank,
      tied: standing.tied,
      completed: standing.completed,
      validMoves: standing.validMoves,
      verifiedActivePlayMs: standing.verifiedActivePlayMs,
      displayName: null,
    })),
  };
}

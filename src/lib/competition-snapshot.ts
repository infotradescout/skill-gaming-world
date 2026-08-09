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
  opensAtServerMs: number;
  closesAtServerMs: number;
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
  dealGeneratorVersion: string | null;
  validation: DemoCompetitionSnapshot["validation"] | null;
  opensAt: string;
  closesAt: string;
  seedReveal: string | null;
  entryCount: number | null;
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
      dealGeneratorVersion: null,
      validation: null,
      opensAt: new Date(snapshot.opensAtServerMs).toISOString(),
      closesAt: new Date(snapshot.closesAtServerMs).toISOString(),
      seedReveal: null,
      entryCount: null,
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
    dealGeneratorVersion: snapshot.dealGeneratorVersion,
    validation: snapshot.validation,
    opensAt: snapshot.opensAt,
    closesAt: snapshot.closesAt,
    seedReveal: snapshot.seedReveal,
    entryCount: snapshot.entryCount,
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

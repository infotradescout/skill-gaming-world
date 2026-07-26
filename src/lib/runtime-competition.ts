import { publicCompetitionSnapshotIfAvailable } from "./competition-catalog";
import type { RuntimeCompetitionSnapshot } from "./competition-snapshot";
import { getRuntimeEnv } from "./env";
import { persistentCompetitionSnapshot } from "./persistent-competition";

export async function runtimeCompetitionSnapshot(): Promise<
  RuntimeCompetitionSnapshot | null
> {
  if (getRuntimeEnv().DEMO_MODE) {
    return publicCompetitionSnapshotIfAvailable();
  }
  return persistentCompetitionSnapshot();
}

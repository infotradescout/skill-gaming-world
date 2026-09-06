import journal from "../../drizzle/meta/_journal.json";

export type MigrationReceipt = { createdAt?: number | string; hash?: string };
type JournalEntry = { idx: number; when: number; tag: string };

/** The journal's timestamps identify migrations; an unrelated extra row is not proof. */
export function hasRequiredMigrationHistory(
  receipts: readonly MigrationReceipt[],
  throughTag: string,
  entries: readonly JournalEntry[] = journal.entries,
): boolean {
  const boundary = entries.findIndex((entry) => entry.tag === throughTag);
  if (boundary < 0) return false;
  const required = entries.slice(0, boundary + 1);
  if (required.some((entry, index) =>
    entry.idx !== index || !Number.isSafeInteger(entry.when) || entry.when <= 0 ||
    (index > 0 && entry.when <= required[index - 1].when) ||
    !entry.tag.startsWith(`${String(index).padStart(4, "0")}_`)
  )) return false;
  return required.every((entry) => {
    const matches = receipts.filter((receipt) => Number(receipt.createdAt) === entry.when);
    return matches.length === 1 && /^[0-9a-f]{64}$/.test(matches[0].hash ?? "");
  });
}

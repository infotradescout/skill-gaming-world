import { isDeepStrictEqual } from "node:util";

/** Normalize the JSON command exactly as it is stored in PostgreSQL. */
export function robotCommandPayload(command: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(command)) as Record<string, unknown>;
}

/** An action identifier belongs to one actor and one immutable command. */
export function robotCommandBindingMatches(
  receipt: { playerId: string | null; commandPayload: unknown },
  playerId: string,
  commandPayload: Record<string, unknown>,
): boolean {
  return receipt.playerId === playerId &&
    isDeepStrictEqual(receipt.commandPayload, commandPayload);
}

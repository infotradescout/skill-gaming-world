import { z } from "zod";

export const robotBlueprintSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(2).max(80),
  parts: z
    .array(
      z.object({
        instanceId: z.string().trim().min(1).max(64),
        partKey: z.string().trim().min(1).max(96),
        parentInstanceId: z.string().trim().min(1).max(64).nullable(),
        socket: z.string().trim().min(1).max(64),
        position: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          z: z.number().finite(),
        }),
        rotationY: z.number().finite(),
      }),
    )
    .max(24),
});

export const buildKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/);

export const buildSelectionSchema = z.object({
  buildId: z.string().uuid(),
  revision: z.number().int().positive().optional(),
});

export function robotCombatStatus(error: unknown): number {
  if (!error || typeof error !== "object" || !("code" in error)) return 500;
  switch ((error as { code?: string }).code) {
    case "INVALID_BUILD":
    case "ACTION_ID_CONFLICT":
      return 400;
    case "BUILD_NOT_FOUND":
    case "MATCH_NOT_FOUND":
      return 404;
    case "MATCH_FORBIDDEN":
    case "ACCOUNT_RESTRICTED":
      return 403;
    case "MATCH_COMMAND_REJECTED":
      return 409;
    default:
      return 500;
  }
}

import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const runtimeEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEMO_MODE: z
      .enum(["true", "false"])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === "true",
      ),
    DATABASE_URL: z.string().url().optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    COMPETITION_SEED_ENCRYPTION_KEY: z.string().min(32).optional(),
    FEATURE_MONETAIRE_PRIZE: booleanString,
    FEATURE_SOCIAL_CASINO: booleanString,
    FEATURE_REAL_MONEY_CASINO: booleanString,
    FEATURE_PRODUCTION_PAYMENTS: booleanString,
    MONETAIRE_PLAY_JURISDICTIONS: z.string().default("US"),
  })
  .superRefine((env, context) => {
    const demoMode = env.DEMO_MODE ?? env.NODE_ENV !== "production";

    if (env.NODE_ENV === "production" && demoMode) {
      context.addIssue({
        code: "custom",
        path: ["DEMO_MODE"],
        message: "DEMO_MODE cannot be enabled in a production runtime.",
      });
    }

    if (!demoMode && !env.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required outside demo mode.",
      });
    }

    if (!demoMode && !env.SESSION_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET is required outside demo mode.",
      });
    }
  });

export type RuntimeEnv = ReturnType<typeof getRuntimeEnv>;

export function getRuntimeEnv() {
  const parsed = runtimeEnvSchema.parse(process.env);
  const demoMode = parsed.DEMO_MODE ?? parsed.NODE_ENV !== "production";

  return {
    ...parsed,
    DEMO_MODE: demoMode,
    SESSION_SECRET:
      parsed.SESSION_SECRET ??
      (demoMode ? "demo-only-session-secret-not-for-production" : undefined),
    MONETAIRE_PLAY_JURISDICTIONS: parsed.MONETAIRE_PLAY_JURISDICTIONS.split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  };
}

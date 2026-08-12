import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "--webpack"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        "--import=./tools/node-memory-compat.mjs",
      ]
        .filter(Boolean)
        .join(" "),
      DEMO_MODE: "false",
      DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/build",
      SESSION_SECRET: "build-verification-only-session-secret-32",
      COMPETITION_SEED_ENCRYPTION_KEY:
        "build-verification-only-ranked-seed-key-32",
      PREVIEW_OWNER_EMAIL: "owner@example.com",
    },
  },
);

process.exit(result.status ?? 1);

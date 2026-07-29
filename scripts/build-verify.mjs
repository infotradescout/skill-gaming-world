import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");

const result = spawnSync(process.execPath, [nextCli, "build"], {
  env: {
    ...process.env,
    DEMO_MODE: "false",
    DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/build",
    SESSION_SECRET: "build-verification-only-session-secret-32",
    COMPETITION_SEED_ENCRYPTION_KEY:
      "build-verification-only-ranked-seed-key-32",
    PREVIEW_OWNER_EMAIL: "owner@example.com",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error("Unable to start the configured-mode build verification.");
  process.exit(1);
}

process.exit(result.status ?? 1);

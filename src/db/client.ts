import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getRuntimeEnv } from "@/lib/env";

import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase() {
  const env = getRuntimeEnv();

  if (env.DEMO_MODE) {
    throw new Error("DATABASE_DISABLED_IN_DEMO_MODE");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL_REQUIRED");
  }

  if (!client || !database) {
    client = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    database = drizzle(client, { schema });
  }

  return database;
}

export async function closeDatabase() {
  if (client) {
    await client.end({ timeout: 5 });
  }
  client = undefined;
  database = undefined;
}

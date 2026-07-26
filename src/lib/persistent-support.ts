import { desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  appeals,
  auditEvents,
  gameSessions,
} from "@/db/schema";

export async function listPersistentAppeals(userId: string) {
  return getDatabase()
    .select()
    .from(appeals)
    .where(eq(appeals.userId, userId))
    .orderBy(desc(appeals.createdAt));
}

export async function createPersistentAppeal(input: {
  userId: string;
  gameSessionId?: string;
  subject: string;
  statement: string;
}) {
  const database = getDatabase();
  if (input.gameSessionId) {
    const [session] = await database
      .select({ userId: gameSessions.userId })
      .from(gameSessions)
      .where(eq(gameSessions.id, input.gameSessionId))
      .limit(1);
    if (!session) throw new Error("GAME_SESSION_NOT_FOUND");
    if (session.userId !== input.userId) {
      throw new Error("GAME_SESSION_FORBIDDEN");
    }
  }
  const [appeal] = await database
    .insert(appeals)
    .values({ ...input, status: "OPEN" })
    .returning();
  return appeal;
}

export async function listPersistentAuditEvents(limit = 250) {
  return getDatabase()
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

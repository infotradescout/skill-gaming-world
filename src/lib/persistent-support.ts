import { desc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  appeals,
  auditEvents,
  gameSessions,
} from "@/db/schema";
import { appendPersistentAuditEvent } from "./audit";

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
  requestId?: string;
}) {
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    if (input.gameSessionId) {
      const [session] = await transaction
        .select({ userId: gameSessions.userId })
        .from(gameSessions)
        .where(eq(gameSessions.id, input.gameSessionId))
        .limit(1);
      if (!session) throw new Error("GAME_SESSION_NOT_FOUND");
      if (session.userId !== input.userId) {
        throw new Error("GAME_SESSION_FORBIDDEN");
      }
    }
    const [appeal] = await transaction
      .insert(appeals)
      .values({
        userId: input.userId,
        gameSessionId: input.gameSessionId,
        subject: input.subject,
        statement: input.statement,
        status: "OPEN",
        createdAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .returning();
    if (!appeal) throw new Error("APPEAL_CREATION_FAILED");
    await appendPersistentAuditEvent(transaction, {
      eventType: "PLAYER_APPEAL_SUBMITTED",
      actorId: input.userId,
      subjectType: "APPEAL",
      subjectId: appeal.id,
      reason: "Player submitted a reviewable appeal.",
      requestId: input.requestId,
      afterState: {
        status: appeal.status,
        gameSessionId: appeal.gameSessionId,
        environment: "configured",
      },
    });
    return appeal;
  });
}

export async function listPersistentAuditEvents(limit = 250) {
  return getDatabase()
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

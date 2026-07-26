import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getDemoStore, type DemoUser } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { createId } from "./ids";
import {
  createPersistentSession,
  persistentUserFromToken,
  revokePersistentSession,
} from "./persistent-auth";

export const SESSION_COOKIE = "sgw_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createDemoSession(userId: string) {
  const env = getRuntimeEnv();
  if (!env.DEMO_MODE) {
    throw new Error("PRODUCTION_SESSION_ADAPTER_NOT_CONFIGURED");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = Date.now();
  getDemoStore().sessionsByTokenHash.set(tokenHash, {
    tokenHash,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  return { token, expiresAt: new Date(now + SESSION_TTL_MS) };
}

export async function createRuntimeSession(userId: string) {
  return getRuntimeEnv().DEMO_MODE
    ? createDemoSession(userId)
    : createPersistentSession(userId);
}

export function setSessionCookie(
  response: NextResponse,
  session: { token: string; expiresAt: Date },
) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export function revokeDemoSession(request: NextRequest) {
  if (!getRuntimeEnv().DEMO_MODE) {
    throw new Error("PRODUCTION_SESSION_ADAPTER_NOT_CONFIGURED");
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    getDemoStore().sessionsByTokenHash.delete(hashToken(token));
  }
}

export async function revokeRuntimeSession(request: NextRequest) {
  if (getRuntimeEnv().DEMO_MODE) {
    revokeDemoSession(request);
    return;
  }
  await revokePersistentSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function currentDemoUser(request: NextRequest): DemoUser | null {
  const env = getRuntimeEnv();
  if (!env.DEMO_MODE) {
    return null;
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return demoUserFromToken(token);
}

export async function currentRuntimeUser(
  request: NextRequest,
): Promise<DemoUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return runtimeUserFromToken(token);
}

export async function runtimeUserFromToken(
  token?: string,
): Promise<DemoUser | null> {
  return getRuntimeEnv().DEMO_MODE
    ? demoUserFromToken(token)
    : persistentUserFromToken(token);
}

export function demoUserFromToken(token?: string): DemoUser | null {
  const env = getRuntimeEnv();
  if (!env.DEMO_MODE) {
    return null;
  }

  if (!token) {
    return null;
  }

  const store = getDemoStore();
  const session = store.sessionsByTokenHash.get(hashToken(token));
  if (!session) {
    return null;
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    store.sessionsByTokenHash.delete(session.tokenHash);
    return null;
  }
  return store.usersById.get(session.userId) ?? null;
}

export function publicUser(user: DemoUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    cooldownUntil: user.cooldownUntil,
    adminRoles: user.adminRoles,
    createdAt: user.createdAt,
  };
}

export function createDemoUserId(): string {
  return createId("usr");
}

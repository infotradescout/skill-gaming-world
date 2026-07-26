import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { getRuntimeEnv } from "./env";
import { createId } from "./ids";
import { getDatabase } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { sql } from "drizzle-orm";

const rateBuckets = new Map<string, { count: number; resetsAt: number }>();
const MAX_DEMO_RATE_BUCKETS = 2_048;

export function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id")?.slice(0, 128) ?? createId("req");
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  id?: string,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId: id,
      },
    },
    { status },
  );
}

export function enforceSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (
    origin === request.nextUrl.origin ||
    isEquivalentLocalOrigin(origin, request.nextUrl.origin)
  ) {
    return null;
  }

  if (!origin && request.headers.get("sec-fetch-site") === "same-origin") {
    return null;
  }

  return jsonError(
    403,
    "ORIGIN_REJECTED",
    "A verified same-origin request is required.",
    requestId(request),
  );
}

function isEquivalentLocalOrigin(
  suppliedOrigin: string | null,
  requestOrigin: string,
): boolean {
  if (process.env.NODE_ENV === "production" || !suppliedOrigin) {
    return false;
  }

  try {
    const supplied = new URL(suppliedOrigin);
    const expected = new URL(requestOrigin);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

    return (
      supplied.protocol === expected.protocol &&
      supplied.port === expected.port &&
      loopbackHosts.has(supplied.hostname) &&
      loopbackHosts.has(expected.hostname)
    );
  } catch {
    return false;
  }
}

export async function enforceRateLimit(
  request: NextRequest,
  bucket: string,
  limit: number,
  intervalMs: number,
): Promise<NextResponse | null> {

  /*
   * The in-process limiter is deliberately safe-demo-only. It does not trust
   * client-supplied forwarding headers. Authenticated buckets are keyed by a
   * hash of the opaque session cookie; anonymous demo requests share one
   * conservative bucket per operation.
   */
  const rawSession = request.cookies.get("sgw_session")?.value;
  const subject = rawSession
    ? createHash("sha256").update(rawSession).digest("hex")
    : "anonymous";
  const key = `${bucket}:${subject}`;
  const now = Date.now();
  if (!getRuntimeEnv().DEMO_MODE) {
    const resetsAt = new Date(now + intervalMs);
    const [record] = await getDatabase()
      .insert(rateLimitBuckets)
      .values({ bucketKey: key, requestCount: 1, resetsAt })
      .onConflictDoUpdate({
        target: rateLimitBuckets.bucketKey,
        set: {
          requestCount: sql<number>`CASE
            WHEN ${rateLimitBuckets.resetsAt} <= now() THEN 1
            ELSE ${rateLimitBuckets.requestCount} + 1
          END`,
          resetsAt: sql<Date>`CASE
            WHEN ${rateLimitBuckets.resetsAt} <= now() THEN ${resetsAt}
            ELSE ${rateLimitBuckets.resetsAt}
          END`,
          updatedAt: new Date(),
        },
      })
      .returning({ count: rateLimitBuckets.requestCount });
    return record.count > limit
      ? jsonError(
          429,
          "RATE_LIMITED",
          "Too many requests. Try again later.",
          requestId(request),
        )
      : null;
  }

  const current = rateBuckets.get(key);

  if (!current || current.resetsAt <= now) {
    if (rateBuckets.size >= MAX_DEMO_RATE_BUCKETS) {
      for (const [candidateKey, candidate] of rateBuckets) {
        if (candidate.resetsAt <= now) {
          rateBuckets.delete(candidateKey);
        }
      }
    }
    if (rateBuckets.size >= MAX_DEMO_RATE_BUCKETS) {
      return jsonError(
        503,
        "RATE_LIMIT_CAPACITY_REACHED",
        "The safe-demo request limiter is at capacity.",
        requestId(request),
      );
    }
    rateBuckets.set(key, { count: 1, resetsAt: now + intervalMs });
    return null;
  }

  current.count += 1;
  if (current.count > limit) {
    return jsonError(
      429,
      "RATE_LIMITED",
      "Too many requests. Try again later.",
      requestId(request),
    );
  }

  return null;
}

export function resetDemoRateLimitsForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("RATE_LIMIT_TEST_RESET_FORBIDDEN");
  }
  rateBuckets.clear();
}

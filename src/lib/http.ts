import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";

import { getRuntimeEnv } from "./env";
import { createId } from "./ids";
import { getDatabase } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { sql } from "drizzle-orm";

const rateBuckets = new Map<string, { count: number; resetsAt: number }>();
const MAX_DEMO_RATE_BUCKETS = 2_048;
const CONFIGURED_RATE_LIMIT_SHARDS = 256;

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
    isEquivalentProductionOrigin(origin, request.nextUrl.origin) ||
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

function isEquivalentProductionOrigin(
  suppliedOrigin: string | null,
  requestOrigin: string,
): boolean {
  if (process.env.NODE_ENV !== "production" || !suppliedOrigin) {
    return false;
  }

  try {
    const supplied = new URL(suppliedOrigin);
    const expected = new URL(requestOrigin);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

    return (
      supplied.protocol === "https:" &&
      supplied.host === expected.host &&
      !loopbackHosts.has(supplied.hostname) &&
      !loopbackHosts.has(expected.hostname)
    );
  } catch {
    return false;
  }
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
  options?: { anonymousCredential?: string },
): Promise<NextResponse | null> {
  /*
   * Neither mode trusts client-supplied forwarding headers. Safe demo uses a
   * capped in-process map. Configured mode uses bounded server-keyed shards;
   * a cookie only influences a shard and is never treated as authenticated
   * identity. Login/register prefer their normalized credential partition.
   */
  const rawSession = request.cookies.get("sgw_session")?.value;
  const env = getRuntimeEnv();
  if (!env.DEMO_MODE) {
    if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET_REQUIRED");
    // Login/register always partition by the submitted credential, even if an
    // attacker rotates a forged session cookie. Other cookies are unverified
    // inputs too: keyed sharding bounds their database cardinality and must not
    // be mistaken for authenticated identity.
    const source = options?.anonymousCredential
      ? `credential:${options.anonymousCredential.trim().toLowerCase()}`
      : rawSession
        ? `unverified-session:${rawSession}`
        : "anonymous:shared";
    const shardNumber = createHmac("sha256", env.SESSION_SECRET)
      .update(`${bucket}\0${source}`)
      .digest()[0] % CONFIGURED_RATE_LIMIT_SHARDS;
    const shard = shardNumber
      .toString(16)
      .padStart(2, "0");
    const sourceKind = options?.anonymousCredential
      ? "credential"
      : rawSession
        ? "unverified-session"
        : "anonymous";
    const key = `${bucket}:${sourceKind}-shard-${shard}`;
    const record = await getDatabase().transaction(async (transaction) => {
      // The reset index makes this bounded cleanup cheap. It retires legacy
      // per-cookie rows and ensures configured limiter storage cannot grow
      // without bound across expired windows.
      await transaction
        .delete(rateLimitBuckets)
        .where(sql`${rateLimitBuckets.resetsAt} <= clock_timestamp()`);
      const [updated] = await transaction
        .insert(rateLimitBuckets)
        .values({
          bucketKey: key,
          requestCount: 1,
          resetsAt: sql`clock_timestamp() + (${intervalMs} * interval '1 millisecond')`,
          updatedAt: sql`clock_timestamp()`,
        })
        .onConflictDoUpdate({
          target: rateLimitBuckets.bucketKey,
          set: {
            requestCount: sql<number>`${rateLimitBuckets.requestCount} + 1`,
            resetsAt: rateLimitBuckets.resetsAt,
            updatedAt: sql`clock_timestamp()`,
          },
        })
        .returning({ count: rateLimitBuckets.requestCount });
      if (!updated) throw new Error("RATE_LIMIT_BUCKET_UPDATE_FAILED");
      return updated;
    });
    return record.count > limit
      ? jsonError(
          429,
          "RATE_LIMITED",
          "Too many requests. Try again later.",
          requestId(request),
        )
      : null;
  }

  const subject = rawSession
    ? createHash("sha256").update(rawSession).digest("hex")
    : "anonymous";
  const key = `${bucket}:${subject}`;
  const now = Date.now();

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

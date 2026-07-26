import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { getRuntimeEnv } from "./env";
import { createId } from "./ids";

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
  if (origin === request.nextUrl.origin) {
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

export function enforceRateLimit(
  request: NextRequest,
  bucket: string,
  limit: number,
  intervalMs: number,
): NextResponse | null {
  if (!getRuntimeEnv().DEMO_MODE) {
    return jsonError(
      503,
      "RATE_LIMIT_ADAPTER_REQUIRED",
      "This operation requires the configured shared rate-limit service.",
      requestId(request),
    );
  }

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

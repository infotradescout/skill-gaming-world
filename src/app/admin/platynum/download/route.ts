import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";

import { requireAdminRoles } from "@/lib/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const desktopArchiveName = "Platynum-47-0.2.0-windows-x64.zip";
const desktopArchivePath = resolve(process.cwd(), ".platynum-artifacts", desktopArchiveName);

function hasValidDirectAccess(request?: Request) {
  const expected = process.env.P47_DOWNLOAD_TOKEN?.trim();
  const supplied = request
    ? new URL(request.url).searchParams.get("access")?.trim()
    : undefined;

  if (!expected || expected.length < 32 || !supplied || supplied.length < 32) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

export async function GET(request?: Request) {
  if (!hasValidDirectAccess(request)) {
    await requireAdminRoles(["SUPER_ADMIN"]);
  }

  try {
    const file = await stat(desktopArchivePath);
    if (!file.isFile()) throw new Error("Windows app is unavailable.");

    return new Response(Readable.toWeb(createReadStream(desktopArchivePath)) as ReadableStream<Uint8Array>, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${desktopArchiveName}"`,
        "Content-Length": String(file.size),
        "Content-Type": "application/zip",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("The Windows app is not available yet.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

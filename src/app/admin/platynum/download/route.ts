import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";

import { requireAdminRoles } from "@/lib/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const desktopArchiveName = "Platynum-47-0.2.0-windows-x64.zip";
const desktopArchivePath = resolve(process.cwd(), ".platynum-artifacts", desktopArchiveName);

export async function GET() {
  await requireAdminRoles(["SUPER_ADMIN"]);

  try {
    const file = await stat(desktopArchivePath);
    if (!file.isFile()) throw new Error("Windows app is unavailable.");

    return new Response(Readable.toWeb(createReadStream(desktopArchivePath)) as ReadableStream<Uint8Array>, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${desktopArchiveName}"`,
        "Content-Length": String(file.size),
        "Content-Type": "application/zip",
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

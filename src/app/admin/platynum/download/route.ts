import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";

import { requireAdminRoles } from "@/lib/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const installerName = "Platynum-47-Setup-0.2.0.exe";
const installerPath = resolve(process.cwd(), ".platynum-artifacts", installerName);

export async function GET() {
  await requireAdminRoles(["SUPER_ADMIN"]);

  try {
    const file = await stat(installerPath);
    if (!file.isFile()) throw new Error("Installer is unavailable.");

    return new Response(Readable.toWeb(createReadStream(installerPath)) as ReadableStream<Uint8Array>, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${installerName}"`,
        "Content-Length": String(file.size),
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("The Windows installer is not available yet.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

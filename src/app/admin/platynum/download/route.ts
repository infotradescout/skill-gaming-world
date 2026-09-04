import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";

import { requireAdminRoles } from "@/lib/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const desktopArchiveName = "Platynum-47-0.2.0-windows-x64.zip";
const desktopArchivePath = resolve(process.cwd(), ".platynum-artifacts", desktopArchiveName);
const confirmationLifetimeMs = 5 * 60 * 1000;
const maxOutstandingConfirmations = 256;
const confirmations = new Map<string, number>();

function suppliedAccess(request?: Request) {
  return request
    ? new URL(request.url).searchParams.get("access")?.trim()
    : undefined;
}

function hasValidDirectAccess(supplied?: string) {
  const expected = process.env.P47_DOWNLOAD_TOKEN?.trim();
  if (!expected || expected.length < 32 || !supplied || supplied.length < 32) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

async function authorizeEntry(request?: Request) {
  const supplied = suppliedAccess(request);
  if (supplied) return hasValidDirectAccess(supplied);
  await requireAdminRoles(["SUPER_ADMIN"]);
  return true;
}

function pruneConfirmations(now = Date.now()) {
  for (const [ticket, expiresAt] of confirmations) {
    if (expiresAt <= now) confirmations.delete(ticket);
  }
  while (confirmations.size >= maxOutstandingConfirmations) {
    const oldest = confirmations.keys().next().value as string | undefined;
    if (!oldest) break;
    confirmations.delete(oldest);
  }
}

function issueConfirmation() {
  pruneConfirmations();
  const ticket = randomBytes(32).toString("base64url");
  confirmations.set(ticket, Date.now() + confirmationLifetimeMs);
  return ticket;
}

function consumeConfirmation(ticket: string) {
  const now = Date.now();
  pruneConfirmations(now);
  const expiresAt = confirmations.get(ticket);
  if (!expiresAt || expiresAt <= now) return false;
  confirmations.delete(ticket);
  return true;
}

function privateHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

function expiredLinkResponse() {
  return new Response("This private Platynum download link is invalid or has expired.", {
    status: 404,
    headers: privateHeaders(),
  });
}

function confirmationPage(ticket: string) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Download Platynum-47</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0d1117; color: #f0f3f6; }
    main { width: min(34rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #30363d; border-radius: 1rem; background: #161b22; box-shadow: 0 1rem 3rem rgba(0,0,0,.35); }
    h1 { margin: 0 0 .75rem; font-size: 1.7rem; }
    p { margin: 0 0 1.25rem; color: #b1bac4; line-height: 1.55; }
    button { width: 100%; border: 0; border-radius: .7rem; padding: .95rem 1rem; font: inherit; font-weight: 700; cursor: pointer; background: #f0f3f6; color: #0d1117; }
    button:disabled { cursor: wait; opacity: .65; }
    small { display: block; margin-top: 1rem; color: #8c959f; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <h1>Platynum-47 for Windows</h1>
    <p>The file will download once after you press the button below. Browser previews cannot start it automatically.</p>
    <form method="post" action="/admin/platynum/download" onsubmit="const button=this.querySelector('button');button.disabled=true;button.textContent='Starting download…';">
      <input type="hidden" name="ticket" value="${ticket}">
      <button type="submit">Download Platynum-47 once</button>
    </form>
    <small>This confirmation expires in five minutes. Reload the private link if it expires before you press the button.</small>
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      ...privateHeaders(),
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

async function archiveResponse() {
  try {
    const file = await stat(desktopArchivePath);
    if (!file.isFile()) throw new Error("Windows app is unavailable.");

    return new Response(Readable.toWeb(createReadStream(desktopArchivePath)) as ReadableStream<Uint8Array>, {
      headers: {
        ...privateHeaders(),
        "Content-Disposition": `attachment; filename="${desktopArchiveName}"`,
        "Content-Length": String(file.size),
        "Content-Type": "application/zip",
      },
    });
  } catch {
    return new Response("The Windows app is not available yet.", {
      status: 404,
      headers: privateHeaders(),
    });
  }
}

export async function HEAD(request?: Request) {
  if (!(await authorizeEntry(request))) return expiredLinkResponse();
  return new Response(null, { status: 204, headers: privateHeaders() });
}

export async function GET(request?: Request) {
  if (!(await authorizeEntry(request))) return expiredLinkResponse();
  return confirmationPage(issueConfirmation());
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const submitted = form?.get("ticket");
  const ticket = typeof submitted === "string" ? submitted.trim() : "";

  if (!ticket || !consumeConfirmation(ticket)) {
    return new Response("This download confirmation is invalid, expired, or was already used.", {
      status: 409,
      headers: privateHeaders(),
    });
  }

  return archiveResponse();
}

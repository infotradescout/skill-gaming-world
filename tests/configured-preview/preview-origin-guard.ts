export const canonicalServiceOrigin =
  "https://skill-gaming-world.onrender.com";

export function isCanonicalPreviewOptedIn(): boolean {
  const allowCanonicalOrigin =
    process.env.PREVIEW_ALLOW_CANONICAL_ORIGIN?.trim().toLowerCase() ===
    "true";
  const targetId = process.env.PREVIEW_E2E_TARGET_ID?.trim() ?? "";
  const databaseFingerprint =
    process.env.PREVIEW_DATABASE_FINGERPRINT?.trim() ?? "";

  return (
    allowCanonicalOrigin &&
    /^sgw-canonical-preview-[a-z0-9-]+$/i.test(targetId) &&
    /^[a-f0-9]{64}$/i.test(databaseFingerprint)
  );
}

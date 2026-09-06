/** Storage is an optional convenience, never the authority for a saved game. */
export type BrowserStorageKind = "localStorage" | "sessionStorage";

export function readBrowserStorage(kind: BrowserStorageKind, key: string): {
  available: boolean;
  value: string | null;
} {
  try {
    if (typeof window === "undefined") return { available: false, value: null };
    return { available: true, value: window[kind].getItem(key) };
  } catch {
    // Accessing window.localStorage itself can throw, before getItem runs.
    return { available: false, value: null };
  }
}

export function writeBrowserStorage(
  kind: BrowserStorageKind,
  key: string,
  value: string | null,
): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (value === null) window[kind].removeItem(key);
    else window[kind].setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

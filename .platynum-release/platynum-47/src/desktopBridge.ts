import type { RuntimeProject } from "./runtime.ts";

export interface PlatynumDesktopBridge {
  chooseProjectFolder: () => Promise<RuntimeProject | null>;
}

declare global {
  interface Window {
    platynumDesktop?: PlatynumDesktopBridge;
  }
}

/** Present only inside the packaged app's main Platynum window. */
export function getDesktopBridge(): PlatynumDesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.platynumDesktop;
  return bridge && typeof bridge.chooseProjectFolder === "function" ? bridge : null;
}

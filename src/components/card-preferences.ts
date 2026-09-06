"use client";

import { useSyncExternalStore } from "react";
import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";

export const CARD_FRONT_OPTIONS = ["classic", "midnight", "parchment"] as const;
export const CARD_BACK_OPTIONS = ["monetaire", "shipyard", "blueprint"] as const;

export type CardFrontPreference = (typeof CARD_FRONT_OPTIONS)[number];
export type CardBackPreference = (typeof CARD_BACK_OPTIONS)[number];

export type CardPreferences = Readonly<{
  front: CardFrontPreference;
  back: CardBackPreference;
}>;

export const DEFAULT_CARD_PREFERENCES: CardPreferences = Object.freeze({
  front: "classic",
  back: "monetaire",
});

const STORAGE_KEY = "monetaire.card-appearance.v1";
const CHANGE_EVENT = "monetaire:card-appearance-changed";

let cachedRaw: string | null | undefined;
let cachedPreferences = DEFAULT_CARD_PREFERENCES;
let memoryOnlyPreference = false;

export function sanitizeCardPreferences(value: unknown): CardPreferences {
  if (!value || typeof value !== "object") return DEFAULT_CARD_PREFERENCES;
  const candidate = value as { front?: unknown; back?: unknown };
  const front = CARD_FRONT_OPTIONS.includes(candidate.front as CardFrontPreference)
    ? (candidate.front as CardFrontPreference)
    : DEFAULT_CARD_PREFERENCES.front;
  const back = CARD_BACK_OPTIONS.includes(candidate.back as CardBackPreference)
    ? (candidate.back as CardBackPreference)
    : DEFAULT_CARD_PREFERENCES.back;
  if (front === DEFAULT_CARD_PREFERENCES.front && back === DEFAULT_CARD_PREFERENCES.back) {
    return DEFAULT_CARD_PREFERENCES;
  }
  return Object.freeze({ front, back });
}

export function mergeCardPreferences(
  current: CardPreferences,
  change: Partial<CardPreferences>,
): CardPreferences {
  return sanitizeCardPreferences({ ...current, ...change });
}

function readCardPreferences(): CardPreferences {
  if (typeof window === "undefined") return DEFAULT_CARD_PREFERENCES;
  if (memoryOnlyPreference) return cachedPreferences;
  const stored = readBrowserStorage("localStorage", STORAGE_KEY);
  if (!stored.available) return cachedPreferences;
  const raw = stored.value;
  if (raw === cachedRaw) return cachedPreferences;
  cachedRaw = raw;
  try {
    cachedPreferences = sanitizeCardPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    cachedPreferences = DEFAULT_CARD_PREFERENCES;
  }
  return cachedPreferences;
}

function subscribeToCardPreferences(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    memoryOnlyPreference = false;
    cachedRaw = undefined;
    callback();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useCardPreferences(): CardPreferences {
  return useSyncExternalStore(
    subscribeToCardPreferences,
    readCardPreferences,
    () => DEFAULT_CARD_PREFERENCES,
  );
}

export function saveCardPreferences(preferences: CardPreferences): void {
  const normalized = sanitizeCardPreferences(preferences);
  const raw = JSON.stringify(normalized);
  cachedRaw = raw;
  cachedPreferences = normalized;
  memoryOnlyPreference = !writeBrowserStorage("localStorage", STORAGE_KEY, raw);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

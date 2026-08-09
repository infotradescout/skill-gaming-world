"use client";

import { useSyncExternalStore } from "react";

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
  const raw = window.localStorage.getItem(STORAGE_KEY);
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
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
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
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedPreferences = normalized;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

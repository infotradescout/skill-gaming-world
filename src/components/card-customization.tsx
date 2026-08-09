"use client";

import {
  CARD_BACK_OPTIONS,
  CARD_FRONT_OPTIONS,
  mergeCardPreferences,
  saveCardPreferences,
  useCardPreferences,
  type CardBackPreference,
  type CardFrontPreference,
} from "./card-preferences";

const FRONT_LABELS: Record<CardFrontPreference, { name: string; detail: string }> = {
  classic: { name: "Classic", detail: "Warm ivory table cards" },
  midnight: { name: "Midnight", detail: "Dark high-contrast faces" },
  parchment: { name: "Parchment", detail: "Aged gold tournament faces" },
};

const BACK_LABELS: Record<CardBackPreference, { name: string; detail: string }> = {
  monetaire: { name: "Monetaire", detail: "The original green-and-brass back" },
  shipyard: { name: "Shipyard", detail: "Bay 13 industrial stripe" },
  blueprint: { name: "Blueprint", detail: "Deep blue measured grid" },
};

export function CardCustomization() {
  const preferences = useCardPreferences();

  return (
    <section className="card-customizer surface-soft" aria-labelledby="card-customizer-title">
      <div className="card-customizer-heading">
        <div>
          <p className="eyebrow">Your deck</p>
          <h2 id="card-customizer-title">Choose the front and back independently.</h2>
        </div>
        <p>
          Appearance stays on this device. It never changes the deal, legal moves,
          score, timer, rank, or another player&apos;s cards.
        </p>
      </div>
      <div className="card-customizer-grid">
        <fieldset>
          <legend>Card fronts</legend>
          <div className="card-customizer-options">
            {CARD_FRONT_OPTIONS.map((front) => (
              <button
                aria-pressed={preferences.front === front}
                className={`card-theme-button card-front-swatch-${front}`}
                key={front}
                type="button"
                onClick={() =>
                  saveCardPreferences(mergeCardPreferences(preferences, { front }))
                }
              >
                <span aria-hidden="true">A♠</span>
                <strong>{FRONT_LABELS[front].name}</strong>
                <small>{FRONT_LABELS[front].detail}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Card backs</legend>
          <div className="card-customizer-options">
            {CARD_BACK_OPTIONS.map((back) => (
              <button
                aria-pressed={preferences.back === back}
                className={`card-theme-button card-back-swatch-${back}`}
                key={back}
                type="button"
                onClick={() =>
                  saveCardPreferences(mergeCardPreferences(preferences, { back }))
                }
              >
                <span aria-hidden="true">M</span>
                <strong>{BACK_LABELS[back].name}</strong>
                <small>{BACK_LABELS[back].detail}</small>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

export const PRODUCT_MODES = [
  "MONETAIRE_PLAY",
  "MONETAIRE_PRIZE",
  "SOCIAL_CASINO",
  "REAL_MONEY_CASINO",
] as const;

export type ProductMode = (typeof PRODUCT_MODES)[number];

export function isSkillGamingWorldMode(mode: ProductMode): boolean {
  return mode === "MONETAIRE_PLAY" || mode === "MONETAIRE_PRIZE";
}

export function isCasinoMode(mode: ProductMode): boolean {
  return mode === "SOCIAL_CASINO" || mode === "REAL_MONEY_CASINO";
}

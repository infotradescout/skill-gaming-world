export const GAME_TITLE_SIDES = ["FREE", "LEGAL_PLAY"] as const;
export type GameTitleSide = (typeof GAME_TITLE_SIDES)[number];

export const GAME_TITLE_VALUE_CLASSES = [
  "NO_VALUE",
  "PLAY_COIN",
  "SKILL_PRIZE",
  "CASINO",
] as const;
export type GameTitleValueClass = (typeof GAME_TITLE_VALUE_CLASSES)[number];

export const GAME_TITLE_LEGAL_OFFERING_CLASSES = [
  "NOT_APPLICABLE",
  "NONCASH_PLAY",
  "SKILL_PRIZE",
  "SOCIAL_CASINO",
  "REAL_MONEY_CASINO",
] as const;
export type GameTitleLegalOfferingClass =
  (typeof GAME_TITLE_LEGAL_OFFERING_CLASSES)[number];

export const GAME_TITLE_DEVELOPMENT_STATUSES = [
  "ACTIVE",
  "IN_DEVELOPMENT",
  "HELD",
] as const;
export type GameTitleDevelopmentStatus =
  (typeof GAME_TITLE_DEVELOPMENT_STATUSES)[number];

export interface GameTitleCatalogEntry {
  key: string;
  workingTitle: string;
  side: GameTitleSide;
  category: "SKILL" | "CASINO";
  valueClass: GameTitleValueClass;
  legalOfferingClass: GameTitleLegalOfferingClass;
  developmentStatus: GameTitleDevelopmentStatus;
  publicSummary: string;
  matchPlayAvailable: boolean;
  routes: {
    marketing: string;
    development?: string;
  };
}

export const GAME_TITLE_CATALOG: readonly GameTitleCatalogEntry[] = [
  {
    key: "MONETAIRE_SOLITAIRE",
    workingTitle: "Monetaire",
    side: "FREE",
    category: "SKILL",
    valueClass: "PLAY_COIN",
    legalOfferingClass: "NONCASH_PLAY",
    developmentStatus: "ACTIVE",
    publicSummary:
      "Competitive solitaire with deterministic deals, practice, and noncash ranked competition.",
    matchPlayAvailable: true,
    routes: {
      marketing: "/monetaire",
      development: "/app/monetaire",
    },
  },
  {
    key: "SGW_ROBOT_COMBAT",
    workingTitle: "Robot Combat",
    side: "FREE",
    category: "SKILL",
    valueClass: "NO_VALUE",
    legalOfferingClass: "NOT_APPLICABLE",
    developmentStatus: "IN_DEVELOPMENT",
    publicSummary:
      "A workshop-first free game where builders assemble a machine, test the consequences, and fight from an inspection-valid revision.",
    matchPlayAvailable: true,
    routes: {
      marketing: "/robot-combat",
      development: "/app/robot-combat",
    },
  },
] as const;

export function getGameTitleByKey(key: string): GameTitleCatalogEntry | undefined {
  return GAME_TITLE_CATALOG.find((entry) => entry.key === key);
}

export function getPublicGameTitles(): GameTitleCatalogEntry[] {
  return [...GAME_TITLE_CATALOG];
}

export function getFreeDevelopmentTitles(): GameTitleCatalogEntry[] {
  return GAME_TITLE_CATALOG.filter(
    (entry) => entry.side === "FREE" && entry.developmentStatus === "IN_DEVELOPMENT",
  );
}

export const PROHIBITED_ROBOT_COMBAT_BRANDS = ["BattleBots"] as const;

export function containsProhibitedRobotCombatBrand(value: string): boolean {
  const normalized = value.toLowerCase();
  return PROHIBITED_ROBOT_COMBAT_BRANDS.some((brand) =>
    normalized.includes(brand.toLowerCase()),
  );
}

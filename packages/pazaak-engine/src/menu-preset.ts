import { PAZAAK_RULEBOOK } from "./rules.js";

export type MainMenuIconKey =
  | "rocket"
  | "robot"
  | "seedling"
  | "brain"
  | "crown"
  | "bolt"
  | "search"
  | "users"
  | "plus"
  | "signin"
  | "scroll"
  | "target"
  | "layers"
  | "star"
  | "settings"
  | "user";

type MenuDifficulty = "easy" | "hard" | "professional";

export interface MainMenuAiOptionPreset {
  difficulty: MenuDifficulty;
  label: string;
  tierLabel: string;
  icon: MainMenuIconKey;
  tone: "easy" | "hard" | "professional";
}

export interface MainMenuActionPreset {
  label: string;
  icon: MainMenuIconKey;
  tone: "republic-hyperspace" | "hyperspace-purple" | "outline-hyperspace";
}

export interface MainMenuModeCardPreset {
  key: "ai" | "quick_match" | "private_lobby";
  title: string;
  icon: MainMenuIconKey;
  accent: "orange" | "republic" | "hyperspace";
  description: string;
  offlineNotice: string;
  requiresAuth: boolean;
  aiOptions?: readonly MainMenuAiOptionPreset[];
  primaryAction?: MainMenuActionPreset;
  secondaryAction?: MainMenuActionPreset;
}

export interface MainMenuRulePreset {
  title: string;
  body: string;
  icon: MainMenuIconKey;
  accent: "republic" | "hyperspace" | "yellow";
}

export interface MainMenuPreset {
  brandTitle: string;
  heroTitle: string;
  heroSubtitle: string;
  heroTagline: string;
  rulesTitle: string;
  modeCards: readonly MainMenuModeCardPreset[];
  rules: readonly MainMenuRulePreset[];
}

export const MAIN_MENU_PRESET: MainMenuPreset = {
  brandTitle: "PazaakWorld",
  heroTitle: "PAZAAK",
  heroSubtitle: "The legendary card game from Knights of the Old Republic",
  heroTagline: "First to win 3 sets wins the game. Recover over-20 draws before your turn ends.",
  rulesTitle: "How to Play Pazaak",
  modeCards: [
    {
      key: "ai",
      title: "AI Opponents",
      icon: "robot",
      accent: "orange",
      description: "Practice against AI opponents with different skill levels",
      offlineNotice: "Always available offline",
      requiresAuth: false,
      aiOptions: [
        {
          difficulty: "easy",
          label: "Easy AI",
          tierLabel: "Beginner",
          icon: "seedling",
          tone: "easy",
        },
        {
          difficulty: "hard",
          label: "Hard AI",
          tierLabel: "Advanced",
          icon: "brain",
          tone: "hard",
        },
        {
          difficulty: "professional",
          label: "Professional AI",
          tierLabel: "Expert",
          icon: "crown",
          tone: "professional",
        },
      ],
    },
    {
      key: "quick_match",
      title: "Quick Match",
      icon: "bolt",
      accent: "republic",
      description: "Find random opponents based on your skill level",
      offlineNotice: "Requires internet connection",
      requiresAuth: true,
      primaryAction: {
        label: "Find Match",
        icon: "search",
        tone: "republic-hyperspace",
      },
    },
    {
      key: "private_lobby",
      title: "Private Lobby",
      icon: "users",
      accent: "hyperspace",
      description: "Create or join private games with friends",
      offlineNotice: "Requires internet connection",
      requiresAuth: true,
      primaryAction: {
        label: "Create Lobby",
        icon: "plus",
        tone: "hyperspace-purple",
      },
      secondaryAction: {
        label: "Join Lobby",
        icon: "signin",
        tone: "outline-hyperspace",
      },
    },
  ],
  /**
   * Rules shown on the landing page. Sourced from the authoritative rulebook so
   * the marketing copy and the in-game rulebook never drift.
   */
  rules: [
    {
      title: "Objective",
      body: PAZAAK_RULEBOOK.basics[0]?.body ?? "Pull cards to get as close to 20 as possible without going over.",
      icon: "target",
      accent: "republic",
    },
    {
      title: "Cards",
      body: `Side decks hold ${PAZAAK_RULEBOOK.deckLimits.sideDeckSize} cards; you draw a ${PAZAAK_RULEBOOK.deckLimits.handSize}-card hand once per match. Every side card is spent on use.`,
      icon: "layers",
      accent: "hyperspace",
    },
    {
      title: "Strategy",
      body: PAZAAK_RULEBOOK.strategy[0]?.body ?? "Save recovery cards for busts and gold cards for exact-20 finishes.",
      icon: "star",
      accent: "yellow",
    },
  ],
};

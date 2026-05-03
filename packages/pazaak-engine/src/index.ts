import { getBustProbability } from "./rules.js";

/** WebCrypto in Workers / modern Node; avoids `node:crypto` so the engine can run on Cloudflare. */
const randomUuid = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  throw new Error("crypto.randomUUID is not available in this runtime.");
};

export * from "./opponents.js";
export * from "./progression.js";
export * from "./rewards.js";
export * from "./rules.js";
export {
  MAIN_MENU_PRESET,
  type MainMenuActionPreset,
  type MainMenuAiOptionPreset,
  type MainMenuIconKey,
  type MainMenuModeCardPreset,
  type MainMenuPreset,
  type MainMenuRulePreset,
} from "./menu-preset.js";

// ---------------------------------------------------------------------------
// Card type system.
// ---------------------------------------------------------------------------

export type SideCardType =
  | "plus"             // Fixed positive (+1 to +6)
  | "minus"            // Fixed negative (−1 to −6)
  | "flip"             // Toggleable ± (±1 to ±6)
  | "value_change"     // Toggleable ±1/±2 (TSL 'VV' / 0x16)
  | "copy_previous"    // Copies the resolved value of the previous board card (TSL '$$' / D)
  | "tiebreaker"       // Toggleable ±1T, wins ties
  | "flip_two_four"    // Flips the sign of all +2s and +4s on the board
  | "flip_three_six"   // Flips the sign of all +3s and +6s on the board
  | "mod_previous"     // Wacky-only: reduces the previous board card to its Python-style remainder mod N (%3, %4, %5, %6)
  | "halve_previous"   // Wacky-only: truncates the previous board card's value toward zero (/2)
  | "hard_reset";      // Wacky-only: burns a board slot for 0 and force-ties the set (00)

/**
 * Game-mode flag threaded through every match and ticket. Canonical mode only
 * accepts TSL-verified side cards; wacky mode additionally allows the experimental
 * cards defined above. Matchmaking and ranked play are hard-coded to canonical.
 */
export type PazaakGameMode = "canonical" | "wacky";

export const PAZAAK_GAME_MODES: readonly PazaakGameMode[] = Object.freeze(["canonical", "wacky"] as const);

export const DEFAULT_PAZAAK_GAME_MODE: PazaakGameMode = "canonical";

/** Untrusted game mode value (e.g. restored JSON, query params) before validation. */
export type PazaakGameModeInput = PazaakGameMode | string | number | boolean | null | undefined;

export const isPazaakGameMode = (value: PazaakGameModeInput): value is PazaakGameMode => {
  return value === "canonical" || value === "wacky";
};

export const normalizePazaakGameMode = (value: PazaakGameModeInput): PazaakGameMode => {
  return isPazaakGameMode(value) ? value : DEFAULT_PAZAAK_GAME_MODE;
};

export interface SideCard {
  id: string;
  label: string;
  /** Unsigned magnitude for plus/minus/flip/tiebreaker; 0 for dynamic or effect-driven cards. */
  value: number;
  type: SideCardType;
}

export interface SideCardOption {
  cardId: string;
  displayLabel: string;
  appliedValue: number;
}

export type AdvisorDifficulty = "easy" | "hard" | "professional";
export type AiDifficulty = AdvisorDifficulty;

export interface PazaakAiMove {
  action: "draw" | "stand" | "end_turn" | "play_side";
  cardId?: string;
  appliedValue?: number;
  displayLabel?: string;
  rationale: string;
  delayMs: number;
  difficulty: AiDifficulty;
}

export type AdvisorCategory = "exact" | "recovery" | "pressure" | "setup" | "neutral";

export type AdvisorConfidence = "low" | "medium" | "high";

export type AdvisorAction =
  | { action: "draw"; rationale: string }
  | { action: "stand"; rationale: string }
  | { action: "end_turn"; rationale: string }
  | { action: "play_side"; cardId: string; appliedValue: number; displayLabel: string; rationale: string };

export interface AdvisorAlternative {
  displayLabel: string;
  rationale: string;
  category: AdvisorCategory;
  score: number;
}

export interface AdvisorSnapshot {
  recommendation: AdvisorAction;
  difficulty: AdvisorDifficulty;
  category: AdvisorCategory;
  confidence: AdvisorConfidence;
  bustProbability: number;
  alternatives: AdvisorAlternative[];
}

export interface AppliedSideCard {
  cardId: string;
  label: string;
  appliedValue: number;
}

/** A single card sitting on a player's board (main-deck draw or played side card). */
export interface BoardCard {
  value: number;
  frozen: boolean;
  /** Origin card type — undefined for main-deck draws. Used by board-flip special rules. */
  source?: SideCardType;
}

export const SIDE_DECK_SIZE = 10;
export const HAND_SIZE = 4;
export const MAX_BOARD_SIZE = 9;
export const WIN_SCORE = 20;
export const SETS_TO_WIN = 3;
export const MAX_CONSECUTIVE_TIES = 5;

export interface MatchPlayerState {
  userId: string;
  displayName: string;
  roundWins: number;
  /** Canonical TSL PazaakDecks.2da row ID when known. */
  sideDeckId: number | null;
  /** Canonical TSL PazaakDecks.2da row label when known. */
  sideDeckLabel: string | null;
  /** 10-card sideboard drawn once per match. */
  sideDeck: SideCard[];
  /** 4-card hand drawn from sideDeck once at match start. */
  hand: SideCard[];
  usedCardIds: Set<string>;
  board: BoardCard[];
  sideCardsPlayed: AppliedSideCard[];
  total: number;
  stood: boolean;
  /** True if a Tiebreaker card has been played this set. */
  hasTiebreaker: boolean;
}

export interface CustomSideDeckChoice {
  tokens: readonly string[];
  label?: string;
  enforceTokenLimits?: boolean;
  /**
   * Target game mode. When `canonical` (the default), wacky-only tokens are rejected
   * so deck construction stays TSL-pure. When `wacky`, every supported token is legal.
   */
  gameMode?: PazaakGameMode;
}

export type SideDeckChoice = number | CustomSideDeckChoice;

export interface PendingChallenge {
  id: string;
  channelId: string;
  publicMessageId: string | null;
  challengerId: string;
  challengerName: string;
  challengerDeckId?: number | undefined;
  challengerCustomDeck?: CustomSideDeckChoice | undefined;
  challengedId: string;
  challengedName: string;
  challengedDeckId?: number | undefined;
  challengedCustomDeck?: CustomSideDeckChoice | undefined;
  wager: number;
  createdAt: number;
  expiresAt: number;
}

export interface SpectatorMirror {
  messageId: string;
  ownerId: string;
}

export interface PazaakMatch {
  id: string;
  channelId: string;
  publicMessageId: string | null;
  spectatorMirrors: SpectatorMirror[];
  wager: number;
  players: [MatchPlayerState, MatchPlayerState];
  activePlayerIndex: number;
  setNumber: number;
  setsToWin: number;
  /**
   * Canonical play enforces TSL-verified cards only. Wacky play additionally allows
   * the experimental mod/halve/hard-reset cards. Defaults to canonical for any
   * legacy snapshot that predates the wacky mode flag.
   */
  gameMode: PazaakGameMode;
  mainDeck: number[];
  phase: "turn" | "after-draw" | "after-card" | "completed";
  pendingDraw: number | null;
  statusLine: string;
  createdAt: number;
  updatedAt: number;
  /** Timestamp when the current active player's decision window opened. Reset on every action. */
  turnStartedAt: number;
  /** Timestamp when the current active player's decision window expires. */
  turnDeadlineAt?: number | undefined;
  /** Active disconnect windows by user id. A user forfeits when the configured grace expires. */
  disconnectedSince?: Record<string, number> | undefined;
  /** Seat metadata for single-player and lobby-filled AI opponents. */
  aiSeats?: Record<string, AiDifficulty> | undefined;
  /** Index of the player who opens the first set (random). */
  initialStarterIndex: number;
  /** Index of the player who won the most recent set (null before any set resolves or on tie). */
  lastSetWinnerIndex: number | null;
  /** Number of consecutive tied sets. After MAX_CONSECUTIVE_TIES the match force-resolves. */
  consecutiveTies: number;
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
  loserName: string | null;
  settled: boolean;
}

/**
 * Minimal persistence interface so the coordinator can fire-and-forget
 * match snapshots without importing the concrete store class.
 */
export interface MatchPersistence {
  save(match: PazaakMatch): Promise<void>;
  loadActive(maxAgeMs: number): Promise<PazaakMatch[]>;
}

export interface PazaakCoordinatorOptions {
  turnTimeoutMs?: number | undefined;
  disconnectForfeitMs?: number | undefined;
  now?: (() => number) | undefined;
}

export const getAiThinkingDelayMs = (difficulty: AiDifficulty, random = Math.random): number => {
  switch (difficulty) {
    case "easy":
      return 1000 + Math.floor(random() * 2000);
    case "hard":
      return 2000 + Math.floor(random() * 3000);
    case "professional":
      return 1500 + Math.floor(random() * 2500);
  }
};

export interface CreateDirectMatchInput {
  channelId: string;
  playerOneId: string;
  playerOneName: string;
  playerOneDeck?: SideDeckChoice | undefined;
  playerTwoId: string;
  playerTwoName: string;
  playerTwoDeck?: SideDeckChoice | undefined;
  wager?: number | undefined;
  setsToWin?: number | undefined;
  aiSeats?: Record<string, AiDifficulty> | undefined;
  /** Defaults to canonical when omitted. */
  gameMode?: PazaakGameMode | undefined;
}

export interface MatchmakingTicket {
  userId: string;
  displayName: string;
  mmr: number;
  deck?: SideDeckChoice | undefined;
  preferredMaxPlayers?: number | undefined;
  queuedAt: number;
  /** Matchmaking is hard-coded to canonical, but the field is threaded for parity with lobby flows. */
  gameMode?: PazaakGameMode | undefined;
}

export interface MatchmakingPair {
  first: MatchmakingTicket;
  second: MatchmakingTicket;
}

export interface PazaakLobbyPlayer {
  userId: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  isAi: boolean;
  aiDifficulty?: AiDifficulty | undefined;
  deck?: SideDeckChoice | undefined;
}

export interface PazaakLobby {
  id: string;
  name: string;
  hostId: string;
  passwordProtected: boolean;
  password?: string | undefined;
  maxPlayers: number;
  players: PazaakLobbyPlayer[];
  status: "waiting" | "in_game" | "closed";
  matchId?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Card pool — full KOTOR / TSL canonical side-card catalogue.
// ---------------------------------------------------------------------------

const sideCardTemplates: readonly SideCard[] = [
  // Plus cards (+1 through +6)
  { id: "plus1", label: "+1", value: 1, type: "plus" },
  { id: "plus2", label: "+2", value: 2, type: "plus" },
  { id: "plus3", label: "+3", value: 3, type: "plus" },
  { id: "plus4", label: "+4", value: 4, type: "plus" },
  { id: "plus5", label: "+5", value: 5, type: "plus" },
  { id: "plus6", label: "+6", value: 6, type: "plus" },
  // Minus cards (−1 through −6)
  { id: "minus1", label: "-1", value: 1, type: "minus" },
  { id: "minus2", label: "-2", value: 2, type: "minus" },
  { id: "minus3", label: "-3", value: 3, type: "minus" },
  { id: "minus4", label: "-4", value: 4, type: "minus" },
  { id: "minus5", label: "-5", value: 5, type: "minus" },
  { id: "minus6", label: "-6", value: 6, type: "minus" },
  // Flip cards (±1 through ±6)
  { id: "flip1", label: "±1", value: 1, type: "flip" },
  { id: "flip2", label: "±2", value: 2, type: "flip" },
  { id: "flip3", label: "±3", value: 3, type: "flip" },
  { id: "flip4", label: "±4", value: 4, type: "flip" },
  { id: "flip5", label: "±5", value: 5, type: "flip" },
  { id: "flip6", label: "±6", value: 6, type: "flip" },
  // Special cards (canonical TSL)
  { id: "valuechange", label: "±1/2", value: 0, type: "value_change" },
  { id: "copyprev", label: "D", value: 0, type: "copy_previous" },
  { id: "tiebreaker", label: "±1T", value: 1, type: "tiebreaker" },
  { id: "flip24", label: "Flip 2&4", value: 0, type: "flip_two_four" },
  { id: "flip36", label: "Flip 3&6", value: 0, type: "flip_three_six" },
  // Wacky-only cards — never drawn or accepted in canonical play.
  { id: "mod3", label: "%3", value: 3, type: "mod_previous" },
  { id: "mod4", label: "%4", value: 4, type: "mod_previous" },
  { id: "mod5", label: "%5", value: 5, type: "mod_previous" },
  { id: "mod6", label: "%6", value: 6, type: "mod_previous" },
  { id: "halve", label: "/2", value: 0, type: "halve_previous" },
  { id: "hardreset", label: "00", value: 0, type: "hard_reset" },
] as const;

/**
 * Required game mode for each side-card type. Canonical-mode matches reject cards
 * whose required mode is `wacky`, both at deck-construction and at play time.
 */
const cardTypeRequiredMode: Readonly<Record<SideCardType, PazaakGameMode>> = {
  plus: "canonical",
  minus: "canonical",
  flip: "canonical",
  value_change: "canonical",
  copy_previous: "canonical",
  tiebreaker: "canonical",
  flip_two_four: "canonical",
  flip_three_six: "canonical",
  mod_previous: "wacky",
  halve_previous: "wacky",
  hard_reset: "wacky",
};

export const getCardTypeRequiredMode = (type: SideCardType): PazaakGameMode => {
  return cardTypeRequiredMode[type];
};

/**
 * Returns true when a side-card type is legal in the supplied game mode. Wacky mode
 * is a superset of canonical, so every canonical card remains playable there too.
 */
export const isCardTypeAllowedInMode = (type: SideCardType, mode: PazaakGameMode): boolean => {
  const required = cardTypeRequiredMode[type];
  return mode === "wacky" || required === "canonical";
};

const shuffle = <T>(items: readonly T[]): T[] => {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }

  return copy;
};

const cloneCard = (card: SideCard): SideCard => ({ ...card });

export interface CanonicalSideDeckDefinition {
  id: number;
  label: string;
  cards: readonly string[];
  supported: boolean;
}

const cardTemplateById = new Map(sideCardTemplates.map((card) => [card.id, card]));

const sideDeckTokenToTemplateId: Readonly<Record<string, string>> = {
  "+1": "plus1",
  "+2": "plus2",
  "+3": "plus3",
  "+4": "plus4",
  "+5": "plus5",
  "+6": "plus6",
  "-1": "minus1",
  "-2": "minus2",
  "-3": "minus3",
  "-4": "minus4",
  "-5": "minus5",
  "-6": "minus6",
  "*1": "flip1",
  "*2": "flip2",
  "*3": "flip3",
  "*4": "flip4",
  "*5": "flip5",
  "*6": "flip6",
  "$$": "copyprev",
  F1: "flip24",
  F2: "flip36",
  TT: "tiebreaker",
  VV: "valuechange",
  "%3": "mod3",
  "%4": "mod4",
  "%5": "mod5",
  "%6": "mod6",
  "/2": "halve",
  "00": "hardreset",
};

/** Tokens that only exist in the Wacky game mode. Canonical matches reject them outright. */
export const wackySideDeckTokens = Object.freeze(["%3", "%4", "%5", "%6", "/2", "00"] as const);

export const isWackySideDeckToken = (token: string): boolean => {
  return (wackySideDeckTokens as readonly string[]).includes(token);
};

export const CUSTOM_SIDE_DECK_LABEL = "Custom Sideboard";
export const supportedSideDeckTokens = Object.freeze(Object.keys(sideDeckTokenToTemplateId));
export const STANDARD_SIDE_DECK_TOKEN_LIMIT = 4;
export const SPECIAL_SIDE_DECK_TOKEN_LIMIT = 1;
export const specialSideDeckTokens = Object.freeze([
  "$$",
  "TT",
  "F1",
  "F2",
  "VV",
  "%3",
  "%4",
  "%5",
  "%6",
  "/2",
  "00",
] as const);

export const isSpecialSideDeckToken = (token: string): boolean => {
  return (specialSideDeckTokens as readonly string[]).includes(token);
};

export const getCustomSideDeckTokenLimit = (token: string): number => {
  return isSpecialSideDeckToken(token) ? SPECIAL_SIDE_DECK_TOKEN_LIMIT : STANDARD_SIDE_DECK_TOKEN_LIMIT;
};

/** Required game mode for a normalized token, derived from its template's card type. */
export const getSideDeckTokenRequiredMode = (token: string): PazaakGameMode => {
  const templateId = sideDeckTokenToTemplateId[token];
  const template = templateId ? cardTemplateById.get(templateId) : undefined;
  return template ? cardTypeRequiredMode[template.type] : "canonical";
};

export const getCustomSideDeckLimitErrors = (tokens: readonly string[]): string[] => {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([token, count]) => count > getCustomSideDeckTokenLimit(token))
    .map(([token, count]) => {
      const limit = getCustomSideDeckTokenLimit(token);
      return `${token} appears ${count} times; custom multiplayer sideboards allow at most ${limit}.`;
    });
};

export const assertCustomSideDeckTokenLimits = (tokens: readonly string[]): void => {
  const errors = getCustomSideDeckLimitErrors(tokens);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
};

export const normalizeSideDeckToken = (token: string): string | undefined => {
  const collapsed = token.trim().replace(/\s+/g, "");

  if (collapsed.length === 0) {
    return undefined;
  }

  if (/^[+][1-6]$/.test(collapsed)) {
    return collapsed;
  }

  if (/^[-−][1-6]$/.test(collapsed)) {
    return `-${collapsed.at(-1)}`;
  }

  if (/^[*][1-6]$/.test(collapsed)) {
    return collapsed;
  }

  if (/^[±][1-6]$/.test(collapsed)) {
    return `*${collapsed.at(-1)}`;
  }

  if (collapsed === "$$") {
    return "$$";
  }

  if (/^%[3-6]$/.test(collapsed)) {
    return collapsed;
  }

  if (collapsed === "/2") {
    return "/2";
  }

  if (collapsed === "00") {
    return "00";
  }

  switch (collapsed.toUpperCase()) {
    case "D":
      return "$$";
    case "TT":
    case "±1T":
      return "TT";
    case "VV":
    case "±1/2":
    case "1±2":
      return "VV";
    case "F1":
    case "2&4":
    case "2AND4":
    case "2/4":
      return "F1";
    case "F2":
    case "3&6":
    case "3AND6":
    case "3/6":
      return "F2";
    case "MOD3":
      return "%3";
    case "MOD4":
      return "%4";
    case "MOD5":
      return "%5";
    case "MOD6":
      return "%6";
    case "HALVE":
    case "HALF":
      return "/2";
    case "RESET":
    case "HARDRESET":
    case "HARD_RESET":
      return "00";
    default:
      return undefined;
  }
};

export const canonicalTslSideDecks: readonly CanonicalSideDeckDefinition[] = [
  { id: 0, label: "PlayerDefault_NOTUSED", cards: ["+1", "+1", "+2", "+2", "+3", "+3", "+4", "+4", "+5", "+5"], supported: true },
  { id: 1, label: "TestAverage_ERASEME", cards: ["+3", "-3", "+4", "-4", "+5", "-5", "+5", "-3", "+4", "-5"], supported: true },
  { id: 2, label: "TestNightmare_ERASEME", cards: ["*6", "+4", "-4", "-2", "+3", "-2", "-3", "+3", "+2", "*1"], supported: true },
  { id: 3, label: "SuperDeck_ERASEME", cards: ["*3", "*3", "*2", "*2", "*4", "*4", "*2", "*2", "*1", "*1"], supported: true },
  { id: 4, label: "DoublesDeck_Testing", cards: ["$$", "$$", "$$", "$$", "$$", "$$", "$$", "$$", "$$", "$$"], supported: true },
  { id: 5, label: "FlipOneDeck_Testing", cards: ["F1", "F1", "F1", "F1", "F1", "F1", "F1", "F1", "F1", "F1"], supported: true },
  { id: 6, label: "FlipTwoDeck_Testing", cards: ["F2", "F2", "F2", "F2", "F2", "F2", "F2", "F2", "F2", "F2"], supported: true },
  { id: 7, label: "TieBreakerDeck_Testing", cards: ["TT", "TT", "TT", "TT", "TT", "TT", "TT", "TT", "TT", "TT"], supported: true },
  { id: 8, label: "ValueChangeDeck_Testing", cards: ["VV", "VV", "VV", "VV", "VV", "VV", "VV", "VV", "VV", "VV"], supported: true },
  { id: 9, label: "DeckFromHell_Testing", cards: ["$$", "$$", "F1", "F1", "F2", "F2", "TT", "TT", "VV", "VV"], supported: true },
  { id: 10, label: "Kotor2_Deck_VeryEasy", cards: ["+3", "-3", "+4", "-4", "+5", "-5", "+5", "-3", "+4", "-5"], supported: true },
  { id: 11, label: "Kotor2_Deck_Easy", cards: ["+1", "+2", "+3", "+4", "+5", "-6", "-4", "-3", "-2", "-1"], supported: true },
  { id: 12, label: "Kotor2_Deck_Average", cards: ["*1", "*2", "+3", "+4", "+5", "+6", "*5", "-6", "*4", "$$"], supported: true },
  { id: 13, label: "Kotor2_Deck_Hard", cards: ["F1", "F2", "*4", "*6", "$$", "TT", "VV", "*3", "*6", "F1"], supported: true },
  { id: 14, label: "Kotor2_Deck_VeryHard", cards: ["$$", "$$", "F1", "F1", "F2", "F2", "TT", "TT", "VV", "VV"], supported: true },
] as const;

// Runtime uses exact TSL difficulty rows that are now fully decoded.
const supportedRuntimeSideDecks = canonicalTslSideDecks.filter((deck) => deck.id >= 10 && deck.supported);

export const getCanonicalSideDeckDefinition = (deckId: number): CanonicalSideDeckDefinition | undefined => {
  return canonicalTslSideDecks.find((deck) => deck.id === deckId);
};

export const isCanonicalSideDeckSupported = (deckId: number): boolean => {
  return getCanonicalSideDeckDefinition(deckId)?.supported ?? false;
};

const buildCanonicalSideDeck = (definition: CanonicalSideDeckDefinition): SideCard[] => {
  return definition.cards.map((token, index) => {
    const templateId = sideDeckTokenToTemplateId[token];

    if (!templateId) {
      throw new Error(`Unsupported canonical Pazaak deck token: ${token}`);
    }

    const template = cardTemplateById.get(templateId);

    if (!template) {
      throw new Error(`Missing side-card template for token ${token} (${templateId}).`);
    }

    return { ...template, id: `${template.id}_${definition.id}_${index}` };
  });
};

export const createCanonicalSideDeck = (deckId: number): {
  sideDeckId: number;
  sideDeckLabel: string;
  sideDeck: SideCard[];
} => {
  const definition = getCanonicalSideDeckDefinition(deckId);

  if (!definition) {
    throw new Error(`Unknown canonical TSL side deck id: ${deckId}`);
  }

  if (!definition.supported) {
    throw new Error(`Canonical TSL side deck ${deckId} is not supported by the current engine.`);
  }

  return {
    sideDeckId: definition.id,
    sideDeckLabel: definition.label,
    sideDeck: buildCanonicalSideDeck(definition),
  };
};

export const createCustomSideDeck = (choice: CustomSideDeckChoice): {
  sideDeckId: null;
  sideDeckLabel: string;
  sideDeck: SideCard[];
} => {
  if (choice.tokens.length !== SIDE_DECK_SIZE) {
    throw new Error(`Custom sideboards must contain exactly ${SIDE_DECK_SIZE} cards.`);
  }

  const mode = choice.gameMode ?? DEFAULT_PAZAAK_GAME_MODE;
  const normalizedTokens: string[] = [];
  const sideDeck = choice.tokens.map((token, index) => {
    const normalizedToken = normalizeSideDeckToken(token);

    if (!normalizedToken) {
      throw new Error(`Unsupported custom Pazaak token: ${token}`);
    }

    normalizedTokens.push(normalizedToken);

    const templateId = sideDeckTokenToTemplateId[normalizedToken];
    const template = templateId ? cardTemplateById.get(templateId) : undefined;

    if (!template) {
      throw new Error(`Missing side-card template for custom token ${token}.`);
    }

    if (!isCardTypeAllowedInMode(template.type, mode)) {
      throw new Error(
        `Token ${normalizedToken} is a Wacky-mode-only card and cannot be used in a ${mode} sideboard.`,
      );
    }

    return { ...template, id: `${template.id}_custom_${index}` };
  });

  if (choice.enforceTokenLimits) {
    assertCustomSideDeckTokenLimits(normalizedTokens);
  }

  return {
    sideDeckId: null,
    sideDeckLabel: choice.label?.trim() || CUSTOM_SIDE_DECK_LABEL,
    sideDeck,
  };
};

/** Build a 10-card sideboard for one player from the supported canonical TSL rows. */
const drawSideDeck = (deckChoice?: SideDeckChoice): { sideDeckId: number | null; sideDeckLabel: string; sideDeck: SideCard[] } => {
  if (typeof deckChoice === "number") {
    return createCanonicalSideDeck(deckChoice);
  }

  if (deckChoice) {
    return createCustomSideDeck(deckChoice);
  }

  const definition = supportedRuntimeSideDecks[Math.floor(Math.random() * supportedRuntimeSideDecks.length)];

  if (!definition) {
    throw new Error("No supported canonical TSL side decks are available.");
  }

  return {
    sideDeckId: definition.id,
    sideDeckLabel: definition.label,
    sideDeck: buildCanonicalSideDeck(definition),
  };
};

/** Draw HAND_SIZE cards from the sideboard for one set. */
const drawHandFromSideDeck = (sideDeck: SideCard[]): SideCard[] => {
  return shuffle(sideDeck).slice(0, HAND_SIZE).map(cloneCard);
};

const buildMainDeck = (): number[] => {
  const deck: number[] = [];

  for (let value = 1; value <= 10; value += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      deck.push(value);
    }
  }

  return shuffle(deck);
};

export const createPlayerState = (userId: string, displayName: string, deckChoice?: SideDeckChoice): MatchPlayerState => {
  const { sideDeckId, sideDeckLabel, sideDeck } = drawSideDeck(deckChoice);
  return {
    userId,
    displayName,
    roundWins: 0,
    sideDeckId,
    sideDeckLabel,
    sideDeck,
    hand: drawHandFromSideDeck(sideDeck),
    usedCardIds: new Set<string>(),
    board: [],
    sideCardsPlayed: [],
    total: 0,
    stood: false,
    hasTiebreaker: false,
  };
};

const formatSignedValue = (value: number): string => {
  return value > 0 ? `+${value}` : `${value}`;
};

export const playerAt = (match: PazaakMatch, index: number): MatchPlayerState => {
  return match.players[index]!;
};

export const getCurrentPlayer = (match: PazaakMatch): MatchPlayerState => {
  return playerAt(match, match.activePlayerIndex);
};

export const getPlayerForUser = (match: PazaakMatch, userId: string): MatchPlayerState | undefined => {
  return match.players.find((player) => player.userId === userId);
};

export const getOpponentForUser = (match: PazaakMatch, userId: string): MatchPlayerState | undefined => {
  return match.players.find((player) => player.userId !== userId);
};

export const renderBoardLine = (player: MatchPlayerState): string => {
  if (player.board.length === 0) return "No cards in play";
  const parts = player.board.map((card, i) => {
    if (i === 0) return `${card.value}`;
    return card.value >= 0 ? `+ ${card.value}` : `− ${Math.abs(card.value)}`;
  });
  return `${parts.join(" ")} = **${player.total}**`;
};

export const renderHandLine = (player: MatchPlayerState): string => {
  return player.hand
    .map((card) => {
      const used = player.usedCardIds.has(card.id);
      return used ? `~~${card.label}~~` : card.label;
    })
    .join(" | ");
};

export const getSideCardOptionsForPlayer = (player: MatchPlayerState): SideCardOption[] => {
  const options: SideCardOption[] = [];
  const previousBoardValue = player.board.at(-1)?.value;
  const previousBoardLabel = previousBoardValue === undefined ? "D (needs a previous card)" : `D (= ${formatSignedValue(previousBoardValue)})`;

  for (const card of player.hand) {
    if (player.usedCardIds.has(card.id)) {
      continue;
    }

    switch (card.type) {
      case "plus":
        options.push({
          cardId: card.id,
          displayLabel: `Play +${card.value}`,
          appliedValue: card.value,
        });
        break;

      case "minus":
        options.push({
          cardId: card.id,
          displayLabel: `Play -${card.value}`,
          appliedValue: -card.value,
        });
        break;

      case "flip":
        options.push(
          { cardId: card.id, displayLabel: `Play +${card.value}`, appliedValue: card.value },
          { cardId: card.id, displayLabel: `Play -${card.value}`, appliedValue: -card.value },
        );
        break;

      case "value_change":
        options.push(
          { cardId: card.id, displayLabel: "Play +1", appliedValue: 1 },
          { cardId: card.id, displayLabel: "Play +2", appliedValue: 2 },
          { cardId: card.id, displayLabel: "Play -1", appliedValue: -1 },
          { cardId: card.id, displayLabel: "Play -2", appliedValue: -2 },
        );
        break;

      case "copy_previous":
        if (previousBoardValue !== undefined) {
          options.push({ cardId: card.id, displayLabel: `Play ${previousBoardLabel}`, appliedValue: previousBoardValue });
        }
        break;

      case "tiebreaker":
        options.push(
          { cardId: card.id, displayLabel: "Play +1T", appliedValue: 1 },
          { cardId: card.id, displayLabel: "Play -1T", appliedValue: -1 },
        );
        break;

      case "flip_two_four":
        options.push({ cardId: card.id, displayLabel: "Play Flip 2&4", appliedValue: 0 });
        break;

      case "flip_three_six":
        options.push({ cardId: card.id, displayLabel: "Play Flip 3&6", appliedValue: 0 });
        break;

      case "mod_previous":
        if (previousBoardValue !== undefined && card.value > 0) {
          const remainder = modPythonStyle(previousBoardValue, card.value);
          options.push({
            cardId: card.id,
            displayLabel: `Play %${card.value} (= ${formatSignedValue(remainder)})`,
            appliedValue: remainder,
          });
        }
        break;

      case "halve_previous":
        if (previousBoardValue !== undefined) {
          const halved = Math.trunc(previousBoardValue / 2);
          options.push({
            cardId: card.id,
            displayLabel: `Play /2 (= ${formatSignedValue(halved)})`,
            appliedValue: halved,
          });
        }
        break;

      case "hard_reset":
        options.push({
          cardId: card.id,
          displayLabel: "Play 00 (force-tie the set)",
          appliedValue: 0,
        });
        break;
    }
  }

  return options;
};

/**
 * Python-style remainder — always non-negative when `modulus > 0`. Used by the Wacky
 * mode `%N` card so that `mod(-5, 3) === 1` rather than `-2` (JavaScript's default).
 */
export const modPythonStyle = (value: number, modulus: number): number => {
  if (modulus === 0) {
    return 0;
  }

  return ((value % modulus) + modulus) % modulus;
};

export const getAdvisorSnapshotForPlayer = (
  match: PazaakMatch,
  userId: string,
  difficulty: AdvisorDifficulty = "professional",
): AdvisorSnapshot | null => {
  if (match.phase === "completed") {
    return null;
  }

  const player = getPlayerForUser(match, userId);

  if (!player || player.stood) {
    return null;
  }

  const currentPlayer = getCurrentPlayer(match);

  if (currentPlayer.userId !== userId) {
    return null;
  }

  const opponent = getOpponentForUser(match, userId);

  if (!opponent) {
    return null;
  }

  const matchContext = getAdvisorMatchContext(player, opponent, getMatchSetsToWin(match));

  if (match.phase === "turn") {
    return {
      recommendation: {
        action: "draw",
        rationale: "You have not drawn yet. The next decision window only opens after a main-deck draw.",
      },
      difficulty,
      category: "neutral",
      confidence: "high",
      bustProbability: calculateBustProbability(player.total, match.mainDeck),
      alternatives: [],
    };
  }

  const cardOptions = getSideCardOptionsForPlayer(player);
  const currentBustProbability = calculateBustProbability(player.total, match.mainDeck);
  const beneficialOptions = cardOptions
    .map((option) => evaluateAdvisorOption(player, opponent, option, currentBustProbability, match.mainDeck))
    .filter((option): option is EvaluatedAdvisorOption => option !== null)
    .sort((left, right) => right.score - left.score);
  const bestOption = beneficialOptions[0] ?? null;
  const hasRecoveryOption = beneficialOptions.some((option) => option.total <= WIN_SCORE && option.total < player.total);
  const alternatives = beneficialOptions.slice(0, 3).map((option) => ({
    displayLabel: option.option.displayLabel,
    rationale: option.rationale,
    category: option.category,
    score: option.score,
  }));

  if (player.total > WIN_SCORE) {
    if (match.phase === "after-draw" && bestOption) {
      return {
        recommendation: {
          action: "play_side",
          cardId: bestOption.option.cardId,
          appliedValue: bestOption.option.appliedValue,
          displayLabel: bestOption.option.displayLabel,
          rationale: `${bestOption.rationale} You are currently over ${WIN_SCORE}, so this recovery has to happen before ending the turn.`,
        },
        difficulty,
        category: "recovery",
        confidence: "high",
        bustProbability: 1,
        alternatives,
      };
    }

    return {
      recommendation: {
        action: "end_turn",
        rationale: `No safe recovery card is available. Ending the turn confirms the bust at ${player.total}.`,
      },
      difficulty,
      category: "recovery",
      confidence: "high",
      bustProbability: 1,
      alternatives,
    };
  }

  if (match.phase === "after-draw" && player.board.length === MAX_BOARD_SIZE - 1 && bestOption) {
    return {
      recommendation: {
        action: "play_side",
        cardId: bestOption.option.cardId,
        appliedValue: bestOption.option.appliedValue,
        displayLabel: bestOption.option.displayLabel,
        rationale: `${bestOption.rationale} More importantly, any safe side-card play here fills your ninth slot and wins the set immediately.`,
      },
      difficulty,
      category: "pressure",
      confidence: "high",
      bustProbability: currentBustProbability,
      alternatives,
    };
  }

  if (match.phase === "after-draw" && bestOption && shouldPlayRecommendedOption(player, opponent, bestOption, difficulty, matchContext)) {
    return {
      recommendation: {
        action: "play_side",
        cardId: bestOption.option.cardId,
        appliedValue: bestOption.option.appliedValue,
        displayLabel: bestOption.option.displayLabel,
        rationale: bestOption.rationale,
      },
      difficulty,
      category: bestOption.category,
      confidence: getAdvisorConfidence(bestOption.score),
      bustProbability: currentBustProbability,
      alternatives,
    };
  }

  if (shouldStandForAdvisor(player, opponent, difficulty, currentBustProbability, hasRecoveryOption, matchContext)) {
    return {
      recommendation: {
        action: "stand",
        rationale: buildStandRationale(player, opponent, currentBustProbability, hasRecoveryOption, matchContext),
      },
      difficulty,
      category: opponent.stood ? "pressure" : "neutral",
      confidence: currentBustProbability >= 0.7 || player.total >= 18 ? "high" : "medium",
      bustProbability: currentBustProbability,
      alternatives,
    };
  }

  return {
    recommendation: {
      action: "end_turn",
      rationale: buildEndTurnRationale(player, opponent, difficulty, bestOption, matchContext),
    },
    difficulty,
    category: bestOption?.category ?? "neutral",
    confidence: bestOption ? getAdvisorConfidence(Math.max(0, bestOption.score - 80)) : "medium",
    bustProbability: currentBustProbability,
    alternatives,
  };
};

export const recommendMoveForPlayer = (
  match: PazaakMatch,
  userId: string,
  difficulty: AdvisorDifficulty = "professional",
): AdvisorAction | null => {
  return getAdvisorSnapshotForPlayer(match, userId, difficulty)?.recommendation ?? null;
};

export const recommendAiMoveForPlayer = (
  match: PazaakMatch,
  userId: string,
  difficulty: AiDifficulty = "professional",
): PazaakAiMove | null => {
  const recommendation = recommendMoveForPlayer(match, userId, difficulty);

  if (!recommendation) {
    return null;
  }

  return {
    ...recommendation,
    difficulty,
    delayMs: getAiThinkingDelayMs(difficulty),
  };
};

/** Reset board state for a new set. The original four-card hand persists for the match. */
export const resetPlayerForSet = (player: MatchPlayerState): void => {
  player.board = [];
  player.sideCardsPlayed = [];
  player.total = 0;
  player.stood = false;
  player.hasTiebreaker = false;
};

interface EvaluatedAdvisorOption {
  option: SideCardOption;
  score: number;
  total: number;
  usesTiebreaker: boolean;
  category: AdvisorCategory;
  rationale: string;
}

interface AdvisorSimulation {
  total: number;
  usesTiebreaker: boolean;
  totalDelta: number;
  flippedCards: number;
}

interface AdvisorMatchContext {
  playerOnMatchPoint: boolean;
  opponentOnMatchPoint: boolean;
  leadingMatch: boolean;
  trailingMatch: boolean;
}

const normalizeSetsToWin = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return SETS_TO_WIN;
  }

  return Math.max(1, Math.min(9, Math.trunc(value!)));
};

const getMatchSetsToWin = (match: Pick<PazaakMatch, "setsToWin">): number => {
  return normalizeSetsToWin(match.setsToWin);
};

const evaluateAdvisorOption = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  option: SideCardOption,
  currentBustProbability: number,
  remainingDeck?: readonly number[],
): EvaluatedAdvisorOption | null => {
  const card = player.hand.find((entry) => entry.id === option.cardId);

  if (!card) {
    return null;
  }

  const simulation = simulateAdvisorSideCard(player, option, card.type);
  const nextBustProbability = calculateBustProbability(simulation.total, remainingDeck);
  const previousBoardValue = player.board.at(-1)?.value;

  if (simulation.total > WIN_SCORE) {
    return null;
  }

  let score = simulation.total * 10 - nextBustProbability * 15;
  let rationale = `${option.displayLabel} moves your total to ${simulation.total}.`;
  let category: AdvisorCategory = "neutral";

  if (simulation.total === WIN_SCORE) {
    score += 1000;
    category = "exact";
    rationale = `${option.displayLabel} lands exactly on ${WIN_SCORE}, which is the cleanest finish available.`;
  } else if (opponent.stood && simulation.total > opponent.total) {
    score += 900;
    category = "pressure";
    rationale = `${option.displayLabel} moves you past ${opponent.displayName}'s standing ${opponent.total}.`;
  } else if (opponent.stood && simulation.total === opponent.total && simulation.usesTiebreaker) {
    score += 880;
    category = "pressure";
    rationale = `${option.displayLabel} ties ${opponent.displayName} at ${simulation.total} while giving you the Tiebreaker edge.`;
  } else if (simulation.total > player.total) {
    score += 120;
    category = simulation.total >= 16 ? "setup" : "neutral";
    rationale = simulation.total >= 16
      ? `${option.displayLabel} sets you up on ${simulation.total}, which keeps live pressure on the next draw.`
      : `${option.displayLabel} improves your board without putting you over ${WIN_SCORE}.`;
  } else if (simulation.total < player.total) {
    score += 40;
    category = "recovery";
    rationale = `${option.displayLabel} is a recovery play that lowers your total to a safer ${simulation.total}.`;
  }

  if (category === "recovery" && currentBustProbability >= 0.5) {
    score += 140;
  }

  if (category === "setup" && player.total <= 15 && simulation.total >= 16 && simulation.total <= 18) {
    score += 110;
  }

  if (card.type === "tiebreaker" && (simulation.total >= 18 || opponent.stood)) {
    score += 85;
    if (category === "neutral" || category === "setup") {
      rationale = `${option.displayLabel} keeps the Tiebreaker live, so a tied stand still breaks your way.`;
    }
  }

  if (card.type === "copy_previous") {
    if (simulation.total === player.total) {
      score -= 120;
      rationale = `${option.displayLabel} only copies a neutral 0 right now, so it spends D without changing the board.`;
    } else if (previousBoardValue !== undefined && previousBoardValue < 0) {
      score += 130;
      category = category === "pressure" ? category : "recovery";
      rationale = `${option.displayLabel} copies your last ${formatSignedValue(previousBoardValue)}, which gives D a clean recovery line here.`;
    } else if (previousBoardValue !== undefined && previousBoardValue > 0 && simulation.total >= 17 && simulation.total < WIN_SCORE) {
      score += 75;
      if (category === "neutral") {
        category = "setup";
      }
      rationale = `${option.displayLabel} repeats your last ${formatSignedValue(previousBoardValue)} to build a stronger standing total.`;
    }
  }

  if (card.type === "value_change") {
    if (category === "exact") {
      score += 60;
      rationale = `${option.displayLabel} uses VV as a precise ${formatSignedValue(option.appliedValue)} to land exactly on ${WIN_SCORE}.`;
    } else if (option.appliedValue < 0 && currentBustProbability >= 0.5) {
      score += 95;
      category = category === "pressure" ? category : "recovery";
      rationale = `${option.displayLabel} turns VV into a recovery tool and cuts your next-draw bust risk to ${Math.round(nextBustProbability * 100)}%.`;
    } else if (option.appliedValue > 0 && simulation.total >= 17 && simulation.total < WIN_SCORE) {
      score += 65;
      if (category === "neutral") {
        category = "setup";
      }
      rationale = `${option.displayLabel} uses VV as a flexible push to ${simulation.total} without committing a larger fixed card.`;
    }
  }

  if (card.type === "flip_two_four" || card.type === "flip_three_six") {
    if (simulation.flippedCards === 0) {
      score -= 160;
      rationale = `${option.displayLabel} does not meaningfully change the current board, so it is a weak use of the card.`;
    } else if (simulation.total < player.total) {
      score += 70 + simulation.flippedCards * 55;
      if (currentBustProbability >= 0.5) {
        score += 80;
      }
      category = category === "exact" || category === "pressure" ? category : "recovery";
      rationale = `${option.displayLabel} flips ${simulation.flippedCards} live board card${simulation.flippedCards === 1 ? "" : "s"} and drops you to ${simulation.total}, which is a strong special-card recovery line.`;
    } else {
      score += 40 + simulation.flippedCards * 45;
      if (simulation.total >= 17 && simulation.total <= WIN_SCORE) {
        score += 55;
      }
      if (category === "neutral") {
        category = simulation.total >= 16 ? "setup" : "neutral";
      }
      rationale = `${option.displayLabel} flips ${simulation.flippedCards} live board card${simulation.flippedCards === 1 ? "" : "s"} and improves your pressure total to ${simulation.total}.`;
    }
  }

  if (card.type === "mod_previous") {
    const prev = previousBoardValue ?? 0;
    const absPrev = Math.abs(prev);
    if (player.total > WIN_SCORE && simulation.total <= WIN_SCORE) {
      score += 220;
      category = "recovery";
      rationale = `${option.displayLabel} bleeds the previous ${formatSignedValue(prev)} down to ${formatSignedValue(option.appliedValue)}, saving the board from a bust.`;
    } else if (prev !== 0 && simulation.total === WIN_SCORE) {
      score += 110;
    } else if (absPrev >= 4 && simulation.total <= player.total) {
      score += 90;
      if (category === "neutral") {
        category = "recovery";
      }
      rationale = `${option.displayLabel} carves ${formatSignedValue(prev)} down to ${formatSignedValue(option.appliedValue)}, a strong wacky recovery line.`;
    } else if (absPrev < 2) {
      score -= 100;
      rationale = `${option.displayLabel} only trims a tiny previous card, so it barely moves the board.`;
    }
  }

  if (card.type === "halve_previous") {
    const prev = previousBoardValue ?? 0;
    const absPrev = Math.abs(prev);
    if (player.total > WIN_SCORE && simulation.total <= WIN_SCORE) {
      score += 210;
      category = "recovery";
      rationale = `${option.displayLabel} halves the previous ${formatSignedValue(prev)} to ${formatSignedValue(option.appliedValue)} and unbusts the board.`;
    } else if (absPrev >= 4 && simulation.total <= player.total) {
      score += 80;
      if (category === "neutral") {
        category = "recovery";
      }
      rationale = `${option.displayLabel} cuts the previous ${formatSignedValue(prev)} in half, shaving your total to ${simulation.total}.`;
    } else if (absPrev < 2) {
      score -= 90;
      rationale = `${option.displayLabel} barely changes the board — halving a tiny previous card is a poor use of the card.`;
    }
  }

  if (card.type === "hard_reset") {
    // Hard reset ends the set with no winner. It is strongest when the current set
    // is definitively lost and losing it would also cost the match; weakest when the
    // advisor is ahead or holds tempo.
    const setsToWin = 3;
    const playerOnMatchPoint = player.roundWins >= setsToWin - 1;
    const opponentOnMatchPoint = opponent.roundWins >= setsToWin - 1;
    const setIsLost = opponent.stood && player.total < opponent.total && !player.hasTiebreaker;

    if (opponentOnMatchPoint && (setIsLost || player.total < 14)) {
      score += 250;
      category = "pressure";
      rationale = `${option.displayLabel} wipes a set the opponent is about to close out — burning the turn is better than handing them match point.`;
    } else if (setIsLost && !playerOnMatchPoint) {
      score += 110;
      category = "pressure";
      rationale = `${option.displayLabel} salvages a lost set by re-opening it; you spend the card but avoid giving up the round.`;
    } else {
      score -= 200;
      rationale = `${option.displayLabel} would waste the set; the advisor only reaches for 00 when the round is already gone.`;
    }
  }

  return {
    option,
    score,
    total: simulation.total,
    usesTiebreaker: simulation.usesTiebreaker,
    category,
    rationale,
  };
};

const simulateAdvisorSideCard = (
  player: MatchPlayerState,
  option: SideCardOption,
  sourceType: SideCardType,
): AdvisorSimulation => {
  // Hard reset always ties the set. We report "total = 0, delta = -player.total" so the
  // advisor understands the set outcome is a tie and the bust-probability downstream is 0.
  if (sourceType === "hard_reset") {
    return {
      total: 0,
      usesTiebreaker: player.hasTiebreaker,
      totalDelta: -player.total,
      flippedCards: 0,
    };
  }

  // mod_previous and halve_previous replace the *previous* board card's value rather
  // than pushing an additive card, so the simulated delta is (new - prev).
  if (sourceType === "mod_previous" || sourceType === "halve_previous") {
    const prev = player.board.at(-1)?.value ?? 0;
    const delta = option.appliedValue - prev;
    return {
      total: player.total + delta,
      usesTiebreaker: player.hasTiebreaker,
      totalDelta: delta,
      flippedCards: 0,
    };
  }

  if (sourceType !== "flip_two_four" && sourceType !== "flip_three_six") {
    return {
      total: player.total + option.appliedValue,
      usesTiebreaker: sourceType === "tiebreaker" || player.hasTiebreaker,
      totalDelta: option.appliedValue,
      flippedCards: 0,
    };
  }

  const targets = sourceType === "flip_two_four" ? [2, 4] : [3, 6];
  let totalDelta = 0;
  let flippedCards = 0;

  for (const boardCard of player.board) {
    const isFlippable = !boardCard.frozen && (boardCard.source === undefined || boardCard.source === "plus" || boardCard.source === "minus");

    if (isFlippable && targets.includes(boardCard.value)) {
      totalDelta += -2 * boardCard.value;
      flippedCards += 1;
    }
  }

  return {
    total: player.total + totalDelta,
    usesTiebreaker: player.hasTiebreaker,
    totalDelta,
    flippedCards,
  };
};

const shouldPlayRecommendedOption = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  option: EvaluatedAdvisorOption,
  difficulty: AdvisorDifficulty,
  matchContext: AdvisorMatchContext,
): boolean => {
  if (player.board.length === MAX_BOARD_SIZE - 1 && option.total <= WIN_SCORE) {
    return true;
  }

  if (option.total === WIN_SCORE) {
    return true;
  }

  if (opponent.stood && option.total > opponent.total) {
    return true;
  }

  if (opponent.stood && option.total === opponent.total && option.usesTiebreaker) {
    return true;
  }

  switch (difficulty) {
    case "easy":
      return player.total > WIN_SCORE - 3 && option.total >= player.total;
    case "hard":
      return option.category === "exact"
        || option.category === "pressure"
        || (matchContext.opponentOnMatchPoint && option.total >= 17)
        || (option.category === "recovery" && player.total >= 18)
        || option.total >= 17
        || option.total > player.total;
    case "professional":
      return option.category === "exact"
        || option.category === "pressure"
        || (matchContext.opponentOnMatchPoint && option.total >= 16)
        || (option.category === "recovery" && (player.total >= 18 || option.score >= 220))
        || (option.category === "setup" && option.score >= 250)
        || (matchContext.trailingMatch && option.category === "setup" && option.total >= 16)
        || option.score >= 320;
  }
};

const shouldStandForAdvisor = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  difficulty: AdvisorDifficulty,
  bustProbability: number,
  hasRecoveryOption: boolean,
  matchContext: AdvisorMatchContext,
): boolean => {
  if (player.total > WIN_SCORE) {
    return false;
  }

  if (player.total >= WIN_SCORE) {
    return true;
  }

  if (player.board.length === MAX_BOARD_SIZE - 1 && hasRecoveryOption) {
    return false;
  }

  if (opponent.stood) {
    if (player.total > opponent.total) {
      return true;
    }

    if (player.total === opponent.total && player.hasTiebreaker) {
      return true;
    }
  }

  switch (difficulty) {
    case "easy":
      if (matchContext.opponentOnMatchPoint && player.total <= 18) return false;
      return player.total >= 17;
    case "hard":
      if (matchContext.opponentOnMatchPoint && player.total <= 17) return false;
      if (player.total >= 19) return true;
      if (matchContext.playerOnMatchPoint && player.total >= 17 && bustProbability >= 0.4) return true;
      if (player.total >= 17 && (bustProbability >= 0.5 || !hasRecoveryOption)) return true;
      return false;
    case "professional":
      if (player.total <= 14) return false;
      if (matchContext.opponentOnMatchPoint && player.total <= 17 && hasRecoveryOption) return false;
      if (player.total >= 18) return true;
      if (matchContext.playerOnMatchPoint && player.total >= 17 && bustProbability >= 0.4) return true;
      if (matchContext.leadingMatch && player.total >= 17 && bustProbability >= 0.5) return true;
      if (bustProbability > 0.7) return true;
      if (!hasRecoveryOption && player.total >= 17) return true;
      return false;
  }
};

const buildStandRationale = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  bustProbability: number,
  hasRecoveryOption: boolean,
  matchContext: AdvisorMatchContext,
): string => {
  if (player.total >= WIN_SCORE) {
    return `Stand now. You are already sitting on ${player.total}.`;
  }

  if (opponent.stood && player.total > opponent.total) {
    return `Stand now. ${player.total} already beats ${opponent.displayName}'s standing ${opponent.total}.`;
  }

  if (opponent.stood && player.total === opponent.total && player.hasTiebreaker) {
    return `Stand now. You are tied at ${player.total}, but your Tiebreaker should carry the set.`;
  }

  if (matchContext.playerOnMatchPoint && player.total >= 17) {
    return `Stand now. You are one set from winning the match, so ${player.total} is strong enough to protect the lead.`;
  }

  if (matchContext.leadingMatch && player.total >= 17 && bustProbability >= 0.5) {
    return `Stand now. You are already ahead in sets, so there is no reason to overextend from ${player.total}.`;
  }

  if (!hasRecoveryOption && player.total >= 17) {
    return `Stand now. ${player.total} is solid and your remaining hand does not offer much recovery if the next draw goes bad.`;
  }

  return `Stand now. At ${player.total}, the bust pressure on another draw is about ${Math.round(bustProbability * 100)}%.`;
};

const buildEndTurnRationale = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  difficulty: AdvisorDifficulty,
  bestOption: EvaluatedAdvisorOption | null,
  matchContext: AdvisorMatchContext,
): string => {
  if (player.total > WIN_SCORE) {
    return `End the turn only if you accept the bust. You are at ${player.total}, so a recovery side card is the only way out.`;
  }

  if (opponent.stood && player.total < opponent.total) {
    return `End the turn if you want to keep pressing later. You still trail ${opponent.displayName}'s ${opponent.total}, so standing here would probably concede the set.`;
  }

  if (matchContext.opponentOnMatchPoint && player.total <= 17) {
    return `End the turn only if you need to keep pushing later. You are trailing the match, so this set still needs a more aggressive finish.`;
  }

  if (player.board.length === MAX_BOARD_SIZE - 1) {
    return `End the turn only if your remaining hand cannot safely finish the ninth slot. One more safe card would auto-win the set.`;
  }

  if (bestOption && difficulty === "easy") {
    return `End the turn. ${bestOption.option.displayLabel} is playable, but a safer line is to preserve your hand and revisit the board next turn.`;
  }

  if (bestOption && bestOption.category === "setup") {
    return `End the turn. ${bestOption.option.displayLabel} would improve your shape, but the advisor is holding it for a stronger timing window.`;
  }

  return `End the turn. ${player.total} is not strong enough to lock in yet, but there is no immediate side-card finish worth committing to.`;
};

/**
 * Deck-aware next-draw bust probability. Delegates to the rulebook helper which
 * supports both a live `match.mainDeck` snapshot (exact count against the current
 * shoe) and the uniform 40-card fallback table. Callers that do not have access
 * to the live deck snapshot (e.g. synthetic advisor tests) may pass `undefined`.
 */
const calculateBustProbability = (currentScore: number, remainingDeck?: readonly number[]): number => {
  return getBustProbability(currentScore, remainingDeck);
};

const getAdvisorMatchContext = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  setsToWin = SETS_TO_WIN,
): AdvisorMatchContext => ({
  playerOnMatchPoint: player.roundWins >= setsToWin - 1,
  opponentOnMatchPoint: opponent.roundWins >= setsToWin - 1,
  leadingMatch: player.roundWins > opponent.roundWins,
  trailingMatch: player.roundWins < opponent.roundWins,
});

const getAdvisorConfidence = (score: number): AdvisorConfidence => {
  if (score >= 700) {
    return "high";
  }

  if (score >= 250) {
    return "medium";
  }

  return "low";
};

// ---------------------------------------------------------------------------
// Serialization helpers (JSON-safe ↔ runtime)
// ---------------------------------------------------------------------------

export interface SerializedPlayerState extends Omit<MatchPlayerState, "usedCardIds"> {
  usedCardIds: string[];
}

export type SerializedMatch = Omit<PazaakMatch, "players"> & {
  players: [SerializedPlayerState, SerializedPlayerState];
  spectatorMessageIds?: string[];
};

export const serializePlayer = (player: MatchPlayerState): SerializedPlayerState => ({
  ...player,
  usedCardIds: [...player.usedCardIds],
});

export const deserializePlayer = (data: SerializedPlayerState): MatchPlayerState => ({
  ...data,
  usedCardIds: new Set(data.usedCardIds),
  sideDeckId: data.sideDeckId ?? null,
  sideDeckLabel: data.sideDeckLabel ?? null,
  sideDeck: data.sideDeck ?? [],
  hasTiebreaker: data.hasTiebreaker ?? false,
});

export const serializeMatch = (match: PazaakMatch): SerializedMatch => ({
  ...match,
  players: [serializePlayer(match.players[0]!), serializePlayer(match.players[1]!)],
});

export const deserializeMatch = (data: SerializedMatch): PazaakMatch => ({
  ...data,
  players: [deserializePlayer(data.players[0]!), deserializePlayer(data.players[1]!)],
  spectatorMirrors: data.spectatorMirrors ?? (data.spectatorMessageIds ?? []).map((messageId) => ({ messageId, ownerId: "" })),
  initialStarterIndex: data.initialStarterIndex ?? 0,
  setsToWin: normalizeSetsToWin(data.setsToWin),
  gameMode: normalizePazaakGameMode(data.gameMode),
  lastSetWinnerIndex: data.lastSetWinnerIndex ?? null,
  consecutiveTies: data.consecutiveTies ?? 0,
  disconnectedSince: data.disconnectedSince ?? {},
  aiSeats: data.aiSeats ?? {},
});

// ---------------------------------------------------------------------------
// PazaakCoordinator — stateful game engine.
// ---------------------------------------------------------------------------

export class PazaakCoordinator {
  private readonly pendingChallenges = new Map<string, PendingChallenge>();
  private readonly matches = new Map<string, PazaakMatch>();
  private readonly activeMatchIdsByUserId = new Map<string, string>();

  public constructor(
    private readonly persistence?: MatchPersistence,
    private readonly options: PazaakCoordinatorOptions = {},
  ) { }

  public async initialize(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.persistence) return;

    const matches = await this.persistence.loadActive(maxAgeMs);

    for (const match of matches) {
      this.matches.set(match.id, match);

      for (const player of match.players) {
        this.activeMatchIdsByUserId.set(player.userId, match.id);
      }
    }
  }

  public getActiveMatches(): PazaakMatch[] {
    return [...this.matches.values()].filter((m) => m.phase !== "completed");
  }

  public createChallenge(input: {
    channelId: string;
    challengerId: string;
    challengerName: string;
    challengerDeckId?: number;
    challengerCustomDeck?: CustomSideDeckChoice;
    challengedId: string;
    challengedName: string;
    challengedDeckId?: number;
    challengedCustomDeck?: CustomSideDeckChoice;
    wager: number;
  }): PendingChallenge {
    if (this.activeMatchIdsByUserId.has(input.challengerId) || this.activeMatchIdsByUserId.has(input.challengedId)) {
      throw new Error("One of the players is already in an active match.");
    }

    this.validateChallengeDeckChoice("challenger", input.challengerDeckId, input.challengerCustomDeck);
    this.validateChallengeDeckChoice("challenged", input.challengedDeckId, input.challengedCustomDeck);

    const challenge: PendingChallenge = {
      id: randomUuid(),
      channelId: input.channelId,
      publicMessageId: null,
      challengerId: input.challengerId,
      challengerName: input.challengerName,
      challengerDeckId: input.challengerDeckId,
      challengerCustomDeck: input.challengerCustomDeck,
      challengedId: input.challengedId,
      challengedName: input.challengedName,
      challengedDeckId: input.challengedDeckId,
      challengedCustomDeck: input.challengedCustomDeck,
      wager: input.wager,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    this.pendingChallenges.set(challenge.id, challenge);
    return challenge;
  }

  public getPendingChallenge(challengeId: string): PendingChallenge | undefined {
    return this.pendingChallenges.get(challengeId);
  }

  public setChallengePublicMessageId(challengeId: string, messageId: string): PendingChallenge {
    const challenge = this.getRequiredChallenge(challengeId);
    challenge.publicMessageId = messageId;
    return challenge;
  }

  public declineChallenge(challengeId: string, userId: string): PendingChallenge {
    const challenge = this.getRequiredChallenge(challengeId);

    if (challenge.challengedId !== userId && challenge.challengerId !== userId) {
      throw new Error("Only participants can decline or cancel this challenge.");
    }

    this.pendingChallenges.delete(challengeId);
    return challenge;
  }

  public acceptChallenge(challengeId: string, userId: string, challengedDeckOverride?: SideDeckChoice): PazaakMatch {
    const challenge = this.getRequiredChallenge(challengeId);

    if (challenge.challengedId !== userId) {
      throw new Error("Only the challenged player can accept this match.");
    }

    if (challenge.expiresAt < Date.now()) {
      this.pendingChallenges.delete(challengeId);
      throw new Error("This challenge has expired.");
    }

    this.pendingChallenges.delete(challengeId);

    if (challengedDeckOverride !== undefined) {
      this.validateChallengeDeckChoice(
        "challenged",
        typeof challengedDeckOverride === "number" ? challengedDeckOverride : undefined,
        typeof challengedDeckOverride === "object" ? challengedDeckOverride : undefined,
      );
    }

    const challengedDeckChoice = challengedDeckOverride ?? challenge.challengedCustomDeck ?? challenge.challengedDeckId;

    const p1 = createPlayerState(challenge.challengerId, challenge.challengerName, challenge.challengerCustomDeck ?? challenge.challengerDeckId);
    const p2 = createPlayerState(challenge.challengedId, challenge.challengedName, challengedDeckChoice);
    return this.createMatchFromPlayers({
      channelId: challenge.channelId,
      wager: challenge.wager,
      players: [p1, p2],
    });
  }

  public createDirectMatch(input: {
    channelId: string;
    challengerId: string;
    challengerName: string;
    challengerDeck?: SideDeckChoice | undefined;
    opponentId: string;
    opponentName: string;
    opponentDeck?: SideDeckChoice | undefined;
    opponentAiDifficulty?: AiDifficulty | undefined;
    wager?: number | undefined;
    setsToWin?: number | undefined;
    gameMode?: PazaakGameMode | undefined;
    /** When set (e.g. Durable Object id), the match uses this stable id for shard routing. */
    matchId?: string | undefined;
  }): PazaakMatch {
    if (this.activeMatchIdsByUserId.has(input.challengerId) || this.activeMatchIdsByUserId.has(input.opponentId)) {
      throw new Error("One of the players is already in an active match.");
    }

    const gameMode = normalizePazaakGameMode(input.gameMode);

    this.validateChallengeDeckChoice(
      "challenger",
      typeof input.challengerDeck === "number" ? input.challengerDeck : undefined,
      typeof input.challengerDeck === "object" ? input.challengerDeck : undefined,
      gameMode,
    );
    this.validateChallengeDeckChoice(
      "opponent",
      typeof input.opponentDeck === "number" ? input.opponentDeck : undefined,
      typeof input.opponentDeck === "object" ? input.opponentDeck : undefined,
      gameMode,
    );

    const p1 = createPlayerState(input.challengerId, input.challengerName, input.challengerDeck);
    const p2 = createPlayerState(input.opponentId, input.opponentName, input.opponentDeck);
    const aiSeats = input.opponentAiDifficulty ? { [input.opponentId]: input.opponentAiDifficulty } : undefined;

    return this.createMatchFromPlayers({
      channelId: input.channelId,
      wager: input.wager ?? 0,
      players: [p1, p2],
      aiSeats,
      setsToWin: input.setsToWin,
      gameMode,
      matchId: input.matchId,
    });
  }

  public getMatch(matchId: string): PazaakMatch | undefined {
    return this.matches.get(matchId);
  }

  public getActiveMatchForUser(userId: string): PazaakMatch | undefined {
    const matchId = this.activeMatchIdsByUserId.get(userId);
    return matchId ? this.matches.get(matchId) : undefined;
  }

  public setPublicMessageId(matchId: string, messageId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    match.publicMessageId = messageId;
    match.updatedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  public registerSpectatorMessage(matchId: string, messageId: string, ownerId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);

    if (!match.spectatorMirrors.some((entry) => entry.messageId === messageId)) {
      match.spectatorMirrors.push({ messageId, ownerId });
      match.updatedAt = Date.now();
      this.safePersist(match);
    }

    return match;
  }

  public unregisterSpectatorMessage(matchId: string, messageId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const nextMirrors = match.spectatorMirrors.filter((entry) => entry.messageId !== messageId);

    if (nextMirrors.length !== match.spectatorMirrors.length) {
      match.spectatorMirrors = nextMirrors;
      match.updatedAt = Date.now();
      this.safePersist(match);
    }

    return match;
  }

  public markSettled(matchId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    match.settled = true;
    match.updatedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  public draw(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "turn") {
      throw new Error("Finish resolving the current draw before drawing again.");
    }

    const player = playerAt(match, playerIndex);

    if (player.stood) {
      throw new Error("Standing players cannot draw additional cards.");
    }

    let drawnCard = match.mainDeck.pop();

    if (drawnCard === undefined) {
      match.mainDeck = buildMainDeck();
      drawnCard = match.mainDeck.pop()!;
    }

    player.board.push({ value: drawnCard, frozen: false });
    player.total += drawnCard;
    match.pendingDraw = drawnCard;
    match.statusLine = `${player.displayName} draws ${drawnCard}.`;
    this.resetTurnClock(match);

    if (player.total > WIN_SCORE) {
      match.statusLine = `${player.displayName} draws ${drawnCard} and is over ${WIN_SCORE} at ${player.total}. Recover with one side card or end the turn to bust.`;
      match.phase = "after-draw";
      this.safePersist(match);
      return match;
    }

    if (player.board.length >= MAX_BOARD_SIZE) {
      return this.resolveNineCardWin(match, playerIndex);
    }

    match.phase = "after-draw";
    this.safePersist(match);
    return match;
  }

  public stand(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "after-draw" && match.phase !== "after-card") {
      throw new Error("You must draw before you can stand.");
    }

    const player = playerAt(match, playerIndex);

    if (player.total > WIN_SCORE) {
      throw new Error("You are over 20. Recover with a side card or end the turn to bust.");
    }

    player.stood = true;
    match.pendingDraw = null;

    if (match.players.every((entry) => entry.stood)) {
      return this.resolveStandingTotals(match);
    }

    const nextIndex = this.pickNextActiveIndex(match, playerIndex);
    const nextPlayer = playerAt(match, nextIndex);
    match.activePlayerIndex = nextIndex;
    match.phase = "turn";
    match.statusLine = `${player.displayName} stands on ${player.total}. ${nextPlayer.displayName} remains active.`;
    this.resetTurnClock(match);
    this.safePersist(match);
    return match;
  }

  public endTurn(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);
    const player = playerAt(match, playerIndex);

    if (match.phase !== "after-draw" && match.phase !== "after-card") {
      throw new Error("There is no pending draw to end yet.");
    }

    return this.finishTurn(match, playerIndex, `${player.displayName} pockets the current total.`);
  }

  public playSideCard(matchId: string, userId: string, cardId: string, appliedValue: number): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "after-draw") {
      throw new Error("A side card can only be played while resolving a fresh draw.");
    }

    const player = playerAt(match, playerIndex);
    const card = player.hand.find((entry) => entry.id === cardId);

    if (!card) {
      throw new Error("That side card is not in your current hand.");
    }

    if (player.usedCardIds.has(card.id)) {
      throw new Error("That side card has already been spent this set.");
    }

    if (!isCardTypeAllowedInMode(card.type, match.gameMode)) {
      throw new Error(
        `${card.label} is a Wacky-only card and cannot be played in a ${match.gameMode} match.`,
      );
    }

    switch (card.type) {
      case "plus":
        if (appliedValue !== card.value) throw new Error("Plus cards can only be played at their printed value.");
        break;
      case "minus":
        if (appliedValue !== -card.value) throw new Error("Minus cards can only be played at their printed negative value.");
        break;
      case "flip":
        if (Math.abs(appliedValue) !== card.value) throw new Error("This card can only be played at its printed magnitude.");
        break;
      case "value_change":
        if (Math.abs(appliedValue) !== 1 && Math.abs(appliedValue) !== 2) {
          throw new Error("VV can only be played as +1, +2, -1, or -2.");
        }
        break;
      case "copy_previous": {
        const previousBoardValue = player.board.at(-1)?.value;
        if (previousBoardValue === undefined) {
          throw new Error("D needs a previous resolved board card before it can be played.");
        }
        if (appliedValue !== previousBoardValue) {
          throw new Error("D can only copy the previous board card's resolved value.");
        }
        break;
      }
      case "tiebreaker":
        if (Math.abs(appliedValue) !== card.value) {
          throw new Error("Tiebreaker can only be played at its printed magnitude.");
        }
        break;
      case "flip_two_four":
      case "flip_three_six":
        break;
      case "mod_previous": {
        const previousBoardValue = player.board.at(-1)?.value;
        if (previousBoardValue === undefined) {
          throw new Error(`${card.label} needs a previous resolved board card before it can be played.`);
        }
        if (card.value <= 0) {
          throw new Error(`${card.label} has an invalid modulus.`);
        }
        const expected = modPythonStyle(previousBoardValue, card.value);
        if (appliedValue !== expected) {
          throw new Error(
            `${card.label} must be played at the remainder ${expected} (prev ${formatSignedValue(previousBoardValue)} mod ${card.value}).`,
          );
        }
        break;
      }
      case "halve_previous": {
        const previousBoardValue = player.board.at(-1)?.value;
        if (previousBoardValue === undefined) {
          throw new Error(`${card.label} needs a previous resolved board card before it can be played.`);
        }
        const expected = Math.trunc(previousBoardValue / 2);
        if (appliedValue !== expected) {
          throw new Error(
            `${card.label} must be played at the truncated half ${expected} of the previous card (${formatSignedValue(previousBoardValue)}).`,
          );
        }
        break;
      }
      case "hard_reset":
        if (appliedValue !== 0) {
          throw new Error("00 resolves at 0 and cannot be played with any other value.");
        }
        break;
    }

    player.usedCardIds.add(card.id);

    let summary: string;

    if (card.type === "flip_two_four" || card.type === "flip_three_six") {
      const targets = card.type === "flip_two_four" ? [2, 4] : [3, 6];
      let totalDelta = 0;
      for (const boardCard of player.board) {
        const src = boardCard.source;
        const isFlippable = src === undefined || src === "plus" || src === "minus";
        // Only flip cards whose current value is exactly the positive target (TSL-confirmed: only +3/+6, not −3/−6)
        if (!boardCard.frozen && isFlippable && targets.includes(boardCard.value)) {
          const oldVal = boardCard.value;
          boardCard.value = -boardCard.value;
          totalDelta += boardCard.value - oldVal;
        }
      }
      // TSL stores flip specials on the board with a resolved value of 0.
      player.board.push({ value: 0, frozen: false, source: card.type });
      player.total += totalDelta;
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue: 0 });
      const targetLabel = card.type === "flip_two_four" ? "2&4" : "3&6";
      summary = `${player.displayName} plays Flip ${targetLabel} for 0 — board adjusted by ${formatSignedValue(totalDelta)}.`;
    } else if (card.type === "hard_reset") {
      player.board.push({ value: 0, frozen: false, source: card.type });
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue: 0 });
      summary = `${player.displayName} plays 00 — the set is immediately wiped and re-opened.`;
      return this.resolveHardReset(match, playerIndex, summary);
    } else if (card.type === "mod_previous" || card.type === "halve_previous") {
      // These cards *reduce* the previous board card to a smaller remainder/half instead
      // of pushing a fresh additive card. Total is adjusted by the delta between the old
      // and new previous-card value, and the card itself occupies a 0-valued board slot
      // (same convention as TSL flip specials). `appliedValue` is the replacement value
      // for the previous card, which we validated above.
      const prevBoardCard = player.board.at(-1);
      if (!prevBoardCard) {
        // Defensive — getSideCardOptionsForPlayer and the validation above already ensure this.
        throw new Error(`${card.label} needs a previous resolved board card before it can be played.`);
      }
      const oldValue = prevBoardCard.value;
      prevBoardCard.value = appliedValue;
      const delta = appliedValue - oldValue;
      player.total += delta;
      player.board.push({ value: 0, frozen: false, source: card.type });
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue });
      summary = card.type === "mod_previous"
        ? `${player.displayName} plays ${card.label} — previous ${formatSignedValue(oldValue)} becomes ${formatSignedValue(appliedValue)} (${formatSignedValue(delta)}).`
        : `${player.displayName} plays /2 — previous ${formatSignedValue(oldValue)} halves to ${formatSignedValue(appliedValue)} (${formatSignedValue(delta)}).`;
    } else {
      if (card.type === "tiebreaker") {
        player.hasTiebreaker = true;
      }
      player.board.push({ value: appliedValue, frozen: false, source: card.type });
      player.total += appliedValue;
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue });
      if (card.type === "copy_previous") {
        summary = `${player.displayName} plays D, copying ${formatSignedValue(appliedValue)}.`;
      } else {
        summary = `${player.displayName} plays ${formatSignedValue(appliedValue)} from the side deck.`;
      }
    }

    if (player.total > WIN_SCORE) {
      return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} busts with ${player.total}.`);
    }

    if (player.board.length >= MAX_BOARD_SIZE) {
      return this.resolveNineCardWin(match, playerIndex);
    }

    match.phase = "after-card";
    match.statusLine = summary;
    this.resetTurnClock(match);
    this.safePersist(match);
    return match;
  }

  public forfeit(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.getParticipantIndex(match, userId);
    const opponentIndex = this.getOpponentIndex(playerIndex);
    const loser = playerAt(match, playerIndex);
    const winner = playerAt(match, opponentIndex);

    return this.completeMatch(
      match,
      opponentIndex,
      `${loser.displayName} forfeits. ${winner.displayName} takes the table.`,
    );
  }

  public markDisconnected(userId: string, at = this.now()): PazaakMatch | undefined {
    const match = this.getActiveMatchForUser(userId);

    if (!match || match.phase === "completed") {
      return undefined;
    }

    this.getParticipantIndex(match, userId);
    match.disconnectedSince = { ...(match.disconnectedSince ?? {}), [userId]: at };
    match.updatedAt = at;
    this.safePersist(match);
    return match;
  }

  public markReconnected(userId: string, at = this.now()): PazaakMatch | undefined {
    const match = this.getActiveMatchForUser(userId);

    if (!match || !match.disconnectedSince?.[userId]) {
      return match;
    }

    const nextDisconnectedSince = { ...match.disconnectedSince };
    delete nextDisconnectedSince[userId];
    match.disconnectedSince = nextDisconnectedSince;
    match.updatedAt = at;
    this.safePersist(match);
    return match;
  }

  public tickDisconnectForfeits(at = this.now()): PazaakMatch[] {
    const disconnectForfeitMs = this.options.disconnectForfeitMs ?? 30_000;
    const updatedMatches: PazaakMatch[] = [];

    for (const match of this.getActiveMatches()) {
      for (const player of match.players) {
        const disconnectedAt = match.disconnectedSince?.[player.userId];

        if (disconnectedAt !== undefined && at - disconnectedAt >= disconnectForfeitMs) {
          updatedMatches.push(this.forfeit(match.id, player.userId));
          break;
        }
      }
    }

    return updatedMatches;
  }

  public tickTurnTimers(at = this.now()): PazaakMatch[] {
    const updatedMatches: PazaakMatch[] = [];

    for (const match of this.getActiveMatches()) {
      if (match.turnDeadlineAt === undefined || match.turnDeadlineAt > at) {
        continue;
      }

      const activePlayer = playerAt(match, match.activePlayerIndex);

      try {
        const updated = match.phase === "turn"
          ? this.drawTimedOutTurn(match, activePlayer.userId)
          : activePlayer.total > WIN_SCORE
            ? this.endTurn(match.id, activePlayer.userId)
            : this.stand(match.id, activePlayer.userId);
        updated.statusLine = `${activePlayer.displayName} timed out. ${updated.statusLine}`;
        updated.updatedAt = at;
        this.safePersist(updated);
        updatedMatches.push(updated);
      } catch {
        // Timer ticks should not break the process if a match changed between checks.
      }
    }

    return updatedMatches;
  }

  public recommendAiMove(matchId: string, userId: string, difficulty?: AiDifficulty): PazaakAiMove {
    const match = this.getRequiredMatch(matchId);
    const aiDifficulty = difficulty ?? match.aiSeats?.[userId] ?? "professional";
    const snapshot = getAdvisorSnapshotForPlayer(match, userId, aiDifficulty);

    if (!snapshot) {
      throw new Error("No AI recommendation is available for that player.");
    }

    const baseMove = {
      rationale: snapshot.recommendation.rationale,
      delayMs: getAiThinkingDelayMs(aiDifficulty),
      difficulty: aiDifficulty,
    };

    switch (snapshot.recommendation.action) {
      case "draw":
        return { ...baseMove, action: "draw" };
      case "stand":
        return { ...baseMove, action: "stand" };
      case "end_turn":
        return { ...baseMove, action: "end_turn" };
      case "play_side":
        return {
          ...baseMove,
          action: "play_side",
          cardId: snapshot.recommendation.cardId,
          appliedValue: snapshot.recommendation.appliedValue,
          displayLabel: snapshot.recommendation.displayLabel,
        };
    }
  }

  public executeAiMove(matchId: string, userId: string, difficulty?: AiDifficulty): PazaakMatch {
    const move = this.recommendAiMove(matchId, userId, difficulty);

    switch (move.action) {
      case "draw":
        return this.draw(matchId, userId);
      case "stand":
        return this.stand(matchId, userId);
      case "end_turn":
        return this.endTurn(matchId, userId);
      case "play_side": {
        if (move.cardId === undefined || move.appliedValue === undefined) {
          throw new Error("AI side-card recommendation is missing card details.");
        }
        return this.playSideCard(matchId, userId, move.cardId, move.appliedValue);
      }
    }
  }

  private drawTimedOutTurn(match: PazaakMatch, userId: string): PazaakMatch {
    const drawn = this.draw(match.id, userId);

    if (drawn.phase === "completed" || playerAt(drawn, drawn.activePlayerIndex).userId !== userId) {
      return drawn;
    }

    if (drawn.phase === "after-draw" || drawn.phase === "after-card") {
      return this.endTurn(drawn.id, userId);
    }

    return drawn;
  }

  private finishTurn(match: PazaakMatch, playerIndex: number, summary: string): PazaakMatch {
    const player = playerAt(match, playerIndex);

    if (player.total > WIN_SCORE) {
      return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} still busts with ${player.total}.`);
    }

    if (player.board.length >= MAX_BOARD_SIZE) {
      return this.resolveNineCardWin(match, playerIndex);
    }

    const nextIndex = this.pickNextActiveIndex(match, playerIndex);
    const nextPlayer = playerAt(match, nextIndex);
    match.activePlayerIndex = nextIndex;
    match.phase = "turn";
    match.pendingDraw = null;
    match.statusLine =
      nextIndex === playerIndex
        ? `${summary} ${player.displayName} stays active because the opposing player is already standing.`
        : `${summary} ${nextPlayer.displayName} is up.`;
    this.resetTurnClock(match);
    this.safePersist(match);
    return match;
  }

  private resolveBust(match: PazaakMatch, bustedPlayerIndex: number, summary: string): PazaakMatch {
    const winnerIndex = this.getOpponentIndex(bustedPlayerIndex);
    const winner = playerAt(match, winnerIndex);
    const bustedPlayer = playerAt(match, bustedPlayerIndex);
    winner.roundWins += 1;
    match.lastSetWinnerIndex = winnerIndex;
    match.consecutiveTies = 0;

    if (winner.roundWins >= getMatchSetsToWin(match)) {
      return this.completeMatch(
        match,
        winnerIndex,
        `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${bustedPlayer.roundWins}.`,
      );
    }

    const starterIndex = bustedPlayerIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;
    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${winner.displayName} takes the set. ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private resolveNineCardWin(match: PazaakMatch, playerIndex: number): PazaakMatch {
    const winner = playerAt(match, playerIndex);
    const opponentIndex = this.getOpponentIndex(playerIndex);
    const loser = playerAt(match, opponentIndex);
    winner.roundWins += 1;
    match.lastSetWinnerIndex = playerIndex;
    match.consecutiveTies = 0;

    const summary = `${winner.displayName} fills the board with ${MAX_BOARD_SIZE} cards (total ${winner.total}) — automatic set win!`;

    if (winner.roundWins >= getMatchSetsToWin(match)) {
      return this.completeMatch(
        match,
        playerIndex,
        `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${loser.roundWins}.`,
      );
    }

    const starterIndex = opponentIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;
    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private resolveStandingTotals(match: PazaakMatch): PazaakMatch {
    const challenger = playerAt(match, 0);
    const challenged = playerAt(match, 1);

    if (challenger.total === challenged.total) {
      const p0Tie = challenger.hasTiebreaker;
      const p1Tie = challenged.hasTiebreaker;

      if (p0Tie && !p1Tie) {
        return this.resolveSetWinner(
          match,
          0,
          `${challenger.displayName} breaks the tie at ${challenger.total} with a Tiebreaker card!`,
        );
      }

      if (p1Tie && !p0Tie) {
        return this.resolveSetWinner(
          match,
          1,
          `${challenged.displayName} breaks the tie at ${challenged.total} with a Tiebreaker card!`,
        );
      }

      const starterIndex = match.initialStarterIndex;
      const upcomingSet = match.setNumber + 1;
      const starter = playerAt(match, starterIndex);

      match.consecutiveTies += 1;
      if (match.consecutiveTies >= MAX_CONSECUTIVE_TIES) {
        const tieWinnerIndex = challenger.roundWins >= challenged.roundWins ? 0 : 1;
        const tieWinner = playerAt(match, tieWinnerIndex);
        return this.completeMatch(
          match,
          tieWinnerIndex,
          `${new Array(MAX_CONSECUTIVE_TIES).fill("Set tied").join(", ")} — ${MAX_CONSECUTIVE_TIES} consecutive ties. ${tieWinner.displayName} wins the match by ${tieWinner.roundWins}-${playerAt(match, this.getOpponentIndex(tieWinnerIndex)).roundWins} record.`,
        );
      }

      return this.startSet(
        match,
        true,
        starterIndex,
        `Set tied at ${challenger.total}. ${starter.displayName} opens set ${upcomingSet}.`,
      );
    }

    const winnerIndex = challenger.total > challenged.total ? 0 : 1;
    const suffix = `${playerAt(match, winnerIndex).displayName} wins the set ${playerAt(match, winnerIndex).total}-${playerAt(match, this.getOpponentIndex(winnerIndex)).total}.`;
    return this.resolveSetWinner(match, winnerIndex, suffix);
  }

  /**
   * Wacky-mode `00` card. Mirrors the no-tiebreaker tie path from resolveStandingTotals:
   * the set ends immediately with no winner, consecutive-tie counter advances, and the
   * original initial-starter re-opens the next set. Matches hit the same five-ties
   * tie-break clamp that the standard tie flow uses.
   */
  private resolveHardReset(match: PazaakMatch, playerIndex: number, summary: string): PazaakMatch {
    const challenger = playerAt(match, 0);
    const challenged = playerAt(match, 1);
    const starterIndex = match.initialStarterIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;

    match.lastSetWinnerIndex = null;
    match.consecutiveTies += 1;

    if (match.consecutiveTies >= MAX_CONSECUTIVE_TIES) {
      const tieWinnerIndex = challenger.roundWins >= challenged.roundWins ? 0 : 1;
      const tieWinner = playerAt(match, tieWinnerIndex);
      const tieLoser = playerAt(match, this.getOpponentIndex(tieWinnerIndex));
      return this.completeMatch(
        match,
        tieWinnerIndex,
        `${summary} ${MAX_CONSECUTIVE_TIES} consecutive ties. ${tieWinner.displayName} wins the match ${tieWinner.roundWins}-${tieLoser.roundWins}.`,
      );
    }

    // Acknowledge who triggered the reset in the status line so observers can see it.
    const triggerName = playerAt(match, playerIndex).displayName;

    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${triggerName} triggers a 00 hard reset — set ${match.setNumber} ties, and ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private resolveSetWinner(match: PazaakMatch, winnerIndex: number, summary: string): PazaakMatch {
    const loserIndex = this.getOpponentIndex(winnerIndex);
    const winner = playerAt(match, winnerIndex);
    const loser = playerAt(match, loserIndex);
    winner.roundWins += 1;
    match.lastSetWinnerIndex = winnerIndex;
    match.consecutiveTies = 0;

    if (winner.roundWins >= getMatchSetsToWin(match)) {
      return this.completeMatch(
        match,
        winnerIndex,
        `${summary} ${winner.displayName} takes the match ${winner.roundWins}-${loser.roundWins}.`,
      );
    }

    const starterIndex = loserIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;
    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private startSet(
    match: PazaakMatch,
    incrementSetNumber: boolean,
    starterIndex: number,
    statusLine: string,
  ): PazaakMatch {
    if (incrementSetNumber) {
      match.setNumber += 1;
    }

    for (const player of match.players) {
      resetPlayerForSet(player);
    }

    match.mainDeck = buildMainDeck();
    match.pendingDraw = null;
    match.phase = "turn";
    match.activePlayerIndex = starterIndex;
    match.statusLine = statusLine;
    this.resetTurnClock(match);
    this.safePersist(match);
    return match;
  }

  private completeMatch(match: PazaakMatch, winnerIndex: number, summary: string): PazaakMatch {
    const loserIndex = this.getOpponentIndex(winnerIndex);
    const winner = playerAt(match, winnerIndex);
    const loser = playerAt(match, loserIndex);
    const challenger = playerAt(match, 0);
    const challenged = playerAt(match, 1);
    match.phase = "completed";
    match.pendingDraw = null;
    match.turnDeadlineAt = undefined;
    match.disconnectedSince = {};
    match.winnerId = winner.userId;
    match.winnerName = winner.displayName;
    match.loserId = loser.userId;
    match.loserName = loser.displayName;
    match.statusLine = summary;
    match.updatedAt = Date.now();
    this.activeMatchIdsByUserId.delete(challenger.userId);
    this.activeMatchIdsByUserId.delete(challenged.userId);
    this.safePersist(match);
    return match;
  }

  private createMatchFromPlayers(input: {
    channelId: string;
    wager: number;
    players: [MatchPlayerState, MatchPlayerState];
    aiSeats?: Record<string, AiDifficulty> | undefined;
    setsToWin?: number | undefined;
    gameMode?: PazaakGameMode | undefined;
    matchId?: string | undefined;
  }): PazaakMatch {
    const initialStarterIndex = Math.random() < 0.5 ? 0 : 1;
    const starter = input.players[initialStarterIndex]!;
    const now = this.now();
    const gameMode = normalizePazaakGameMode(input.gameMode);

    const match: PazaakMatch = {
      id: input.matchId?.trim() || randomUuid(),
      channelId: input.channelId,
      publicMessageId: null,
      spectatorMirrors: [],
      wager: input.wager,
      players: input.players,
      activePlayerIndex: initialStarterIndex,
      setNumber: 1,
      setsToWin: normalizeSetsToWin(input.setsToWin),
      gameMode,
      mainDeck: buildMainDeck(),
      phase: "turn",
      pendingDraw: null,
      statusLine: `${starter.displayName} opens set 1.`,
      createdAt: now,
      updatedAt: now,
      turnStartedAt: now,
      turnDeadlineAt: this.resolveTurnDeadline(now),
      disconnectedSince: {},
      aiSeats: input.aiSeats ?? {},
      initialStarterIndex,
      lastSetWinnerIndex: null,
      consecutiveTies: 0,
      winnerId: null,
      winnerName: null,
      loserId: null,
      loserName: null,
      settled: false,
    };

    this.matches.set(match.id, match);

    for (const player of match.players) {
      this.activeMatchIdsByUserId.set(player.userId, match.id);
    }

    this.safePersist(match);
    return match;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private resolveTurnDeadline(turnStartedAt: number): number | undefined {
    const turnTimeoutMs = this.options.turnTimeoutMs;
    return turnTimeoutMs && turnTimeoutMs > 0 ? turnStartedAt + turnTimeoutMs : undefined;
  }

  private resetTurnClock(match: PazaakMatch): void {
    const now = this.now();
    match.updatedAt = now;
    match.turnStartedAt = now;
    match.turnDeadlineAt = this.resolveTurnDeadline(now);
  }

  private safePersist(match: PazaakMatch): void {
    this.persistence?.save(match).catch((err) => {
      console.error("[pazaak-engine] Failed to persist match", match.id, err);
    });
  }

  private validateChallengeDeckChoice(
    label: "challenger" | "challenged" | "opponent",
    deckId?: number,
    customDeck?: CustomSideDeckChoice,
    gameMode: PazaakGameMode = "canonical",
  ): void {
    if (deckId !== undefined && customDeck !== undefined) {
      throw new Error(`${label} cannot use both a canonical deck id and a custom sideboard.`);
    }

    if (deckId !== undefined && !isCanonicalSideDeckSupported(deckId)) {
      throw new Error(`${label} deck ${deckId} is not supported by the current canonical engine.`);
    }

    if (customDeck !== undefined) {
      createCustomSideDeck({ ...customDeck, enforceTokenLimits: true, gameMode });
    }
  }

  private getRequiredChallenge(challengeId: string): PendingChallenge {
    const challenge = this.pendingChallenges.get(challengeId);

    if (!challenge) {
      throw new Error("That pazaak challenge no longer exists.");
    }

    return challenge;
  }

  private getRequiredMatch(matchId: string): PazaakMatch {
    const match = this.matches.get(matchId);

    if (!match) {
      throw new Error("That pazaak match is no longer active.");
    }

    return match;
  }

  private getParticipantIndex(match: PazaakMatch, userId: string): number {
    const index = match.players.findIndex((player) => player.userId === userId);

    if (index === -1) {
      throw new Error("You are not a participant in this match.");
    }

    return index;
  }

  private requireTurnOwner(match: PazaakMatch, userId: string): number {
    if (match.phase === "completed") {
      throw new Error("This match has already been completed.");
    }

    const index = this.getParticipantIndex(match, userId);

    if (playerAt(match, match.activePlayerIndex).userId !== userId) {
      throw new Error("It is not your turn to act.");
    }

    return index;
  }

  private getOpponentIndex(playerIndex: number): number {
    return playerIndex === 0 ? 1 : 0;
  }

  private pickNextActiveIndex(match: PazaakMatch, currentIndex: number): number {
    const opponentIndex = this.getOpponentIndex(currentIndex);
    return playerAt(match, opponentIndex).stood ? currentIndex : opponentIndex;
  }
}

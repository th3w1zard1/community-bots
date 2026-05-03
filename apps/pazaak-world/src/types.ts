// ---------------------------------------------------------------------------
// Serialized match types — mirrors @openkotor/pazaak-engine SerializedMatch
// but is safe to import in the browser (no node:crypto dependency).
// ---------------------------------------------------------------------------

import type { PazaakOpponentDifficulty, PazaakOpponentPhraseKey } from "@openkotor/pazaak-engine/opponents";

export type SideCardType =
  | "plus"
  | "minus"
  | "flip"
  | "value_change"
  | "copy_previous"
  | "tiebreaker"
  | "flip_two_four"
  | "flip_three_six"
  | "mod_previous"
  | "halve_previous"
  | "hard_reset";

/**
 * Canonical vs wacky game mode flag — canonical enforces TSL card pool; wacky
 * additionally allows %N / /2 / 00 experimental cards. Ranked and matchmaking
 * play are hard-coded to "canonical" on the server.
 */
export type PazaakGameMode = "canonical" | "wacky";

export interface SideCard {
  id: string;
  label: string;
  value: number;
  type: SideCardType;
}

export interface AppliedSideCard {
  cardId: string;
  label: string;
  appliedValue: number;
}

export interface BoardCard {
  value: number;
  frozen: boolean;
  source?: SideCardType;
}

export interface SerializedPlayerState {
  userId: string;
  displayName: string;
  roundWins: number;
  sideDeckId: number | null;
  sideDeckLabel: string | null;
  sideDeck: SideCard[];
  hand: SideCard[];
  usedCardIds: string[];
  board: BoardCard[];
  sideCardsPlayed: AppliedSideCard[];
  total: number;
  stood: boolean;
  hasTiebreaker: boolean;
}

export interface SerializedMatch {
  id: string;
  channelId: string;
  publicMessageId: string | null;
  wager: number;
  players: [SerializedPlayerState, SerializedPlayerState];
  activePlayerIndex: number;
  setNumber: number;
  setsToWin?: number;
  mainDeck: number[];
  phase: "turn" | "after-draw" | "after-card" | "completed";
  pendingDraw: number | null;
  statusLine: string;
  createdAt: number;
  updatedAt: number;
  turnStartedAt: number;
  turnDeadlineAt?: number;
  disconnectedSince?: Record<string, number>;
  aiSeats?: Record<string, AdvisorDifficulty>;
  initialStarterIndex: number;
  lastSetWinnerIndex: number | null;
  consecutiveTies: number;
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
  loserName: string | null;
  settled: boolean;
  /** Nakama authoritative match id for realtime join (socket); set by backend when available. */
  nakamaMatchId?: string;
}

export interface SideCardOption {
  cardId: string;
  displayLabel: string;
  appliedValue: number;
}

export type AdvisorDifficulty = "easy" | "hard" | "professional";

export interface PazaakOpponentPrizeTable {
  credits: number;
  cards: readonly string[];
}

export interface PazaakOpponentProfileRecord {
  id: string;
  aliases?: readonly string[];
  name: string;
  description: string;
  difficulty: PazaakOpponentDifficulty;
  advisorDifficulty: AdvisorDifficulty;
  standAt: number;
  tieChance: number;
  species: string;
  origin: string;
  archetype: string;
  skillLevel: number;
  prizes: PazaakOpponentPrizeTable;
  sideDeckTokens: readonly string[];
  phrases: Readonly<Record<PazaakOpponentPhraseKey, readonly string[]>>;
  sources: readonly ("HoloPazaak" | "PazaakWorld" | "pazaak-world")[];
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

export interface SavedSideboardRecord {
  name: string;
  tokens: string[];
  updatedAt: string;
  isActive: boolean;
}

export interface SavedSideboardCollectionRecord {
  userId: string;
  displayName: string;
  activeName: string | null;
  sideboards: SavedSideboardRecord[];
  ownedSideDeckTokens?: readonly string[];
  updatedAt: string;
}

/** Visual colour preset applied to the card table surface. */
export type PazaakTableTheme =
  | "ebon-hawk"
  | "coruscant"
  | "tatooine"
  | "manaan"
  | "dantooine"
  | "malachor";

/** Card-back artwork style. */
export type PazaakCardBackStyle =
  | "classic"
  | "holographic"
  | "mandalorian"
  | "republic"
  | "sith";

/** Ambient background atmosphere applied behind the board. */
export type PazaakTableAmbience =
  | "cantina"
  | "ebon-hawk"
  | "jedi-archives"
  | "outer-rim"
  | "sith-sanctum";

/** Audio theme for card/game sound effects. */
export type PazaakSoundTheme = "default" | "cantina" | "droid" | "force";

export type PazaakChatAudience = "everyone" | "guild" | "silent";

export interface PazaakUserSettings {
  // --- Table & Cards ---
  tableTheme: PazaakTableTheme;
  cardBackStyle: PazaakCardBackStyle;
  tableAmbience: PazaakTableAmbience;
  // --- Accessibility ---
  soundEnabled: boolean;
  soundTheme: PazaakSoundTheme;
  reducedMotionEnabled: boolean;
  // --- Combat Rules ---
  turnTimerSeconds: number;
  preferredAiDifficulty: AdvisorDifficulty;
  confirmForfeit: boolean;
  highlightValidPlays: boolean;
  focusMode: boolean;
  // --- Interface ---
  showRatingsInGame: boolean;
  showGuildEmblems: boolean;
  showHolocronStreaks: boolean;
  showPostMatchDebrief: boolean;
  // --- Comms ---
  chatAudience: PazaakChatAudience;
}

export interface WalletRecord {
  userId: string;
  displayName: string;
  preferredRuntimeDeckId: number | null;
  /** Unlocked side-deck tokens; returned on `/api/me` and sideboard payloads. */
  ownedSideDeckTokens?: readonly string[];
  balance: number;
  wins: number;
  losses: number;
  mmr: number;
  /** Rating deviation (“confidence”); high = more volatile MMR swings. See wiki ratings doc. */
  mmrRd: number;
  gamesPlayed: number;
  gamesWon: number;
  lastMatchAt: string | null;
  userSettings: PazaakUserSettings;
  streak: number;
  bestStreak: number;
  lastDailyAt: string | null;
  progressClaims?: readonly string[];
  unopenedCratesStandard?: number;
  unopenedCratesPremium?: number;
  updatedAt: string;
}

export interface MatchmakingQueueRecord {
  userId: string;
  displayName: string;
  mmr: number;
  preferredMaxPlayers: number;
  enqueuedAt: string;
}

export interface PazaakLobbyPlayerRecord {
  userId: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  isAi: boolean;
  aiDifficulty?: AdvisorDifficulty;
  connectionStatus?: "connected" | "disconnected" | "ai_takeover";
  joinedAt: string;
}

export type PazaakTableVariant = "canonical" | "multi_seat";

export type PazaakLobbySideboardMode = "runtime_random" | "player_active_custom" | "host_mirror_custom";

export interface PazaakTableSettings {
  variant: PazaakTableVariant;
  maxPlayers: number;
  maxRounds: number;
  turnTimerSeconds: number;
  ranked: boolean;
  allowAiFill: boolean;
  sideboardMode: PazaakLobbySideboardMode;
  gameMode?: PazaakGameMode;
}

export interface PazaakLobbyRecord {
  id: string;
  lobbyCode: string;
  name: string;
  hostUserId: string;
  maxPlayers: number;
  tableSettings: PazaakTableSettings;
  passwordHash: string | null;
  status: "waiting" | "matchmaking" | "in_game" | "closed";
  matchId: string | null;
  players: PazaakLobbyPlayerRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PazaakMatchHistoryRecord {
  matchId: string;
  channelId: string;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
  wager: number;
  completedAt: string;
  summary: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  mmr: number;
  gamesPlayed: number;
  gamesWon: number;
  wins: number;
  losses: number;
  balance: number;
}

// ---------------------------------------------------------------------------
// Tournament records — mirrors @openkotor/pazaak-tournament shapes so the
// Activity can consume them directly without bundling node:crypto.
// ---------------------------------------------------------------------------

export type TournamentFormat = "single_elim" | "double_elim" | "swiss";

export type TournamentStatus = "registration" | "active" | "completed" | "cancelled";

export type TournamentMatchState = "pending" | "active" | "reported" | "bye" | "cancelled";

export interface TournamentParticipantRecord {
  userId: string;
  displayName: string;
  mmr: number;
  seed: number | null;
  status: "registered" | "active" | "eliminated" | "withdrawn" | "champion";
  registeredAt: number;
}

export interface TournamentMatchRecord {
  id: string;
  round: number;
  index: number;
  bracket?: "winners" | "losers" | "grand_final" | "grand_final_reset";
  state: TournamentMatchState;
  participantAId: string | null;
  participantBId: string | null;
  winnerUserId: string | null;
  loserUserId: string | null;
  engineMatchId: string | null;
  scheduledAt: number | null;
  completedAt: number | null;
  winnerAdvancesToMatchId?: string | null;
  loserAdvancesToMatchId?: string | null;
}

export interface SwissStandingsRowRecord {
  userId: string;
  displayName: string;
  seed: number | null;
  wins: number;
  losses: number;
  draws: number;
  buchholz: number;
  sonnebornBerger: number;
  opponentIds: string[];
  matchPoints: number;
}

export interface TournamentStateRecord {
  id: string;
  name: string;
  guildId: string | null;
  channelId: string | null;
  organizerId: string;
  organizerName: string;
  format: TournamentFormat;
  setsPerMatch: number;
  gameMode: PazaakGameMode;
  rounds: number;
  maxParticipants: number | null;
  status: TournamentStatus;
  currentRound: number;
  participants: Record<string, TournamentParticipantRecord>;
  matches: TournamentMatchRecord[];
  championUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentBracketColumnRecord {
  round: number;
  bracket: "winners" | "losers" | "grand_final" | "grand_final_reset" | "swiss";
  matches: TournamentMatchRecord[];
}

export interface TournamentBracketViewRecord {
  columns: TournamentBracketColumnRecord[];
}

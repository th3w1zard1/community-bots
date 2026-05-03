// ---------------------------------------------------------------------------
// Pazaak rulebook — single source of truth for every how-to-play surface.
//
// The Discord bot, the PazaakWorld Activity, the main menu preset, and the
// markdown guides all render from this module. Do NOT fork the data: add new
// cards, strategy notes, or mode contracts here and re-export them instead.
//
// Canonical (KOTOR/TSL-verified) rules are sourced from:
//   - docs/pazaak-reverse-engineering.md (binary-level findings, 2DA/GFF decoding)
//   - StrategyWiki: Knights of the Old Republic II (community merchant notes)
// Wacky mode cards (mod/halve/hard-reset) are project-original and live behind
// the PazaakGameMode === "wacky" flag — they never leak into canonical play.
// ---------------------------------------------------------------------------

export type PazaakCardRarity =
  | "starter"        // Granted on wallet creation; the plus/minus/flip core.
  | "common"         // Unlocked via daily/match rewards.
  | "uncommon"       // Tiebreaker + value-change rarer drops.
  | "rare"           // Gold specials ($$, F1, F2).
  | "wacky_only";    // Only available in Wacky lobbies / AI practice.

/** TSL 2DA row ID for canonical tokens, or null for Wacky-only cards. */
export type CanonicalRowId = number | null;

export type RulebookGameMode = "canonical" | "wacky";

export interface RulebookCardEntry {
  /** Normalized side-deck token — the key used by `normalizeSideDeckToken` and the workshop. */
  token: string;
  /** Player-facing label used across UI. Matches the printed card art. */
  displayLabel: string;
  /** Canonical TSL card name (e.g. "Double" for $$). Used as a parenthetical note only. */
  canonicalTslLabel?: string;
  /** Engine-internal card type. */
  engineType: string;
  /** Numeric magnitude — `0` for effect-driven cards. */
  magnitude: number;
  /** Required game mode. Canonical cards are playable in both modes. */
  gameMode: RulebookGameMode;
  /** Rarity tier — drives acquisition rewards and workshop surfaces. */
  rarity: PazaakCardRarity;
  /** Estimated tier score 0-100 from scripts/pazaak_probability_audit.mjs Monte-Carlo runs. */
  tierScore: number;
  /** One-sentence mechanical description. */
  mechanic: string;
  /** Concrete "play this when..." coaching note for the strategy guide. */
  whenToUse: string;
  /** Binary-verified TSL notes (flip-target asymmetries, dispatch quirks). Empty for project-original cards. */
  tslNotes?: string;
  /** Max copies permitted in a custom sideboard (per-token, not per-type). */
  sideboardLimit: 1 | 4;
}

export interface RulebookBasicStep {
  title: string;
  body: string;
}

export interface RulebookStrategyNote {
  title: string;
  body: string;
}

export interface RulebookGameModeEntry {
  id: RulebookGameMode;
  title: string;
  summary: string;
  contract: string;
}

export interface RulebookDeckLimits {
  sideDeckSize: number;
  handSize: number;
  maxBoardSize: number;
  winScore: number;
  setsToWin: number;
  standardTokenLimit: number;
  specialTokenLimit: number;
  maxConsecutiveTies: number;
  /**
   * Pre-computed bust probability for every total 0..20 assuming a fresh
   * uniform 40-card shoe (4 copies of 1..10). Index by current total. Totals
   * at or above WIN_SCORE are pinned to 1 to keep UI widgets monotonic.
   */
  bustProbabilityTable: readonly number[];
}

export interface PazaakRulebook {
  cards: readonly RulebookCardEntry[];
  basics: readonly RulebookBasicStep[];
  strategy: readonly RulebookStrategyNote[];
  gameModes: readonly RulebookGameModeEntry[];
  deckLimits: RulebookDeckLimits;
}

const BUST_PROBABILITY_TABLE = Object.freeze(computeUniformBustTable()) as readonly number[];

/**
 * Compute the probability that the next draw from a fresh uniform 40-card shoe
 * (4 copies of each 1..10) pushes `total` past 20. Totals <= 10 are always safe
 * for the first draw, totals at or above 20 always bust.
 */
function computeUniformBustTable(): number[] {
  const counts = new Array(11).fill(4) as number[];
  const deckSize = counts.reduce((sum, c) => sum + c, 0);
  const table: number[] = [];

  for (let total = 0; total <= 20; total += 1) {
    if (total >= 20) {
      // Already standing at 20 or higher — any further draw is categorically a bust.
      table.push(1);
      continue;
    }

    const needsLessThan = 20 - total;
    let bustingCards = 0;

    for (let value = 1; value <= 10; value += 1) {
      if (value > needsLessThan) {
        bustingCards += counts[value]!;
      }
    }

    table.push(bustingCards / deckSize);
  }

  return table;
}

export { BUST_PROBABILITY_TABLE };

/**
 * Primary card catalogue. Tokens are authoritative — every other surface
 * (tooltip, embed page, docs table) must derive its entry from this array.
 */
const CARDS: readonly RulebookCardEntry[] = Object.freeze([
  // --- Plus cards (+1..+6). TSL sideboard 2DA IDs 1..6. ---
  { token: "+1", displayLabel: "+1", engineType: "plus", magnitude: 1, gameMode: "canonical", rarity: "starter", tierScore: 38, mechanic: "Adds +1 to your total.", whenToUse: "Precision card — sleek for landing exactly on 20 when you are already at 19.", sideboardLimit: 4 },
  { token: "+2", displayLabel: "+2", engineType: "plus", magnitude: 2, gameMode: "canonical", rarity: "starter", tierScore: 44, mechanic: "Adds +2 to your total.", whenToUse: "Safe closer from 16-18 totals and a reliable exact-20 tool from 18.", sideboardLimit: 4 },
  { token: "+3", displayLabel: "+3", engineType: "plus", magnitude: 3, gameMode: "canonical", rarity: "starter", tierScore: 49, mechanic: "Adds +3 to your total.", whenToUse: "Strong pressure card from 15-17 to lock in 18-20.", sideboardLimit: 4 },
  { token: "+4", displayLabel: "+4", engineType: "plus", magnitude: 4, gameMode: "canonical", rarity: "starter", tierScore: 46, mechanic: "Adds +4 to your total.", whenToUse: "Bridge card from 14-16 but risky when you already have a soft 18.", sideboardLimit: 4 },
  { token: "+5", displayLabel: "+5", engineType: "plus", magnitude: 5, gameMode: "canonical", rarity: "starter", tierScore: 42, mechanic: "Adds +5 to your total.", whenToUse: "Spike card — best from 13-15 to reach the 18-20 window.", sideboardLimit: 4 },
  { token: "+6", displayLabel: "+6", engineType: "plus", magnitude: 6, gameMode: "canonical", rarity: "common", tierScore: 36, mechanic: "Adds +6 to your total.", whenToUse: "Volatile; save for 12-14 recoveries so you do not overshoot 20.", sideboardLimit: 4 },

  // --- Minus cards (-1..-6). TSL sideboard 2DA IDs 7..12. ---
  { token: "-1", displayLabel: "-1", engineType: "minus", magnitude: 1, gameMode: "canonical", rarity: "starter", tierScore: 39, mechanic: "Subtracts 1 from your total.", whenToUse: "Precise bust recovery when a one-card miss pushed you to 21.", sideboardLimit: 4 },
  { token: "-2", displayLabel: "-2", engineType: "minus", magnitude: 2, gameMode: "canonical", rarity: "starter", tierScore: 48, mechanic: "Subtracts 2 from your total.", whenToUse: "The most versatile recovery card — clean rescue from 21-22.", sideboardLimit: 4 },
  { token: "-3", displayLabel: "-3", engineType: "minus", magnitude: 3, gameMode: "canonical", rarity: "starter", tierScore: 52, mechanic: "Subtracts 3 from your total.", whenToUse: "Recovery king — pulls 22-23 draws back to 19-20.", sideboardLimit: 4 },
  { token: "-4", displayLabel: "-4", engineType: "minus", magnitude: 4, gameMode: "canonical", rarity: "starter", tierScore: 50, mechanic: "Subtracts 4 from your total.", whenToUse: "Pure recovery tool, weaker for exact-20 lines because you rarely sit at 24.", sideboardLimit: 4 },
  { token: "-5", displayLabel: "-5", engineType: "minus", magnitude: 5, gameMode: "canonical", rarity: "starter", tierScore: 44, mechanic: "Subtracts 5 from your total.", whenToUse: "Emergency bust-recovery; also lets you sandbag 18 down to 13 if opponent busts.", sideboardLimit: 4 },
  { token: "-6", displayLabel: "-6", engineType: "minus", magnitude: 6, gameMode: "canonical", rarity: "common", tierScore: 41, mechanic: "Subtracts 6 from your total.", whenToUse: "Hardest to slot — only viable when a +6 or 10 pushed you far past 20.", sideboardLimit: 4 },

  // --- Flip cards (±1..±6). TSL sideboard 2DA IDs 13..18. ---
  { token: "*1", displayLabel: "±1", engineType: "flip", magnitude: 1, gameMode: "canonical", rarity: "common", tierScore: 53, mechanic: "Chooses +1 or -1 on play.", whenToUse: "Always a safe inclusion — both hits are small swings with clean exact-20 lines.", sideboardLimit: 4 },
  { token: "*2", displayLabel: "±2", engineType: "flip", magnitude: 2, gameMode: "canonical", rarity: "common", tierScore: 60, mechanic: "Chooses +2 or -2 on play.", whenToUse: "The default 'always take' flip — fixes 18→20 and recovers 22→20.", sideboardLimit: 4 },
  { token: "*3", displayLabel: "±3", engineType: "flip", magnitude: 3, gameMode: "canonical", rarity: "uncommon", tierScore: 64, mechanic: "Chooses +3 or -3 on play.", whenToUse: "Strongest 'two-way' card; slots into nearly every deck.", sideboardLimit: 4 },
  { token: "*4", displayLabel: "±4", engineType: "flip", magnitude: 4, gameMode: "canonical", rarity: "uncommon", tierScore: 58, mechanic: "Chooses +4 or -4 on play.", whenToUse: "Great for 12→16 setup or 24→20 recovery; less reliable for exact finishes.", sideboardLimit: 4 },
  { token: "*5", displayLabel: "±5", engineType: "flip", magnitude: 5, gameMode: "canonical", rarity: "uncommon", tierScore: 52, mechanic: "Chooses +5 or -5 on play.", whenToUse: "High-swing card — best for 13-15 aggression or 24-25 recovery.", sideboardLimit: 4 },
  { token: "*6", displayLabel: "±6", engineType: "flip", magnitude: 6, gameMode: "canonical", rarity: "rare", tierScore: 48, mechanic: "Chooses +6 or -6 on play.", whenToUse: "Volatile pressure card; rarely lands exactly on 20.", sideboardLimit: 4 },

  // --- Gold / special canonical cards. TSL rows 19..23. ---
  { token: "VV", displayLabel: "1±2", canonicalTslLabel: "ValueChange", engineType: "value_change", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 71, mechanic: "Plays as +1, +2, -1, or -2 — your choice on resolution.", whenToUse: "The most flexible card in the game — the unique exact-20 tool alongside D.", tslNotes: "TSL row 19 (0x16). Normalized engine type: value_change.", sideboardLimit: 1 },
  { token: "$$", displayLabel: "Copy Previous (D)", canonicalTslLabel: "Double", engineType: "copy_previous", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 72, mechanic: "Copies the resolved value of the previous board card (player-facing: Copy Previous; TSL name: Double).", whenToUse: "Doubles down on a strong previous card; stellar with -3/-4 for bust recovery or with +5/+6 for finishes.", tslNotes: "TSL Double ($$). Cannot open a board — a previous resolved card is required.", sideboardLimit: 1 },
  { token: "TT", displayLabel: "±1T", canonicalTslLabel: "TieBreaker", engineType: "tiebreaker", magnitude: 1, gameMode: "canonical", rarity: "rare", tierScore: 66, mechanic: "Plays as +1 or -1 and tags you with Tiebreaker for the rest of the set. Career unlock only: awarded once at 10,000 wins — never drops from crates or random packs.", whenToUse: "Pair with precision draws — ties convert into wins for the tagged player.", tslNotes: "TSL TieBreaker sets the hasTiebreaker flag on the player.", sideboardLimit: 1 },
  { token: "F1", displayLabel: "Flip 2&4", canonicalTslLabel: "FlipTwoAndFour", engineType: "flip_two_four", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 57, mechanic: "Flips the sign of every unfrozen +2 and +4 on your board.", whenToUse: "Board-reset tool when you have stacked low-value plus cards; weakest with empty/early boards.", tslNotes: "Binary RE confirms only exact +2 and +4 values flip (not -2/-4). The card's own slot resolves to 0.", sideboardLimit: 1 },
  { token: "F2", displayLabel: "Flip 3&6", canonicalTslLabel: "FlipThreeAndSix", engineType: "flip_three_six", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 54, mechanic: "Flips the sign of every unfrozen +3 and +6 on your board.", whenToUse: "Recovery for 22-24 boards that accumulated +3s/+6s; rarely useful without the right board shape.", tslNotes: "Binary RE confirms only exact +3 and +6 values flip (not -3/-6). The card's own slot resolves to 0.", sideboardLimit: 1 },

  // --- Wacky-only cards (project-original). ---
  { token: "%3", displayLabel: "%3", engineType: "mod_previous", magnitude: 3, gameMode: "wacky", rarity: "wacky_only", tierScore: 55, mechanic: "Replaces the previous board card with its Python-style remainder modulo 3 (always non-negative).", whenToUse: "Wacky recovery when the previous card was a +4/+5/+6 that pushed you past 20.", sideboardLimit: 1 },
  { token: "%4", displayLabel: "%4", engineType: "mod_previous", magnitude: 4, gameMode: "wacky", rarity: "wacky_only", tierScore: 56, mechanic: "Replaces the previous board card with its Python-style remainder modulo 4.", whenToUse: "Wacky recovery against +5/+6/+7+ previous cards.", sideboardLimit: 1 },
  { token: "%5", displayLabel: "%5", engineType: "mod_previous", magnitude: 5, gameMode: "wacky", rarity: "wacky_only", tierScore: 52, mechanic: "Replaces the previous board card with its Python-style remainder modulo 5.", whenToUse: "Wacky recovery that preserves most of a medium previous card.", sideboardLimit: 1 },
  { token: "%6", displayLabel: "%6", engineType: "mod_previous", magnitude: 6, gameMode: "wacky", rarity: "wacky_only", tierScore: 49, mechanic: "Replaces the previous board card with its Python-style remainder modulo 6.", whenToUse: "Niche — typically only swings previous cards 7+ or negative previous cards.", sideboardLimit: 1 },
  { token: "/2", displayLabel: "/2", engineType: "halve_previous", magnitude: 0, gameMode: "wacky", rarity: "wacky_only", tierScore: 60, mechanic: "Replaces the previous board card with `trunc(prev / 2)` — truncates toward zero so -5 becomes -2.", whenToUse: "Soft Wacky recovery when the previous card is even-valued and pushed you past 20.", sideboardLimit: 1 },
  { token: "00", displayLabel: "00", engineType: "hard_reset", magnitude: 0, gameMode: "wacky", rarity: "wacky_only", tierScore: 42, mechanic: "Immediately ties the current set with no winner and re-opens from the initial starter. Consecutive-tie counter advances.", whenToUse: "Emergency pressure card against an opponent closing out match point; never in a winning set.", sideboardLimit: 1 },
]);

const BASICS: readonly RulebookBasicStep[] = Object.freeze([
  { title: "1. Draw a main-deck card", body: "Pull a card from the shared 40-card shoe (four copies of 1..10). The value is added to your board total immediately." },
  { title: "2. Decide your response", body: "If the draw is a keeper, stand or end the turn. If it overshoots, either play a side card to recover or end the turn to accept the bust." },
  { title: "3. Play a side card (optional)", body: "Once per turn you may play one of your four hand cards. Every side card is spent after use and will not return for the rest of the match." },
  { title: "4. End the turn or stand", body: "Stand to lock in the current total; end the turn to pass without standing so you can draw again later. Both busts and nine-card boards resolve the set immediately." },
  { title: "5. Win three sets", body: "Sets resolve via highest valid total ≤ 20, bust, or a 9-card auto-win. First to three set wins takes the match; five straight ties settle the match on round-win record." },
]);

const STRATEGY: readonly RulebookStrategyNote[] = Object.freeze([
  { title: "Subtract first", body: "When an opponent busts, the strongest recovery for your own board is a subtract card, not a plus. Subtract-first doctrine prevents you from over-committing to a high total the opponent already surrendered." },
  { title: "Aim for 14, not 20", body: "A low-teens total with several cards in hand leaves more safe draws than 18-19. Sit at 14 against aggressive opponents so you can always stand once they commit." },
  { title: "Flip > Plus", body: "Flip cards (±N) are almost always stronger than equivalent Plus cards because they cover both recovery and finishing lines. Slot flips before plus duplicates." },
  { title: "Save gold for finishes", body: "VV, D ($$), TT, and the F-specials are scarcer (1-copy limit) and most valuable when locking exactly 20 or breaking a tie. Do not burn them on 12→17 setup plays." },
  { title: "Bust probability table", body: "Track the next-draw bust odds at your current total before deciding to draw or stand. See the bust probability chart for the exact values used by the advisor." },
  { title: "Ninth-slot auto-win", body: "If you fit nine cards onto the board without going over 20, you win the set immediately regardless of total. Safe side-card plays that fill the ninth slot are always correct." },
]);

const GAME_MODES: readonly RulebookGameModeEntry[] = Object.freeze([
  {
    id: "canonical",
    title: "Canonical",
    summary: "TSL-verified cards only. Matchmaking, ranked play, and every canonical AI opponent use this mode.",
    contract: "Only the 23 TSL-verified side cards are legal. Custom sideboards that include Wacky-only tokens are rejected at deck build time. Ranked lobbies and quick-match queues force canonical regardless of lobby settings.",
  },
  {
    id: "wacky",
    title: "Wacky",
    summary: "Canonical + experimental cards (%3-%6, /2, 00). Private lobbies and AI practice only — never matchmaking or ranked.",
    contract: "Every canonical card remains legal. Additionally, mod_previous, halve_previous, and hard_reset cards become draftable with a 1-per-token limit. Wacky-only card drops are locked behind Local Opponent Hard+ victories.",
  },
]);

const DECK_LIMITS: RulebookDeckLimits = Object.freeze({
  sideDeckSize: 10,
  handSize: 4,
  maxBoardSize: 9,
  winScore: 20,
  setsToWin: 3,
  standardTokenLimit: 4,
  specialTokenLimit: 1,
  maxConsecutiveTies: 5,
  bustProbabilityTable: BUST_PROBABILITY_TABLE,
});

export const PAZAAK_RULEBOOK: PazaakRulebook = Object.freeze({
  cards: CARDS,
  basics: BASICS,
  strategy: STRATEGY,
  gameModes: GAME_MODES,
  deckLimits: DECK_LIMITS,
}) as PazaakRulebook;

/** Look up a card reference by its normalized side-deck token. */
export const getCardReference = (token: string): RulebookCardEntry | undefined => {
  return CARDS.find((entry) => entry.token === token);
};

/** Filter the rulebook to only cards legal in the given mode. */
export const getCardsForMode = (mode: RulebookGameMode): readonly RulebookCardEntry[] => {
  if (mode === "wacky") {
    return CARDS;
  }

  return CARDS.filter((entry) => entry.gameMode === "canonical");
};

/** Return every card of a given rarity tier (for reward tables / workshop UI). */
export const getCardsByRarity = (rarity: PazaakCardRarity): readonly RulebookCardEntry[] => {
  return CARDS.filter((entry) => entry.rarity === rarity);
};

/**
 * Read the pre-computed bust probability for a given total. Clamps to the table
 * range so callers never have to guard against >20 inputs.
 */
export const getBustProbabilityFromTable = (total: number): number => {
  if (!Number.isFinite(total)) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(20, Math.trunc(total)));
  return BUST_PROBABILITY_TABLE[clamped] ?? 0;
};

/**
 * Compute next-draw bust probability against a specific main-deck snapshot.
 * Falls back to the uniform-shoe table when no deck snapshot is available.
 */
export const getBustProbability = (total: number, remainingDeck?: readonly number[]): number => {
  if (!Number.isFinite(total)) {
    return 0;
  }

  if (!remainingDeck || remainingDeck.length === 0) {
    return getBustProbabilityFromTable(total);
  }

  if (total >= 20) {
    return 1;
  }

  if (total < 0) {
    return 0;
  }

  const threshold = 20 - total;
  let busting = 0;

  for (const value of remainingDeck) {
    if (value > threshold) {
      busting += 1;
    }
  }

  return busting / remainingDeck.length;
};

/**
 * Starter card tokens (as a flat list of copies) granted on first wallet creation.
 * Exposed here so the bot and web wallet boot flows share one definition.
 */
export const STARTER_TOKEN_GRANT: readonly string[] = Object.freeze([
  "+1", "+1", "+1", "+1",
  "+2", "+2", "+2", "+2",
  "+3", "+3", "+3", "+3",
  "-1", "-1", "-1", "-1",
  "-2", "-2", "-2", "-2",
  "-3", "-3", "-3", "-3",
  "*1", "*1",
]);

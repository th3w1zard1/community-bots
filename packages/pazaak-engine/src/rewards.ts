import { getCardsByRarity, type PazaakCardRarity } from "./rules.js";

/**
 * Tokens never granted by RNG drops (dailies, streak bonuses, crates, tournament rolls).
 * Tiebreaker (`TT`) is exclusively from the 10,000 career-win milestone.
 */
export const EXCLUDED_FROM_RANDOM_CARD_DROPS = new Set<string>(["TT"]);

/**
 * Pick a random side-deck token from every rulebook card of the given rarity tier.
 * Used for daily drops, streak bonuses, tournament podium grants, and crate rolls.
 */
export const pickRandomCardTokenByRarity = (
  rarity: PazaakCardRarity,
  rng: () => number = Math.random,
): string | undefined => {
  const pool = getCardsByRarity(rarity)
    .map((card) => card.token)
    .filter((token) => !EXCLUDED_FROM_RANDOM_CARD_DROPS.has(token));
  if (pool.length === 0) {
    return undefined;
  }

  const index = Math.floor(rng() * pool.length);
  return pool[index];
};

/** Win streak bonus: grant an Uncommon card every time streak hits a multiple of 3 (≥3). */
export const shouldGrantWinStreakCard = (streakAfterWin: number): boolean => {
  return streakAfterWin >= 3 && streakAfterWin % 3 === 0;
};

export const pickWinStreakBonusToken = (streakAfterWin: number, rng?: () => number): string | undefined => {
  if (!shouldGrantWinStreakCard(streakAfterWin)) {
    return undefined;
  }

  return pickRandomCardTokenByRarity("uncommon", rng);
};

export const pickDailyCommonDrop = (rng?: () => number): string | undefined => {
  return pickRandomCardTokenByRarity("common", rng);
};
export type { PazaakCardRarity };


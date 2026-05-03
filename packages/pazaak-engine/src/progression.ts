import { pickRandomCardTokenByRarity } from "./rewards.js";
import type { PazaakCardRarity } from "./rules.js";

/** Tiebreaker token — only granted via the 10,000-win milestone (never from crates / rarity rolls). */
export const TIEBREAKER_TOKEN = "TT";

export type CrateKind = "standard" | "premium";

export interface WinMilestoneRewards {
  readonly standardCrates: number;
  readonly premiumCrates: number;
  readonly grantTiebreaker: boolean;
  /** Optional bonus card from this rarity pool (TT excluded at source). */
  readonly bonusCardRarity?: PazaakCardRarity;
}

export interface LossMilestoneRewards {
  readonly standardCrates: number;
  readonly premiumCrates: number;
  readonly bonusCardRarity?: PazaakCardRarity;
}

/**
 * Loot for reaching win count `winTotal` (after the match). Every win grants at least one standard crate.
 * Premium crates and bonus cards scale so long-term play stays rewarding without flooding early profiles.
 */
export const rewardsForWinTotal = (winTotal: number): WinMilestoneRewards => {
  if (winTotal < 1 || !Number.isFinite(winTotal)) {
    return { standardCrates: 0, premiumCrates: 0, grantTiebreaker: false };
  }

  let standardCrates = 1;
  let premiumCrates = 0;
  let bonusCardRarity: PazaakCardRarity | undefined;

  if (winTotal % 5 === 0) {
    premiumCrates += 1;
  }

  if (winTotal % 25 === 0) {
    bonusCardRarity = "uncommon";
  }

  if (winTotal % 50 === 0) {
    standardCrates += 1;
  }

  if (winTotal % 100 === 0) {
    premiumCrates += 1;
    bonusCardRarity = "rare";
  }

  if (winTotal % 500 === 0) {
    premiumCrates += 2;
  }

  const grantTiebreaker = winTotal === 10_000;

  if (grantTiebreaker) {
    standardCrates += 2;
    premiumCrates += 5;
    bonusCardRarity = undefined;
  }

  return {
    standardCrates,
    premiumCrates,
    grantTiebreaker,
    ...(bonusCardRarity !== undefined ? { bonusCardRarity } : {}),
  };
};

/** Every loss grants a small consolation crate; periodic premiums keep losses from feeling hollow. */
export const rewardsForLossTotal = (lossTotal: number): LossMilestoneRewards => {
  if (lossTotal < 1 || !Number.isFinite(lossTotal)) {
    return { standardCrates: 0, premiumCrates: 0 };
  }

  let standardCrates = 1;
  let premiumCrates = 0;
  let bonusCardRarity: PazaakCardRarity | undefined;

  if (lossTotal % 5 === 0) {
    standardCrates += 1;
  }

  if (lossTotal % 15 === 0) {
    premiumCrates += 1;
  }

  if (lossTotal % 40 === 0) {
    bonusCardRarity = "common";
  }

  if (lossTotal % 75 === 0) {
    premiumCrates += 1;
    bonusCardRarity = "uncommon";
  }

  return {
    standardCrates,
    premiumCrates,
    ...(bonusCardRarity !== undefined ? { bonusCardRarity } : {}),
  };
};

export interface CrateRollResult {
  readonly tokens: string[];
  readonly bonusCredits: number;
}

/**
 * Server-side crate opening table. TT is intentionally unobtainable here — only the 10k win milestone grants it.
 */
export const rollCrateContents = (kind: CrateKind, rng: () => number = Math.random): CrateRollResult => {
  const tokens: string[] = [];
  let bonusCredits = 0;

  const rollCard = (rarity: PazaakCardRarity): void => {
    const token = pickRandomCardTokenByRarity(rarity, rng);
    if (token) {
      tokens.push(token);
    }
  };

  if (kind === "standard") {
    const roll = rng();
    if (roll < 0.55) {
      rollCard("common");
    } else if (roll < 0.88) {
      rollCard("uncommon");
    } else {
      rollCard("rare");
    }

    bonusCredits = 10 + Math.floor(rng() * 41);
    return { tokens, bonusCredits };
  }

  // premium
  const roll = rng();
  if (roll < 0.35) {
    rollCard("uncommon");
  } else if (roll < 0.82) {
    rollCard("rare");
  } else {
    rollCard("rare");
    if (rng() > 0.55) {
      rollCard("uncommon");
    }
  }

  bonusCredits = 35 + Math.floor(rng() * 76);
  return { tokens, bonusCredits };
};

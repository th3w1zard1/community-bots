import {
  pickRandomCardTokenByRarity,
  rewardsForLossTotal,
  rewardsForWinTotal,
  TIEBREAKER_TOKEN,
} from "@openkotor/pazaak-engine";
import type { WalletRecord } from "@openkotor/persistence";

export type MilestoneProgressDelta = {
  userId: string;
  displayName: string;
  addStandardCrates?: number;
  addPremiumCrates?: number;
  newProgressKeys?: string[];
  addTokens?: string[];
};

/**
 * Builds idempotent wallet deltas for the winner's newest win count and the loser's newest loss count.
 * Tiebreaker (`TT`) is only injected on the 10,000th career win, never from random rarity picks here.
 */
export const buildMatchMilestoneUpdates = (
  preWinner: WalletRecord,
  preLoser: WalletRecord,
  postWinner: WalletRecord,
  postLoser: WalletRecord,
): MilestoneProgressDelta[] => {
  const updates: MilestoneProgressDelta[] = [];

  const winKey = `win:${postWinner.wins}`;
  if (postWinner.wins > preWinner.wins && !preWinner.progressClaims.includes(winKey)) {
    const rw = rewardsForWinTotal(postWinner.wins);
    const tokens: string[] = [];
    if (rw.bonusCardRarity) {
      const rolled = pickRandomCardTokenByRarity(rw.bonusCardRarity);
      if (rolled) {
        tokens.push(rolled);
      }
    }

    const alreadyOwnsTiebreaker =
      preWinner.ownedSideDeckTokens.includes(TIEBREAKER_TOKEN) || postWinner.ownedSideDeckTokens.includes(TIEBREAKER_TOKEN);
    if (rw.grantTiebreaker && !alreadyOwnsTiebreaker) {
      tokens.push(TIEBREAKER_TOKEN);
    }

    updates.push({
      userId: postWinner.userId,
      displayName: postWinner.displayName,
      addStandardCrates: rw.standardCrates,
      addPremiumCrates: rw.premiumCrates,
      newProgressKeys: [winKey],
      addTokens: tokens,
    });
  }

  const lossKey = `loss:${postLoser.losses}`;
  if (postLoser.losses > preLoser.losses && !preLoser.progressClaims.includes(lossKey)) {
    const rl = rewardsForLossTotal(postLoser.losses);
    const tokens: string[] = [];
    if (rl.bonusCardRarity) {
      const rolled = pickRandomCardTokenByRarity(rl.bonusCardRarity);
      if (rolled) {
        tokens.push(rolled);
      }
    }

    updates.push({
      userId: postLoser.userId,
      displayName: postLoser.displayName,
      addStandardCrates: rl.standardCrates,
      addPremiumCrates: rl.premiumCrates,
      newProgressKeys: [lossKey],
      addTokens: tokens,
    });
  }

  return updates;
};

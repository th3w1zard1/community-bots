/**
 * PazaakWorld skill rating — expected-score updates with explicit rating deviation (RD).
 *
 * Chess.com documents the [Glicko](https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com)
 * family (rating + confidence / RD). Classical online implementations often apply Glicko in **rating periods**
 * (batches of games); this module uses an **Elo-style logistic** for the mean (MMR) with **K scaled by RD**
 * so a single ranked game produces sensible swings while still encoding “confidence” per player.
 */

export const PAZAAK_DEFAULT_MMR = 1000;
export const PAZAAK_DEFAULT_RD = 350;
export const PAZAAK_RD_MIN = 60;
export const PAZAAK_RD_MAX = 350;

export interface RatingSnapshot {
  mmr: number;
  rd: number;
}

export interface RatingUpdateResult extends RatingSnapshot {
  deltaMmr: number;
}

/** Expected score for `self` vs `opponent` (standard Elo logistic, divisor 400). */
export function expectedScore(selfMmr: number, opponentMmr: number): number {
  return 1 / (1 + Math.pow(10, (opponentMmr - selfMmr) / 400));
}

function clampRd(rd: number): number {
  return Math.max(PAZAAK_RD_MIN, Math.min(PAZAAK_RD_MAX, rd));
}

function coerceRd(rd: number | undefined): number {
  if (rd === undefined || !Number.isFinite(rd)) return PAZAAK_DEFAULT_RD;
  return clampRd(rd);
}

function coerceMmr(mmr: number | undefined): number {
  if (mmr === undefined || !Number.isFinite(mmr)) return PAZAAK_DEFAULT_MMR;
  return Math.max(0, mmr);
}

/**
 * Apply one ranked head-to-head result. `score` is 1 for a win, 0 for a loss (no draws in this path).
 */
export function updateRatingAfterGame(
  self: RatingSnapshot,
  opponent: RatingSnapshot,
  score: 0 | 1,
): RatingUpdateResult {
  const mmrSelf = coerceMmr(self.mmr);
  const rdSelf = coerceRd(self.rd);
  const mmrOpp = coerceMmr(opponent.mmr);
  const rdOpp = coerceRd(opponent.rd);

  const E = expectedScore(mmrSelf, mmrOpp);
  const kSelf = 16 + 24 * (rdSelf / PAZAAK_RD_MAX);
  const oppUncertaintyBoost = 1 + (rdOpp / PAZAAK_RD_MAX) * 0.2;
  const K = Math.min(44, kSelf * oppUncertaintyBoost);
  const deltaMmr = Math.round(K * (score - E));
  const mmr = Math.max(0, mmrSelf + deltaMmr);
  const rd = clampRd(rdSelf * 0.964 - 3);

  return { mmr, rd, deltaMmr };
}

/** Normalize stored wallet fields after load / migration. */
export function normalizeRatingDeviation(rd: number | undefined): number {
  return coerceRd(rd);
}

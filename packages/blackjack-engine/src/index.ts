/** Blackjack card value for counting: 2–10 face value, J/Q/K = 10, Ace = 11 (soft) or 1. */

export interface HandTotal {
  /** Best total ≤ 21 when possible */
  total: number;
  soft: boolean;
  bust: boolean;
}

const rankValue = (rank: number): number => {
  if (rank >= 11 && rank <= 13) return 10;
  if (rank === 1) return 11;
  return rank;
};

export function handTotal(ranks: readonly number[]): HandTotal {
  let sum = 0;
  let aces = 0;
  for (const r of ranks) {
    const v = rankValue(r);
    sum += v;
    if (r === 1) aces += 1;
  }
  let soft = aces > 0 && sum <= 21;
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces -= 1;
    soft = aces > 0 && sum <= 21;
  }
  return { total: sum, soft, bust: sum > 21 };
}

/** Fisher–Yates shuffle using rng in [0,1). */
export function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return arr;
}

/** Shoe as stack (pop = deal). Ranks 1–13 per suit, repeated `deckCount` times. */
export function buildShoe(deckCount: number, rng: () => number): number[] {
  const cards: number[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (let s = 0; s < 4; s++) {
      for (let r = 1; r <= 13; r++) cards.push(r);
    }
  }
  shuffleInPlace(cards, rng);
  return cards;
}

export interface DealerPlayOptions {
  dealerHitsSoft17: boolean;
}

/** Dealer draws until hard ≥ 17, or soft 18+ when !hitsSoft17; when hitsSoft17, draws on soft 17. */
export function dealerShouldHit(ranks: readonly number[], opts: DealerPlayOptions): boolean {
  const { total, soft } = handTotal(ranks);
  if (total > 21) return false;
  if (total < 17) return true;
  if (total === 17 && soft && opts.dealerHitsSoft17) return true;
  return false;
}

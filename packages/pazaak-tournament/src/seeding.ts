import type { TournamentParticipant } from "./types.js";

/**
 * MMR-descending seeding. Ties break on registration time (earlier first) so the
 * seeding is deterministic for snapshot tests.
 */
export const seedParticipantsByMmr = (
  participants: readonly TournamentParticipant[],
): TournamentParticipant[] => {
  const seeded = [...participants].sort((left, right) => {
    if (right.mmr !== left.mmr) {
      return right.mmr - left.mmr;
    }
    return left.registeredAt - right.registeredAt;
  });

  return seeded.map((entry, index) => ({
    ...entry,
    seed: index + 1,
  }));
};

/**
 * Build the round-1 pairing order for a single-elimination bracket using the
 * standard 1 vs N, 2 vs N-1... order with byes filling the back when the
 * participant count is not a power of two. Each pairing slot is a tuple
 * `[seedA, seedB]` where `null` represents a bye — the non-null seed auto-advances.
 *
 * Example for 6 participants (bracket size 8):
 *   round 1: [1 vs null, 4 vs 5, 3 vs 6, 2 vs null]
 */
export const generateBracketPairings = (
  seedCount: number,
): ReadonlyArray<readonly [number | null, number | null]> => {
  if (seedCount < 1) {
    return [];
  }

  const bracketSize = nextPowerOfTwo(seedCount);
  const pairings: Array<[number | null, number | null]> = [];
  // Standard bracket order from the top of the bracket downward: 1, 8, 4, 5, 2, 7, 3, 6 for 8 seeds.
  const order = buildSeedOrder(bracketSize);

  for (let i = 0; i < order.length; i += 2) {
    const a = order[i]!;
    const b = order[i + 1]!;
    const pairingA: number | null = a > seedCount ? null : a;
    const pairingB: number | null = b > seedCount ? null : b;
    pairings.push([pairingA, pairingB]);
  }

  return pairings;
};

/**
 * Builds the recursive seed order where the top half of each round plays the
 * bottom half in mirror — i.e. seed 1 plays the highest seed, seed 2 plays the
 * second-highest, etc. This is the same layout used by tennis and esports for
 * single-elim brackets.
 */
const buildSeedOrder = (size: number): number[] => {
  if (size <= 1) {
    return [1];
  }

  const previous = buildSeedOrder(size / 2);
  const result: number[] = [];

  for (const seed of previous) {
    result.push(seed, size + 1 - seed);
  }

  return result;
};

export const nextPowerOfTwo = (value: number): number => {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
};

import { randomUUID } from "node:crypto";

import { generateBracketPairings, nextPowerOfTwo } from "./seeding.js";
import type { TournamentMatchRecord, TournamentState } from "./types.js";

/**
 * Build a flat single-elimination match graph for the participants currently
 * registered on `state`. Participants must have been seeded (seed !== null) by
 * `seedParticipantsByMmr` before this helper is called.
 *
 * The graph is encoded as:
 *   - A flat `matches` array sorted by (round, index)
 *   - Each match records `winnerAdvancesToMatchId` pointing to the parent node
 */
export const generateSingleElimBracket = (state: TournamentState): TournamentMatchRecord[] => {
  const seeded = Object.values(state.participants)
    .filter((entry) => entry.seed !== null)
    .sort((left, right) => (left.seed ?? 0) - (right.seed ?? 0));

  if (seeded.length < 2) {
    return [];
  }

  const bySeed = new Map(seeded.map((entry) => [entry.seed, entry] as const));
  const pairings = generateBracketPairings(seeded.length);
  const bracketSize = nextPowerOfTwo(seeded.length);
  const totalRounds = Math.max(1, Math.log2(bracketSize));

  // Allocate match records for every round ahead of time so we can wire up parent ids.
  const matchesByRound: TournamentMatchRecord[][] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const slotsInRound = bracketSize / 2 ** round;
    const roundMatches: TournamentMatchRecord[] = [];
    for (let index = 0; index < slotsInRound; index += 1) {
      roundMatches.push({
        id: randomUUID(),
        round,
        index,
        bracket: "winners",
        state: "pending",
        participantAId: null,
        participantBId: null,
        winnerUserId: null,
        loserUserId: null,
        engineMatchId: null,
        scheduledAt: null,
        completedAt: null,
        winnerAdvancesToMatchId: null,
        loserAdvancesToMatchId: null,
      });
    }
    matchesByRound.push(roundMatches);
  }

  // Wire round-1 matches with real seeds (or auto-advance byes) and link each
  // match to its parent round slot.
  const round1 = matchesByRound[0] ?? [];

  for (let i = 0; i < pairings.length; i += 1) {
    const [seedA, seedB] = pairings[i] ?? [null, null];
    const match = round1[i];
    if (!match) continue;
    const participantA = seedA !== null ? bySeed.get(seedA) ?? null : null;
    const participantB = seedB !== null ? bySeed.get(seedB) ?? null : null;
    match.participantAId = participantA?.userId ?? null;
    match.participantBId = participantB?.userId ?? null;

    if (participantA && !participantB) {
      match.state = "bye";
      match.winnerUserId = participantA.userId;
      match.completedAt = Date.now();
    } else if (!participantA && participantB) {
      match.state = "bye";
      match.winnerUserId = participantB.userId;
      match.completedAt = Date.now();
    } else if (participantA && participantB) {
      match.state = "active";
    }
  }

  // Link every match to its next-round slot.
  for (let round = 1; round < totalRounds; round += 1) {
    const roundMatches = matchesByRound[round - 1] ?? [];
    const nextRoundMatches = matchesByRound[round] ?? [];

    for (let i = 0; i < roundMatches.length; i += 1) {
      const parent = nextRoundMatches[Math.floor(i / 2)];
      const match = roundMatches[i];
      if (match && parent) {
        match.winnerAdvancesToMatchId = parent.id;
      }
    }
  }

  const flat: TournamentMatchRecord[] = [];
  for (const round of matchesByRound) {
    flat.push(...round);
  }

  // Auto-advance bye winners into their parent slots so the first active round has opponents.
  const byId = new Map(flat.map((match) => [match.id, match] as const));
  for (const match of flat) {
    if (match.state === "bye" && match.winnerUserId && match.winnerAdvancesToMatchId) {
      const parent = byId.get(match.winnerAdvancesToMatchId);
      if (parent) {
        if (parent.participantAId === null) {
          parent.participantAId = match.winnerUserId;
        } else if (parent.participantBId === null) {
          parent.participantBId = match.winnerUserId;
        }
        if (parent.participantAId && parent.participantBId && parent.state === "pending") {
          parent.state = "active";
        }
      }
    }
  }

  return flat;
};

import { randomUUID } from "node:crypto";

import type { SwissStandingsRow, TournamentMatchRecord, TournamentState } from "./types.js";

/**
 * Compute Swiss standings for the current state. Tiebreakers in priority order:
 *   1. Match points (wins=3, draws=1, losses=0)
 *   2. Buchholz (sum of opponents' match points)
 *   3. Sonneborn-Berger (sum of defeated opponents' match points)
 *   4. Seed (lower seed wins)
 */
export const computeSwissStandings = (state: TournamentState): SwissStandingsRow[] => {
  const rows = new Map<string, SwissStandingsRow>();

  for (const participant of Object.values(state.participants)) {
    rows.set(participant.userId, {
      userId: participant.userId,
      displayName: participant.displayName,
      seed: participant.seed,
      wins: 0,
      losses: 0,
      draws: 0,
      buchholz: 0,
      sonnebornBerger: 0,
      opponentIds: [],
      matchPoints: 0,
    });
  }

  // Tally wins/losses/draws from reported matches.
  for (const match of state.matches) {
    if (match.state !== "reported" && match.state !== "bye") continue;

    const aRow = match.participantAId ? rows.get(match.participantAId) : undefined;
    const bRow = match.participantBId ? rows.get(match.participantBId) : undefined;

    if (match.state === "bye") {
      // A bye is a full-point match for the non-null participant.
      const lonerRow = aRow ?? bRow;
      if (lonerRow) {
        lonerRow.wins += 1;
        lonerRow.matchPoints += 3;
      }
      continue;
    }

    if (!aRow || !bRow) continue;

    if (match.winnerUserId === null) {
      aRow.draws += 1;
      bRow.draws += 1;
      aRow.matchPoints += 1;
      bRow.matchPoints += 1;
    } else if (match.winnerUserId === aRow.userId) {
      aRow.wins += 1;
      aRow.matchPoints += 3;
      bRow.losses += 1;
    } else {
      bRow.wins += 1;
      bRow.matchPoints += 3;
      aRow.losses += 1;
    }

    aRow.opponentIds.push(bRow.userId);
    bRow.opponentIds.push(aRow.userId);
  }

  // Compute Buchholz and Sonneborn-Berger now that every row's matchPoints is final.
  for (const row of rows.values()) {
    let buchholz = 0;
    let sonnebornBerger = 0;

    for (const opponentId of row.opponentIds) {
      const opponent = rows.get(opponentId);
      if (!opponent) continue;
      buchholz += opponent.matchPoints;
    }

    // Sonneborn-Berger only counts defeated opponents (and half-credits for draws).
    for (const match of state.matches) {
      if (match.state !== "reported") continue;
      if (match.winnerUserId === null && (match.participantAId === row.userId || match.participantBId === row.userId)) {
        const otherId = match.participantAId === row.userId ? match.participantBId : match.participantAId;
        const opponent = otherId ? rows.get(otherId) : undefined;
        if (opponent) {
          sonnebornBerger += opponent.matchPoints / 2;
        }
      } else if (match.winnerUserId === row.userId) {
        const otherId = match.participantAId === row.userId ? match.participantBId : match.participantAId;
        const opponent = otherId ? rows.get(otherId) : undefined;
        if (opponent) {
          sonnebornBerger += opponent.matchPoints;
        }
      }
    }

    row.buchholz = buchholz;
    row.sonnebornBerger = sonnebornBerger;
  }

  return [...rows.values()].sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
    return (a.seed ?? Number.POSITIVE_INFINITY) - (b.seed ?? Number.POSITIVE_INFINITY);
  });
};

/**
 * Generate pairings for the next Swiss round. Greedy pairing:
 *   1. Sort participants by match points (desc), then Buchholz (desc)
 *   2. For each unpaired participant, pair with the highest-ranked unpaired
 *      opponent they have not yet faced.
 *   3. If an odd participant is left, they receive a bye (full match point).
 *
 * Returns match records with state "active" for genuine pairings and "bye"
 * for auto-advances.
 */
export const generateSwissPairings = (state: TournamentState, round: number): TournamentMatchRecord[] => {
  const standings = computeSwissStandings(state);
  const unpaired = new Set(standings.map((row) => row.userId));
  const pairings: TournamentMatchRecord[] = [];
  let slotIndex = 0;

  for (const candidate of standings) {
    if (!unpaired.has(candidate.userId)) continue;

    // Find the highest-ranked opponent who is still unpaired and has not yet played candidate.
    const opponent = standings.find(
      (entry) => entry.userId !== candidate.userId
        && unpaired.has(entry.userId)
        && !candidate.opponentIds.includes(entry.userId),
    );

    if (opponent) {
      unpaired.delete(candidate.userId);
      unpaired.delete(opponent.userId);
      pairings.push({
        id: randomUUID(),
        round,
        index: slotIndex,
        state: "active",
        participantAId: candidate.userId,
        participantBId: opponent.userId,
        winnerUserId: null,
        loserUserId: null,
        engineMatchId: null,
        scheduledAt: null,
        completedAt: null,
        winnerAdvancesToMatchId: null,
        loserAdvancesToMatchId: null,
      });
      slotIndex += 1;
    }
  }

  // Remaining unpaired players receive byes (expected when participant count is odd).
  for (const loneUserId of unpaired) {
    pairings.push({
      id: randomUUID(),
      round,
      index: slotIndex,
      state: "bye",
      participantAId: loneUserId,
      participantBId: null,
      winnerUserId: loneUserId,
      loserUserId: null,
      engineMatchId: null,
      scheduledAt: null,
      completedAt: Date.now(),
      winnerAdvancesToMatchId: null,
      loserAdvancesToMatchId: null,
    });
    slotIndex += 1;
  }

  return pairings;
};

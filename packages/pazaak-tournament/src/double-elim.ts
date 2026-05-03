import { randomUUID } from "node:crypto";

import { generateSingleElimBracket } from "./single-elim.js";
import type { TournamentMatchRecord, TournamentState } from "./types.js";

/**
 * Generate the winners bracket (identical to single-elim) plus a mirror losers
 * bracket, grand final, and an optional grand final reset match.
 *
 * Losers bracket layout: participants drop here upon losing in the winners
 * bracket; a classic DE has `2 * (winners rounds) - 1` rounds. We wire the
 * losers-bracket links heuristically — the grand final joins the winners-final
 * winner against the losers-final winner; if the losers-final winner wins, a
 * "reset" match is played to require two wins.
 */
export const generateDoubleElimBracket = (state: TournamentState): TournamentMatchRecord[] => {
  const winners = generateSingleElimBracket(state).map((match) => ({ ...match, bracket: "winners" as const }));
  if (winners.length === 0) return [];

  const rounds = Math.max(...winners.map((match) => match.round));
  const losersRounds = Math.max(0, rounds * 2 - 1);

  const losers: TournamentMatchRecord[] = [];

  for (let round = 1; round <= losersRounds; round += 1) {
    // Each winners round contributes losers; slots roughly halve in the losers bracket
    // every two rounds (drop-in rounds alternate with internal rounds).
    const dropRoundIndex = Math.ceil(round / 2);
    const dropRound = Math.min(rounds - 1, dropRoundIndex);
    const winnersDropRoundSlots = winners.filter((match) => match.round === dropRound).length;
    // "drop-in" rounds (odd losers-round numbers) mirror the winners round; "internal"
    // rounds (even) halve the remaining losers bracket.
    const slotsInRound = round % 2 === 1
      ? Math.max(1, winnersDropRoundSlots)
      : Math.max(1, Math.ceil(winnersDropRoundSlots / 2));

    for (let i = 0; i < slotsInRound; i += 1) {
      losers.push({
        id: randomUUID(),
        round,
        index: i,
        bracket: "losers",
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
  }

  const grandFinal: TournamentMatchRecord = {
    id: randomUUID(),
    round: rounds + 1,
    index: 0,
    bracket: "grand_final",
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
  };

  const grandFinalReset: TournamentMatchRecord = {
    id: randomUUID(),
    round: rounds + 2,
    index: 0,
    bracket: "grand_final_reset",
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
  };

  // Wire winners → grand final
  const winnersFinal = winners.find((match) => match.round === rounds);
  if (winnersFinal) {
    winnersFinal.winnerAdvancesToMatchId = grandFinal.id;
    winnersFinal.loserAdvancesToMatchId = losers.at(-1)?.id ?? null;
  }

  // Wire grand-final outcome to the reset match
  grandFinal.winnerAdvancesToMatchId = null; // champion on losers-bracket player win only via reset
  grandFinal.loserAdvancesToMatchId = grandFinalReset.id;

  // Losers-final → grand final
  const losersFinal = losers.at(-1);
  if (losersFinal) {
    losersFinal.winnerAdvancesToMatchId = grandFinal.id;
  }

  // Chain losers rounds linearly (internal advancement).
  for (let i = 0; i < losers.length - 1; i += 1) {
    const current = losers[i]!;
    const next = losers[i + 1]!;
    current.winnerAdvancesToMatchId = next.id;
  }

  // Wire winners-bracket losers to drop-in losers-round slots. This is a best-effort
  // mapping — for exact DE seeding we would reshape per-round-pair, but for our UI
  // and Discord reporting the linear chain gives a coherent bracket topology.
  const losersByRound = new Map<number, TournamentMatchRecord[]>();
  for (const match of losers) {
    const bucket = losersByRound.get(match.round) ?? [];
    bucket.push(match);
    losersByRound.set(match.round, bucket);
  }

  for (const winnersMatch of winners) {
    if (winnersMatch.round === rounds) continue; // final already linked
    const dropRound = winnersMatch.round * 2 - 1;
    const slots = losersByRound.get(dropRound) ?? [];
    const target = slots[winnersMatch.index % Math.max(1, slots.length)];
    if (target) {
      winnersMatch.loserAdvancesToMatchId = target.id;
    }
  }

  return [...winners, ...losers, grandFinal, grandFinalReset];
};

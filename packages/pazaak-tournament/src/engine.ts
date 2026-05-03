import { randomUUID } from "node:crypto";

import { generateDoubleElimBracket } from "./double-elim.js";
import { seedParticipantsByMmr } from "./seeding.js";
import { generateSingleElimBracket } from "./single-elim.js";
import { computeSwissStandings, generateSwissPairings } from "./swiss.js";
import type {
  TournamentBracketColumn,
  TournamentBracketView,
  TournamentFormat,
  TournamentMatchRecord,
  TournamentParticipant,
  TournamentState,
} from "./types.js";

export interface CreateTournamentInput {
  name: string;
  organizerId: string;
  organizerName: string;
  format: TournamentFormat;
  setsPerMatch?: number;
  gameMode?: "canonical" | "wacky";
  rounds?: number;
  maxParticipants?: number | null;
  guildId?: string | null;
  channelId?: string | null;
  createdAt?: number;
}

export interface MatchReportInput {
  matchId: string;
  winnerUserId: string | null;   // null ⇒ draw (Swiss only)
  loserUserId?: string | null;
  completedAt?: number;
}

export interface AdvanceTournamentResult {
  state: TournamentState;
  /** Matches that just became "active" and need to be scheduled with PazaakCoordinator. */
  matchesToSchedule: TournamentMatchRecord[];
  /** New Swiss round created by this report, if any. */
  newSwissRound: number | null;
  /** True when the grand final (or last round) was just reported. */
  tournamentCompleted: boolean;
}

const DEFAULT_SETS_PER_MATCH = 3;
const DEFAULT_SWISS_ROUNDS = 5;

export const createTournament = (input: CreateTournamentInput): TournamentState => {
  const now = input.createdAt ?? Date.now();
  return {
    id: randomUUID(),
    name: input.name,
    guildId: input.guildId ?? null,
    channelId: input.channelId ?? null,
    organizerId: input.organizerId,
    organizerName: input.organizerName,
    format: input.format,
    setsPerMatch: input.setsPerMatch ?? DEFAULT_SETS_PER_MATCH,
    gameMode: input.gameMode ?? "canonical",
    rounds: input.rounds ?? DEFAULT_SWISS_ROUNDS,
    maxParticipants: input.maxParticipants ?? null,
    status: "registration",
    currentRound: 0,
    participants: {},
    matches: [],
    championUserId: null,
    createdAt: now,
    updatedAt: now,
  };
};

export interface RegisterParticipantInput {
  userId: string;
  displayName: string;
  mmr: number;
  registeredAt?: number;
}

export const registerParticipant = (
  state: TournamentState,
  input: RegisterParticipantInput,
): TournamentState => {
  if (state.status !== "registration") {
    throw new Error("This tournament is no longer accepting new participants.");
  }

  if (state.maxParticipants !== null && Object.keys(state.participants).length >= state.maxParticipants) {
    throw new Error("This tournament is full.");
  }

  if (state.participants[input.userId]) {
    throw new Error("You are already registered for this tournament.");
  }

  const entry: TournamentParticipant = {
    userId: input.userId,
    displayName: input.displayName,
    mmr: input.mmr,
    seed: null,
    status: "registered",
    registeredAt: input.registeredAt ?? Date.now(),
  };

  return {
    ...state,
    participants: { ...state.participants, [input.userId]: entry },
    updatedAt: Date.now(),
  };
};

export const withdrawParticipant = (state: TournamentState, userId: string): TournamentState => {
  if (!state.participants[userId]) {
    return state;
  }

  if (state.status === "registration") {
    const nextParticipants = { ...state.participants };
    delete nextParticipants[userId];
    return { ...state, participants: nextParticipants, updatedAt: Date.now() };
  }

  // After the event has started, we mark withdrawn instead of deleting.
  const existing = state.participants[userId]!;
  return {
    ...state,
    participants: {
      ...state.participants,
      [userId]: { ...existing, status: "withdrawn" },
    },
    updatedAt: Date.now(),
  };
};

export const startTournament = (state: TournamentState): TournamentState => {
  if (state.status !== "registration") {
    throw new Error("This tournament has already started.");
  }

  const allParticipants = Object.values(state.participants);
  if (allParticipants.length < 2) {
    throw new Error("At least 2 participants are required to start a tournament.");
  }

  const seeded = seedParticipantsByMmr(allParticipants);
  const seededRecord: Record<string, TournamentParticipant> = {};
  for (const entry of seeded) {
    seededRecord[entry.userId] = { ...entry, status: "active" };
  }

  const prepared: TournamentState = {
    ...state,
    participants: seededRecord,
    status: "active",
    currentRound: 1,
    updatedAt: Date.now(),
  };

  if (state.format === "single_elim") {
    const bracket = generateSingleElimBracket(prepared);
    return { ...prepared, matches: bracket };
  }

  if (state.format === "double_elim") {
    const bracket = generateDoubleElimBracket(prepared);
    return { ...prepared, matches: bracket };
  }

  // Swiss — generate round-1 pairings only; further rounds are created by advance.
  const pairings = generateSwissPairings(prepared, 1);
  return { ...prepared, matches: pairings };
};

/**
 * Report a match result and advance the tournament state. Pure function — returns a
 * fresh state. Callers should persist the returned `state` and schedule every match
 * in `matchesToSchedule`.
 */
export const advanceTournament = (
  state: TournamentState,
  report: MatchReportInput,
): AdvanceTournamentResult => {
  if (state.status !== "active") {
    throw new Error("This tournament is not active.");
  }

  const matchIndex = state.matches.findIndex((entry) => entry.id === report.matchId);
  if (matchIndex === -1) {
    throw new Error("Unknown match id.");
  }

  const match = state.matches[matchIndex]!;
  const winnerId = report.winnerUserId;
  const loserId = report.loserUserId
    ?? (winnerId === match.participantAId ? match.participantBId : match.participantAId);

  const now = report.completedAt ?? Date.now();

  if (winnerId !== null && winnerId !== match.participantAId && winnerId !== match.participantBId) {
    throw new Error("Winner must be one of the two match participants (or null for a Swiss draw).");
  }

  const reported: TournamentMatchRecord = {
    ...match,
    state: "reported",
    winnerUserId: winnerId,
    loserUserId: loserId ?? null,
    completedAt: now,
  };

  const nextMatches = [...state.matches];
  nextMatches[matchIndex] = reported;

  const nextParticipants = { ...state.participants };
  if (state.format !== "swiss" && loserId) {
    const existing = nextParticipants[loserId];
    if (existing) {
      nextParticipants[loserId] = { ...existing, status: "eliminated" };
    }
  }

  // Advance winner/loser into their linked match slots for SE/DE.
  if (state.format === "single_elim" || state.format === "double_elim") {
    if (winnerId && reported.winnerAdvancesToMatchId) {
      const parentIdx = nextMatches.findIndex((entry) => entry.id === reported.winnerAdvancesToMatchId);
      if (parentIdx !== -1) {
        nextMatches[parentIdx] = fillEmptySlot(nextMatches[parentIdx]!, winnerId);
      }
    }
    if (loserId && reported.loserAdvancesToMatchId) {
      const parentIdx = nextMatches.findIndex((entry) => entry.id === reported.loserAdvancesToMatchId);
      if (parentIdx !== -1) {
        nextMatches[parentIdx] = fillEmptySlot(nextMatches[parentIdx]!, loserId);
      }
    }
  }

  // Chain bye winners through their own parents so empty slots cascade forward.
  autoAdvanceByes(nextMatches);

  const matchesToSchedule = nextMatches.filter(
    (entry) => entry.state === "active" && entry.participantAId && entry.participantBId && entry.engineMatchId === null,
  );

  // Final-match detection differs by format.
  let championUserId: string | null = state.championUserId;
  let status: TournamentState["status"] = state.status;
  let currentRound = state.currentRound;
  let newSwissRound: number | null = null;

  if (state.format === "single_elim") {
    const final = nextMatches.find((entry) => entry.round === Math.max(...nextMatches.map((m) => m.round)));
    if (final?.state === "reported") {
      championUserId = final.winnerUserId;
      status = "completed";
    }
  } else if (state.format === "double_elim") {
    const resetMatch = nextMatches.find((entry) => entry.bracket === "grand_final_reset");
    const grandFinal = nextMatches.find((entry) => entry.bracket === "grand_final");
    if (grandFinal?.state === "reported") {
      const winnersBracketChampion = getWinnersBracketChampion(nextMatches);
      if (grandFinal.winnerUserId === winnersBracketChampion) {
        championUserId = grandFinal.winnerUserId;
        status = "completed";
      } else if (resetMatch?.state === "reported") {
        championUserId = resetMatch.winnerUserId;
        status = "completed";
      } else if (resetMatch && grandFinal.loserAdvancesToMatchId === resetMatch.id) {
        // Reset match now has both participants wired up.
        const idx = nextMatches.findIndex((entry) => entry.id === resetMatch.id);
        if (idx !== -1) {
          nextMatches[idx] = {
            ...nextMatches[idx]!,
            participantAId: grandFinal.winnerUserId,
            participantBId: grandFinal.loserUserId,
            state: "active",
          };
        }
      }
    }
  } else {
    // Swiss — once every match in the current round is reported, generate the next round.
    const roundMatches = nextMatches.filter((entry) => entry.round === currentRound);
    const allReported = roundMatches.every((entry) => entry.state === "reported" || entry.state === "bye");
    if (allReported) {
      if (currentRound >= state.rounds) {
        status = "completed";
        const standings = computeSwissStandings({ ...state, matches: nextMatches });
        championUserId = standings[0]?.userId ?? null;
      } else {
        currentRound += 1;
        newSwissRound = currentRound;
        const pairings = generateSwissPairings({ ...state, matches: nextMatches }, currentRound);
        nextMatches.push(...pairings);
      }
    }
  }

  const nextState: TournamentState = {
    ...state,
    matches: nextMatches,
    participants: nextParticipants,
    status,
    currentRound,
    championUserId,
    updatedAt: Date.now(),
  };

  if (status === "completed" && championUserId) {
    const champion = nextState.participants[championUserId];
    if (champion) {
      nextState.participants[championUserId] = { ...champion, status: "champion" };
    }
  }

  return {
    state: nextState,
    matchesToSchedule: nextMatches.filter((entry) =>
      entry.state === "active" && entry.participantAId && entry.participantBId && entry.engineMatchId === null,
    ),
    newSwissRound,
    tournamentCompleted: status === "completed",
  };
};

/**
 * Associate an engine match id with a tournament match once PazaakCoordinator has
 * scheduled the matchup. Returns the mutated state.
 */
export const attachEngineMatchId = (
  state: TournamentState,
  tournamentMatchId: string,
  engineMatchId: string,
): TournamentState => {
  const next = state.matches.map((entry) =>
    entry.id === tournamentMatchId ? { ...entry, engineMatchId, scheduledAt: Date.now() } : entry,
  );
  return { ...state, matches: next, updatedAt: Date.now() };
};

/** Build a renderable bracket view for the Activity. */
export const buildBracketView = (state: TournamentState): TournamentBracketView => {
  const columns: TournamentBracketColumn[] = [];
  const byRoundBracket = new Map<string, TournamentMatchRecord[]>();

  for (const match of state.matches) {
    const bracketKey = state.format === "swiss" ? "swiss" : (match.bracket ?? "winners");
    const key = `${bracketKey}:${match.round}`;
    const bucket = byRoundBracket.get(key) ?? [];
    bucket.push(match);
    byRoundBracket.set(key, bucket);
  }

  for (const [key, matches] of byRoundBracket.entries()) {
    const [bracketKey, roundString] = key.split(":");
    columns.push({
      round: Number(roundString),
      bracket: (bracketKey as TournamentBracketColumn["bracket"]) ?? "winners",
      matches: matches.sort((a, b) => a.index - b.index),
    });
  }

  columns.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    const order: Record<TournamentBracketColumn["bracket"], number> = {
      winners: 0,
      losers: 1,
      grand_final: 2,
      grand_final_reset: 3,
      swiss: 0,
    };
    return order[a.bracket] - order[b.bracket];
  });

  return { columns };
};

export { computeSwissStandings };

const fillEmptySlot = (match: TournamentMatchRecord, userId: string): TournamentMatchRecord => {
  if (match.participantAId === null) {
    const next = { ...match, participantAId: userId };
    if (next.participantAId && next.participantBId) {
      return { ...next, state: "active" };
    }
    return next;
  }
  if (match.participantBId === null) {
    const next = { ...match, participantBId: userId };
    if (next.participantAId && next.participantBId) {
      return { ...next, state: "active" };
    }
    return next;
  }
  return match;
};

const autoAdvanceByes = (matches: TournamentMatchRecord[]): void => {
  const byId = new Map(matches.map((entry) => [entry.id, entry] as const));

  for (const match of matches) {
    if (match.state === "bye" && match.winnerUserId && match.winnerAdvancesToMatchId) {
      const parent = byId.get(match.winnerAdvancesToMatchId);
      if (!parent) continue;
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
};

const getWinnersBracketChampion = (matches: readonly TournamentMatchRecord[]): string | null => {
  const winnersRounds = matches
    .filter((entry) => entry.bracket === "winners")
    .map((entry) => entry.round);
  if (winnersRounds.length === 0) return null;
  const finalRound = Math.max(...winnersRounds);
  const final = matches.find((entry) => entry.bracket === "winners" && entry.round === finalRound);
  return final?.winnerUserId ?? null;
};

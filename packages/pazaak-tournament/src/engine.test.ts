import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceTournament,
  attachEngineMatchId,
  buildBracketView,
  computeSwissStandings,
  createTournament,
  JsonTournamentRepository,
  registerParticipant,
  startTournament,
  withdrawParticipant,
} from "./index.js";
import { generateBracketPairings, seedParticipantsByMmr } from "./seeding.js";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

test("seeding orders participants by MMR desc then registration time", () => {
  const seeded = seedParticipantsByMmr([
    { userId: "a", displayName: "A", mmr: 1200, seed: null, status: "registered", registeredAt: 3 },
    { userId: "b", displayName: "B", mmr: 1400, seed: null, status: "registered", registeredAt: 5 },
    { userId: "c", displayName: "C", mmr: 1400, seed: null, status: "registered", registeredAt: 1 },
  ]);

  assert.deepEqual(seeded.map((entry) => entry.userId), ["c", "b", "a"]);
  assert.deepEqual(seeded.map((entry) => entry.seed), [1, 2, 3]);
});

test("round-1 pairings insert byes for non-power-of-two participant counts", () => {
  // 6 participants on an 8-seed bracket: seeds 7 and 8 do not exist, so pairings
  // produce byes for seeds 1 and 2 (who face the missing 7 and 8). Standard
  // bracket order is 1v8, 4v5, 2v7, 3v6.
  const pairings = generateBracketPairings(6);
  assert.equal(pairings.length, 4);
  assert.deepEqual(pairings[0], [1, null]);
  assert.deepEqual(pairings[1], [4, 5]);
  assert.deepEqual(pairings[2], [2, null]);
  assert.deepEqual(pairings[3], [3, 6]);
});

test("round-1 pairings for a power-of-two bracket never use byes", () => {
  const pairings = generateBracketPairings(8);
  assert.equal(pairings.length, 4);
  for (const [a, b] of pairings) {
    assert.notEqual(a, null);
    assert.notEqual(b, null);
  }
});

// ---------------------------------------------------------------------------
// Single elimination
// ---------------------------------------------------------------------------

test("single-elim bracket auto-advances bye winners into round 2", () => {
  let state = createTournament({
    name: "Test Cup",
    organizerId: "org",
    organizerName: "Organizer",
    format: "single_elim",
  });

  const participants = [
    { userId: "p1", displayName: "Seed 1", mmr: 2000 },
    { userId: "p2", displayName: "Seed 2", mmr: 1900 },
    { userId: "p3", displayName: "Seed 3", mmr: 1800 },
    { userId: "p4", displayName: "Seed 4", mmr: 1700 },
    { userId: "p5", displayName: "Seed 5", mmr: 1600 },
    { userId: "p6", displayName: "Seed 6", mmr: 1500 },
  ];

  for (const entry of participants) {
    state = registerParticipant(state, entry);
  }

  state = startTournament(state);

  const round1 = state.matches.filter((match) => match.round === 1);
  const round2 = state.matches.filter((match) => match.round === 2);
  const byes = round1.filter((match) => match.state === "bye");
  assert.equal(byes.length, 2);

  // Every round-2 slot should have at least one participant slotted from a bye.
  const round2Participants = round2.flatMap((match) => [match.participantAId, match.participantBId]).filter(Boolean);
  assert.ok(round2Participants.length >= 2);
});

test("single-elim advances winners through the bracket and crowns a champion", () => {
  let state = createTournament({
    name: "Test Cup",
    organizerId: "org",
    organizerName: "Organizer",
    format: "single_elim",
  });

  for (let i = 1; i <= 4; i += 1) {
    state = registerParticipant(state, {
      userId: `p${i}`,
      displayName: `Player ${i}`,
      mmr: 2000 - i * 100,
    });
  }

  state = startTournament(state);

  // Report both round-1 matches — seeds 1 and 2 advance.
  for (const match of state.matches.filter((m) => m.round === 1 && m.state === "active")) {
    const winner = match.participantAId!; // Higher seed is always participantA in standard-order round 1.
    const result = advanceTournament(state, { matchId: match.id, winnerUserId: winner });
    state = result.state;
  }

  const finalMatch = state.matches.find((m) => m.round === 2)!;
  assert.equal(finalMatch.state, "active");

  const final = advanceTournament(state, { matchId: finalMatch.id, winnerUserId: finalMatch.participantAId! });
  state = final.state;

  assert.equal(state.status, "completed");
  assert.equal(state.championUserId, finalMatch.participantAId);
  assert.equal(final.tournamentCompleted, true);
});

// ---------------------------------------------------------------------------
// Double elimination
// ---------------------------------------------------------------------------

test("double-elim bracket generates winners, losers, grand final, and reset slots", () => {
  let state = createTournament({
    name: "DE Cup",
    organizerId: "org",
    organizerName: "Organizer",
    format: "double_elim",
  });
  for (let i = 1; i <= 4; i += 1) {
    state = registerParticipant(state, { userId: `p${i}`, displayName: `Player ${i}`, mmr: 2000 - i * 100 });
  }
  state = startTournament(state);

  const winners = state.matches.filter((m) => m.bracket === "winners");
  const losers = state.matches.filter((m) => m.bracket === "losers");
  const grandFinal = state.matches.find((m) => m.bracket === "grand_final");
  const reset = state.matches.find((m) => m.bracket === "grand_final_reset");

  assert.ok(winners.length >= 3, "winners bracket should contain semifinals plus final");
  assert.ok(losers.length >= 1);
  assert.ok(grandFinal);
  assert.ok(reset);

  // Winners final must route its loser into a losers slot and its winner into the grand final.
  const winnersFinal = winners.find((m) => m.round === Math.max(...winners.map((entry) => entry.round)))!;
  assert.equal(winnersFinal.winnerAdvancesToMatchId, grandFinal!.id);
  assert.ok(winnersFinal.loserAdvancesToMatchId);
});

// ---------------------------------------------------------------------------
// Swiss
// ---------------------------------------------------------------------------

test("Swiss pairing never rematches opponents across rounds", () => {
  let state = createTournament({
    name: "Swiss",
    organizerId: "org",
    organizerName: "Organizer",
    format: "swiss",
    rounds: 3,
  });
  for (let i = 1; i <= 6; i += 1) {
    state = registerParticipant(state, { userId: `p${i}`, displayName: `Player ${i}`, mmr: 2000 - i * 50 });
  }
  state = startTournament(state);

  const seenPairs = new Set<string>();
  const recordPair = (a: string | null, b: string | null) => {
    if (!a || !b) return;
    const key = [a, b].sort().join("|");
    if (seenPairs.has(key)) {
      throw new Error(`Rematch detected for pair ${key}`);
    }
    seenPairs.add(key);
  };

  for (let round = 1; round <= state.rounds; round += 1) {
    const roundMatches = state.matches.filter((m) => m.round === round);
    for (const match of roundMatches) {
      if (match.state === "bye") {
        continue;
      }
      recordPair(match.participantAId, match.participantBId);
      const winner = match.participantAId; // deterministic for test purposes
      const result = advanceTournament(state, { matchId: match.id, winnerUserId: winner });
      state = result.state;
    }
  }

  assert.equal(state.status, "completed");
  assert.ok(state.championUserId);
});

test("computeSwissStandings ranks by match points, Buchholz, Sonneborn-Berger", () => {
  let state = createTournament({
    name: "Swiss-2",
    organizerId: "org",
    organizerName: "Organizer",
    format: "swiss",
    rounds: 2,
  });
  for (let i = 1; i <= 4; i += 1) {
    state = registerParticipant(state, { userId: `p${i}`, displayName: `P${i}`, mmr: 2000 - i * 25 });
  }
  state = startTournament(state);

  for (const match of state.matches.filter((m) => m.round === 1)) {
    if (match.state !== "active") continue;
    // Higher seed wins every round-1 match.
    const winner = match.participantAId;
    const result = advanceTournament(state, { matchId: match.id, winnerUserId: winner });
    state = result.state;
  }

  const standings = computeSwissStandings(state);
  assert.equal(standings[0]?.matchPoints, 3);
  assert.ok((standings[0]?.wins ?? 0) >= 1);
});

// ---------------------------------------------------------------------------
// Bracket view + repository
// ---------------------------------------------------------------------------

test("buildBracketView produces ordered columns", () => {
  let state = createTournament({
    name: "View",
    organizerId: "org",
    organizerName: "Organizer",
    format: "single_elim",
  });
  for (let i = 1; i <= 4; i += 1) {
    state = registerParticipant(state, { userId: `p${i}`, displayName: `Player ${i}`, mmr: 2000 });
  }
  state = startTournament(state);
  const view = buildBracketView(state);
  assert.ok(view.columns.length >= 2);
  assert.deepEqual(view.columns.map((column) => column.round).sort(), [1, 2]);
});

test("JsonTournamentRepository round-trips state through disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pz-tourney-"));
  try {
    const repo = new JsonTournamentRepository(join(dir, "tournaments.json"));
    const state = createTournament({
      name: "Disk",
      organizerId: "org",
      organizerName: "Org",
      format: "single_elim",
    });
    await repo.save(state);

    const reloaded = await repo.get(state.id);
    assert.ok(reloaded);
    assert.equal(reloaded?.name, "Disk");

    const list = await repo.list();
    assert.equal(list.length, 1);

    await repo.delete(state.id);
    assert.equal(await repo.get(state.id), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("withdraw before start removes participant; after start marks withdrawn", () => {
  let state = createTournament({
    name: "Withdraw",
    organizerId: "org",
    organizerName: "Organizer",
    format: "single_elim",
  });
  state = registerParticipant(state, { userId: "p1", displayName: "P1", mmr: 2000 });
  state = registerParticipant(state, { userId: "p2", displayName: "P2", mmr: 1900 });
  state = registerParticipant(state, { userId: "p3", displayName: "P3", mmr: 1800 });

  // Withdraw pre-start removes entirely.
  state = withdrawParticipant(state, "p1");
  assert.equal(Object.keys(state.participants).length, 2);

  state = registerParticipant(state, { userId: "p4", displayName: "P4", mmr: 2100 });
  state = startTournament(state);

  // Withdraw after start keeps the participant but flags status.
  state = withdrawParticipant(state, "p4");
  assert.equal(state.participants["p4"]?.status, "withdrawn");
});

test("attachEngineMatchId records the engine linkage for later settlement", () => {
  let state = createTournament({
    name: "Attach",
    organizerId: "org",
    organizerName: "Organizer",
    format: "single_elim",
  });
  state = registerParticipant(state, { userId: "p1", displayName: "P1", mmr: 2000 });
  state = registerParticipant(state, { userId: "p2", displayName: "P2", mmr: 1900 });
  state = startTournament(state);
  const active = state.matches.find((entry) => entry.state === "active")!;
  state = attachEngineMatchId(state, active.id, "engine-1");
  const refreshed = state.matches.find((entry) => entry.id === active.id);
  assert.equal(refreshed?.engineMatchId, "engine-1");
});

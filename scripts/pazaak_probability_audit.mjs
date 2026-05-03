#!/usr/bin/env node
/**
 * Pazaak probability audit — prints the authoritative bust-probability table and
 * Monte-Carlo-derived card tier scores. Ships the data the engine rulebook /
 * Activity rule book / Discord embed all pull from so we have one reproducible
 * way to regenerate the table whenever engine math changes.
 *
 * Usage:
 *   node scripts/pazaak_probability_audit.mjs               # quick run (2_000 sims per card)
 *   node scripts/pazaak_probability_audit.mjs --sims 20000  # deep audit
 *   node scripts/pazaak_probability_audit.mjs --json        # machine-readable output
 */

import { argv, exit } from "node:process";

import {
  BUST_PROBABILITY_TABLE,
  PAZAAK_RULEBOOK,
  PazaakCoordinator,
  getBustProbability,
} from "../packages/pazaak-engine/dist/index.js";

const args = new Map();
for (let i = 2; i < argv.length; i += 1) {
  const key = argv[i];
  if (!key) continue;
  if (key.startsWith("--")) {
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key.slice(2), next);
      i += 1;
    } else {
      args.set(key.slice(2), "true");
    }
  }
}

const SIMS = Math.max(100, Number(args.get("sims") ?? 2000));
const OUTPUT_JSON = args.get("json") === "true";

const log = (...parts) => {
  if (!OUTPUT_JSON) console.log(...parts);
};

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

function printBustTable() {
  log("Bust probability (uniform 40-card shoe)");
  log("=======================================");
  for (let total = 0; total <= 20; total += 1) {
    const fromTable = BUST_PROBABILITY_TABLE[total];
    const fromHelper = getBustProbability(total);
    const indicator = Math.abs(fromTable - fromHelper) < 1e-9 ? " " : "!";
    log(`  total=${String(total).padStart(2, " ")}  bust=${formatPercent(fromTable)}  helper=${formatPercent(fromHelper)} ${indicator}`);
  }
  log("");
}

function uniqueTokensInMode(mode) {
  return PAZAAK_RULEBOOK.cards
    .filter((card) => mode === "wacky" || card.gameMode === "canonical")
    .map((card) => card.token);
}

const FILLER_TOKENS = ["+1", "+2", "-1", "-2", "+3", "-3", "*1", "*2", "+4"];

/**
 * Build a 10-card Pazaak sideboard-token array for Monte-Carlo sampling of a
 * single card. A copy of the focus token plus cheap filler gives every token
 * a comparable baseline instead of competing with itself.
 */
function buildFillerDeckTokens(focusToken) {
  return [focusToken, ...FILLER_TOKENS.slice(0, 9)];
}

/**
 * Monte-Carlo a token's influence by repeatedly simulating short matches where an
 * AI player owns the filler deck and plays through the advisor. We record how
 * often a token is played and whether its set eventually wins or loses. The
 * tier score is 50 + 50 * (win rate - loss rate), clamped to 0..100.
 */
async function monteCarloTier(token, sims) {
  const coordinator = new PazaakCoordinator();
  let setsWithToken = 0;
  let setsWonWithToken = 0;

  for (let i = 0; i < sims; i += 1) {
    const focusTokens = buildFillerDeckTokens(token);
    const opponentTokens = buildFillerDeckTokens("*2");
    const matchId = `mc-${token.replace(/[^a-z0-9]/gi, "_")}-${i}`;

    const match = coordinator.createDirectMatch({
      channelId: matchId,
      challengerId: `${matchId}-p1`,
      challengerName: `Focus-${token}`,
      opponentId: `${matchId}-p2`,
      opponentName: "Filler",
      challengerDeck: { tokens: focusTokens, gameMode: "wacky", enforceTokenLimits: false },
      opponentDeck: { tokens: opponentTokens, gameMode: "wacky", enforceTokenLimits: false },
      gameMode: "wacky",
      opponentAiDifficulty: "hard",
    });

    // Fast-forward by repeatedly running AI moves for both players.
    let safety = 0;
    while (match.phase !== "completed" && safety < 400) {
      safety += 1;
      const active = match.players[match.activePlayerIndex];
      try {
        if (match.phase === "turn") {
          coordinator.draw(match.id, active.userId);
        } else {
          coordinator.executeAiMove(match.id, active.userId, match.activePlayerIndex === 0 ? "professional" : "hard");
        }
      } catch {
        // Fall back to ending the turn if the advisor cannot decide.
        try {
          coordinator.endTurn(match.id, active.userId);
        } catch {
          break;
        }
      }
    }

    const focus = match.players[0];
    const playedThisMatch = focus.sideCardsPlayed.some((entry) => entry.label === token);

    if (playedThisMatch) {
      setsWithToken += 1;
      if (match.winnerId === focus.userId) {
        setsWonWithToken += 1;
      }
    }

    if (match.phase !== "completed") {
      // Force resolve — prevents looping simulations from hanging the audit.
      try {
        coordinator.forfeit(match.id, match.players[1].userId);
      } catch {
        // Already over.
      }
    }
  }

  const participation = setsWithToken / sims;
  const winRate = setsWithToken === 0 ? 0.5 : setsWonWithToken / setsWithToken;
  const tier = Math.round(Math.max(0, Math.min(100, 50 + 80 * (winRate - 0.5))));

  return { token, participation, winRate, tier };
}

async function runAudit() {
  const tokens = uniqueTokensInMode("wacky");
  const tiers = [];

  if (!OUTPUT_JSON) {
    log(`Monte-Carlo card tier scores  (sims=${SIMS})`);
    log("===========================================");
  }

  for (const token of tokens) {
    try {
      const row = await monteCarloTier(token, SIMS);
      tiers.push(row);
      log(
        `  ${String(token).padEnd(4, " ")}  tier=${String(row.tier).padStart(3, " ")}  winrate=${formatPercent(row.winRate)}  played=${formatPercent(row.participation)}`,
      );
    } catch (err) {
      log(`  ${String(token).padEnd(4, " ")}  FAILED ${err instanceof Error ? err.message : err}`);
    }
  }

  if (OUTPUT_JSON) {
    console.log(JSON.stringify({
      sims: SIMS,
      bustTable: BUST_PROBABILITY_TABLE,
      tiers,
      rulebook: PAZAAK_RULEBOOK.cards.map((card) => ({
        token: card.token,
        rulebookTier: card.tierScore,
        rarity: card.rarity,
        mode: card.gameMode,
      })),
    }, null, 2));
  }
}

printBustTable();
runAudit().catch((err) => {
  console.error("[audit] failed:", err);
  exit(1);
});

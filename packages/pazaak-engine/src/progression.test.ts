import test from "node:test";
import assert from "node:assert/strict";

import { rollCrateContents, rewardsForLossTotal, rewardsForWinTotal, TIEBREAKER_TOKEN } from "./progression.js";
import { pickRandomCardTokenByRarity } from "./rewards.js";

test("rewardsForWinTotal grants tiebreaker flag only at 10,000 wins", () => {
  assert.equal(rewardsForWinTotal(9999).grantTiebreaker, false);
  assert.equal(rewardsForWinTotal(10_000).grantTiebreaker, true);
  assert.equal(rewardsForWinTotal(10_001).grantTiebreaker, false);
});

test("rewardsForWinTotal every win gives at least one standard crate", () => {
  for (const w of [1, 2, 7, 99, 100, 10_000]) {
    assert.ok(rewardsForWinTotal(w).standardCrates >= 1, `win ${w}`);
  }
});

test("rewardsForLossTotal every loss gives at least one standard crate", () => {
  for (const l of [1, 2, 14, 75]) {
    assert.ok(rewardsForLossTotal(l).standardCrates >= 1, `loss ${l}`);
  }
});

test("rollCrateContents never returns tiebreaker token", () => {
  for (let i = 0; i < 80; i += 1) {
    const rng = mulberry32(i + 1);
    for (const kind of ["standard", "premium"] as const) {
      const result = rollCrateContents(kind, rng);
      assert.ok(!result.tokens.includes(TIEBREAKER_TOKEN), `${kind} roll ${i}`);
    }
  }
});

test("pickRandomCardTokenByRarity never returns TT for rare tier", () => {
  for (let i = 0; i < 200; i += 1) {
    const token = pickRandomCardTokenByRarity("rare", mulberry32(i + 99));
    if (token) {
      assert.notEqual(token, TIEBREAKER_TOKEN);
    }
  }
});

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

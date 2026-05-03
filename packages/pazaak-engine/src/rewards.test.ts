import test from "node:test";
import assert from "node:assert/strict";

import {
  pickDailyCommonDrop,
  pickRandomCardTokenByRarity,
  pickWinStreakBonusToken,
  shouldGrantWinStreakCard,
} from "./rewards.js";

test("shouldGrantWinStreakCard is false below 3 and true every multiple of 3 from 3 onward", () => {
  assert.equal(shouldGrantWinStreakCard(0), false);
  assert.equal(shouldGrantWinStreakCard(2), false);
  assert.equal(shouldGrantWinStreakCard(3), true);
  assert.equal(shouldGrantWinStreakCard(4), false);
  assert.equal(shouldGrantWinStreakCard(6), true);
  assert.equal(shouldGrantWinStreakCard(9), true);
});

test("pickWinStreakBonusToken returns undefined when streak gate fails", () => {
  assert.equal(pickWinStreakBonusToken(2), undefined);
});

test("pickWinStreakBonusToken returns an uncommon rulebook token when streak hits gate", () => {
  const token = pickWinStreakBonusToken(6, () => 0.5);
  assert.ok(typeof token === "string" && token.length > 0);
});

test("pickDailyCommonDrop returns a common-tier token", () => {
  const token = pickDailyCommonDrop(() => 0);
  assert.ok(typeof token === "string" && token.length > 0);
});

test("pickRandomCardTokenByRarity is deterministic with fixed rng", () => {
  const first = pickRandomCardTokenByRarity("starter", () => 0);
  const second = pickRandomCardTokenByRarity("starter", () => 0);
  assert.equal(first, second);
});

test("pickRandomCardTokenByRarity returns a wacky_only token", () => {
  const token = pickRandomCardTokenByRarity("wacky_only", () => 0);
  assert.ok(token && ["%3", "%4", "%5", "%6", "/2", "00"].includes(token));
});

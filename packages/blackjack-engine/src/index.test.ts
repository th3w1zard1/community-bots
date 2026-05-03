import test from "node:test";
import assert from "node:assert/strict";

import { dealerShouldHit, handTotal } from "./index.js";

test("handTotal respects soft ace", () => {
  const h = handTotal([1, 9]);
  assert.equal(h.total, 20);
  assert.equal(h.soft, true);
});

test("dealer stands on hard 17", () => {
  assert.equal(dealerShouldHit([10, 7], { dealerHitsSoft17: false }), false);
});

test("dealer hits soft 17 when configured", () => {
  assert.equal(dealerShouldHit([1, 6], { dealerHitsSoft17: true }), true);
});

import test from "node:test";
import assert from "node:assert/strict";

import { cosineSimilarity } from "./proactive-llm.js";

test("cosineSimilarity returns 1 for identical vectors", () => {
  const v = [1, 0, 0];
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
});

test("cosineSimilarity returns 0 for orthogonal vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

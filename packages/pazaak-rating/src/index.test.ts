import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expectedScore, updateRatingAfterGame, PAZAAK_DEFAULT_RD } from "./index.js";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    assert.equal(expectedScore(1000, 1000), 0.5);
  });

  it("favors the higher-rated player", () => {
    assert.ok(expectedScore(1200, 1000) > 0.5);
    assert.ok(expectedScore(1000, 1200) < 0.5);
  });
});

describe("updateRatingAfterGame", () => {
  it("awards more points for upset wins", () => {
    const fav = updateRatingAfterGame({ mmr: 1200, rd: 120 }, { mmr: 1000, rd: 120 }, 1);
    const upset = updateRatingAfterGame({ mmr: 1000, rd: 120 }, { mmr: 1200, rd: 120 }, 1);
    assert.ok(upset.deltaMmr > fav.deltaMmr);
  });

  it("is roughly symmetric for equal RD at equal MMR", () => {
    const snap = { mmr: 1000, rd: PAZAAK_DEFAULT_RD };
    const w = updateRatingAfterGame(snap, snap, 1);
    const l = updateRatingAfterGame(snap, snap, 0);
    assert.equal(w.deltaMmr, -l.deltaMmr);
  });

  it("reduces RD after a game", () => {
    const before = PAZAAK_DEFAULT_RD;
    const out = updateRatingAfterGame({ mmr: 1000, rd: before }, { mmr: 1000, rd: before }, 1);
    assert.ok(out.rd < before);
  });
});

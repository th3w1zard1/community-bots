import assert from "node:assert/strict";
import test from "node:test";

import { pickReactionErrorLine, pickReactionNoopLine, pickReactionSuccessLine } from "./reaction-role-replies.js";

const hints = { displayName: "Revanchist", emojiLabel: ":pazaak:" };

test("pickReactionSuccessLine references user and emoji choice", () => {
  const orig = Math.random;
  Math.random = () => 0;

  try {
    const line = pickReactionSuccessLine("add", "Taris Tourist", undefined, hints);
    assert.match(line, /Revanchist/);
    assert.match(line, /:pazaak:/);
    assert.match(line, /Taris Tourist/);
  } finally {
    Math.random = orig;
  }
});

test("pickReactionErrorLine blocked mentions hierarchy", () => {
  const orig = Math.random;
  Math.random = () => 0;

  try {
    const line = pickReactionErrorLine("blocked", "Sith Acolyte", hints);
    assert.match(line, /Revanchist/);
    assert.match(line, /:pazaak:/);
    assert.match(line, /Sith Acolyte|hierarchy|order/i);
  } finally {
    Math.random = orig;
  }
});

test("pickReactionNoopLine add path", () => {
  const orig = Math.random;
  Math.random = () => 0;

  try {
    const line = pickReactionNoopLine("add", "Already There", hints);
    assert.match(line, /Revanchist/);
    assert.match(line, /Already There/);
  } finally {
    Math.random = orig;
  }
});

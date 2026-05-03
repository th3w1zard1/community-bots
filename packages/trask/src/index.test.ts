import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { JsonTraskQueryRepository, type TraskQueryRecord } from "@openkotor/persistence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRecord = (overrides: Partial<TraskQueryRecord> = {}): TraskQueryRecord => ({
  queryId: overrides.queryId ?? `q-${Math.random().toString(36).slice(2, 10)}`,
  userId: overrides.userId ?? "user-1",
  query: overrides.query ?? "What are Force Powers in KOTOR?",
  status: overrides.status ?? "complete",
  answer: "answer" in overrides ? overrides.answer! : "Force Powers are special abilities.",
  sources: overrides.sources ?? [{ id: "src-1", name: "Deadly Stream", url: "https://deadlystream.com" }],
  error: "error" in overrides ? overrides.error! : null,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  completedAt: "completedAt" in overrides ? overrides.completedAt! : new Date().toISOString(),
});

let tmpDir: string;

test.before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "trask-test-"));
});

test.after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// JsonTraskQueryRepository — append & read-back
// ---------------------------------------------------------------------------

test("append stores a record and listForUser returns it", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-1.json"));
  const record = makeRecord({ userId: "user-a", query: "How do lightsabers work?" });

  const saved = await repo.append(record);
  assert.equal(saved.queryId, record.queryId);
  assert.equal(saved.query, record.query);

  const list = await repo.listForUser("user-a");
  assert.equal(list.length, 1);
  assert.equal(list[0]!.queryId, record.queryId);
});

test("listForUser only returns records for the requested user", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-2.json"));
  const recordA = makeRecord({ userId: "user-x" });
  const recordB = makeRecord({ userId: "user-y" });

  await repo.append(recordA);
  await repo.append(recordB);

  const listX = await repo.listForUser("user-x");
  const listY = await repo.listForUser("user-y");

  assert.equal(listX.length, 1);
  assert.equal(listX[0]!.userId, "user-x");
  assert.equal(listY.length, 1);
  assert.equal(listY[0]!.userId, "user-y");
});

test("listForUser returns an empty array for an unknown user", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-3.json"));
  const list = await repo.listForUser("nobody");
  assert.deepEqual(list, []);
});

test("listForUser respects the limit parameter", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-4.json"));

  for (let i = 0; i < 10; i += 1) {
    await repo.append(makeRecord({ userId: "user-limit", queryId: `q-limit-${i}` }));
  }

  const all = await repo.listForUser("user-limit");
  const limited = await repo.listForUser("user-limit", 3);

  assert.equal(all.length, 10);
  assert.equal(limited.length, 3);
});

test("append returns a defensive copy — mutating the result does not affect stored records", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-5.json"));
  const original = makeRecord({ userId: "user-copy" });
  const saved = await repo.append(original);

  // Mutate the returned object.
  (saved as TraskQueryRecord).query = "MUTATED";
  (saved.sources as Array<{ id: string; name: string; url: string }>).push({ id: "x", name: "x", url: "x" });

  const list = await repo.listForUser("user-copy");
  assert.equal(list[0]!.query, original.query, "stored query must not be mutated via returned reference");
  assert.equal(list[0]!.sources.length, original.sources.length, "stored sources must not be mutated via returned reference");
});

test("failed record persists with status=failed and error message", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-6.json"));
  const failed = makeRecord({
    userId: "user-fail",
    status: "failed",
    answer: null,
    error: "ResearchWizard returned 503",
    completedAt: null,
  });

  await repo.append(failed);
  const list = await repo.listForUser("user-fail");

  assert.equal(list.length, 1);
  assert.equal(list[0]!.status, "failed");
  assert.equal(list[0]!.error, "ResearchWizard returned 503");
  assert.equal(list[0]!.answer, null);
  assert.equal(list[0]!.completedAt, null);
});

test("pending record persists with status=pending", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-7.json"));
  const pending = makeRecord({
    userId: "user-pending",
    status: "pending",
    answer: null,
    completedAt: null,
  });

  await repo.append(pending);
  const [result] = await repo.listForUser("user-pending");
  assert.equal(result!.status, "pending");
  assert.equal(result!.answer, null);
});

test("multiple appends for same user accumulate records", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-8.json"));
  const user = "user-multi";

  for (let i = 0; i < 5; i += 1) {
    await repo.append(makeRecord({ userId: user, queryId: `q-multi-${i}` }));
  }

  const list = await repo.listForUser(user);
  assert.equal(list.length, 5);
  // All queryIds should be distinct.
  const ids = new Set(list.map((r) => r.queryId));
  assert.equal(ids.size, 5);
});

test("source citations are stored and retrieved accurately", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-9.json"));
  const sources = [
    { id: "src-a", name: "Deadly Stream", url: "https://deadlystream.com" },
    { id: "src-b", name: "PyKotor", url: "https://github.com/NickHugi/PyKotor" },
  ];
  const record = makeRecord({ userId: "user-src", sources });

  await repo.append(record);
  const [result] = await repo.listForUser("user-src");

  assert.equal(result!.sources.length, 2);
  assert.deepEqual(result!.sources[0], sources[0]);
  assert.deepEqual(result!.sources[1], sources[1]);
});

// ---------------------------------------------------------------------------
// DTO shape contract — ensure the persisted record satisfies
// the shape consumed by the API and the web client.
// ---------------------------------------------------------------------------

test("TraskQueryRecord shape covers all required fields", async () => {
  const repo = new JsonTraskQueryRepository(path.join(tmpDir, "queries-shape.json"));
  const record = makeRecord({ userId: "user-shape" });
  await repo.append(record);

  const [result] = await repo.listForUser("user-shape");

  // Required by api-server.ts mapTraskQueryRecord() and the web DTO.
  assert.equal(typeof result!.queryId, "string");
  assert.equal(typeof result!.userId, "string");
  assert.equal(typeof result!.query, "string");
  assert.ok(["pending", "complete", "failed"].includes(result!.status));
  assert.ok(result!.answer === null || typeof result!.answer === "string");
  assert.ok(Array.isArray(result!.sources));
  assert.ok(result!.error === null || typeof result!.error === "string");
  assert.equal(typeof result!.createdAt, "string");
  assert.ok(result!.completedAt === null || typeof result!.completedAt === "string");
});

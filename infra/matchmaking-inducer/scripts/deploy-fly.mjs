#!/usr/bin/env node
/**
 * Non-interactive Fly deploy for this directory (mirrors CI job).
 * Requires: flyctl on PATH, FLY_API_TOKEN, MATCHMAKING_UPSTREAM_URL or PAZAAK_WORKER_URL.
 *
 * Usage:
 *   cd infra/matchmaking-inducer
 *   set FLY_API_TOKEN=...
 *   set PAZAAK_WORKER_URL=https://xxx.workers.dev
 *   node scripts/deploy-fly.mjs
 *
 * First-time app:
 *   node scripts/deploy-fly.mjs --create-app
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function parseFlyTomlApp() {
  const p = resolve(ROOT, "fly.toml");
  const text = readFileSync(p, "utf8");
  const m = text.match(/^\s*app\s*=\s*"([^"]+)"/m);
  return m?.[1] ?? null;
}

function flyctl(args) {
  const r = spawnSync("flyctl", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const createApp = process.argv.includes("--create-app");
  const token = process.env.FLY_API_TOKEN?.trim();
  if (!token) {
    console.error("FLY_API_TOKEN is required. Create a deploy token after login:");
    console.error("  flyctl auth login");
    console.error("  flyctl tokens create deploy -x 87600h");
    process.exit(1);
  }

  const upstream =
    process.env.MATCHMAKING_UPSTREAM_URL?.trim() ||
    process.env.PAZAAK_WORKER_URL?.trim();
  if (!upstream) {
    console.error("Set MATCHMAKING_UPSTREAM_URL or PAZAAK_WORKER_URL to your Worker origin.");
    process.exit(1);
  }

  const app =
    process.env.FLY_APP?.trim() ||
    process.env.FLY_INDUCER_APP_NAME?.trim() ||
    parseFlyTomlApp();
  if (!app) {
    console.error("Could not resolve app name (fly.toml app = … or FLY_APP).");
    process.exit(1);
  }

  process.env.FLY_API_TOKEN = token;

  if (createApp) {
    const r = spawnSync("flyctl", ["apps", "create", app, "-y"], {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
    });
    const combined = `${r.stdout || ""}${r.stderr || ""}`;
    if (r.status !== 0 && !/already been taken|already exists/i.test(combined)) {
      console.error(combined || `flyctl apps create failed (${r.status})`);
      process.exit(r.status ?? 1);
    }
  }

  flyctl(["secrets", "set", `MATCHMAKING_UPSTREAM_URL=${upstream}`, "--app", app]);
  flyctl(["deploy", "--remote-only", "--app", app]);
  console.log(`Deployed ${app}. Try: https://${app}.fly.dev/inducer/health`);
}

main();

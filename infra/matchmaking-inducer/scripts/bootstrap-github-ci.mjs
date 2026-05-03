#!/usr/bin/env node
/**
 * Push CI configuration to GitHub (secrets + variables) for deploy-matchmaking-inducer.yml.
 * Requires: gh CLI authenticated (`gh auth login`), repo admin for secrets.
 *
 * Usage:
 *   cd infra/matchmaking-inducer
 *   cp matchmaking-ci.env.template matchmaking-ci.env
 *   # edit matchmaking-ci.env
 *   node scripts/bootstrap-github-ci.mjs
 *
 * Options:
 *   --dry-run    Print gh commands without executing
 *   --repo ORG/NAME   Override repository (default: git remote origin)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SECRET_KEYS = new Set([
  "FLY_API_TOKEN",
  "RENDER_INDUCER_DEPLOY_HOOK_URL",
  "RAILWAY_INDUCER_DEPLOY_HOOK_URL",
  "KOYEB_INDUCER_DEPLOY_HOOK_URL",
]);

const VARIABLE_KEYS = new Set(["FLY_INDUCER_APP_NAME", "PAZAAK_WORKER_URL"]);

function parseArgs(argv) {
  let dryRun = false;
  let repo = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--repo" && argv[i + 1]) {
      repo = argv[++i];
    } else rest.push(a);
  }
  return { dryRun, repo, rest };
}

function detectRepoFromGit() {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      cwd: resolve(ROOT, "../.."),
    }).trim();
    const m = out.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

function loadEnvFile(path) {
  const text = readFileSync(path, "utf8");
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function gh(args, dryRun) {
  const cmd = ["gh", ...args];
  console.log(cmd.join(" "));
  if (dryRun) return;
  execFileSync("gh", args, { stdio: "inherit" });
}

function main() {
  const { dryRun, repo: repoArg } = parseArgs(process.argv.slice(2));
  const envPath = resolve(ROOT, "matchmaking-ci.env");
  if (!existsSync(envPath)) {
    console.error(
      `Missing ${envPath}. Copy matchmaking-ci.env.template to matchmaking-ci.env and fill values.`,
    );
    process.exit(1);
  }

  const repo = repoArg ?? detectRepoFromGit();
  if (!repo) {
    console.error("Could not detect GitHub repo. Pass --repo ORG/name.");
    process.exit(1);
  }

  const env = loadEnvFile(envPath);

  let applied = 0;
  for (const key of SECRET_KEYS) {
    const val = env[key]?.trim();
    if (!val) continue;
    gh(["secret", "set", key, "--repo", repo, "--body", val], dryRun);
    applied++;
  }
  for (const key of VARIABLE_KEYS) {
    const val = env[key]?.trim();
    if (!val) continue;
    gh(["variable", "set", key, "--repo", repo, "--body", val], dryRun);
    applied++;
  }

  if (applied === 0) {
    console.error(
      "No non-empty keys applied. Fill at least FLY_API_TOKEN + PAZAAK_WORKER_URL + FLY_INDUCER_APP_NAME for Fly CI.",
    );
    process.exit(1);
  }

  console.log(dryRun ? `Dry-run complete (${applied} keys).` : `Applied ${applied} GitHub Actions keys to ${repo}.`);
}

main();

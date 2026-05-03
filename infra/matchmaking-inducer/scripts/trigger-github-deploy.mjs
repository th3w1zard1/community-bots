#!/usr/bin/env node
/**
 * Dispatch the Deploy matchmaking inducer workflow on GitHub Actions.
 *
 *   cd infra/matchmaking-inducer
 *   node scripts/trigger-github-deploy.mjs
 *
 * Requires: gh auth, repo with workflow file; Fly job runs only if FLY_API_TOKEN secret is set.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function detectRepoFromGit() {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      cwd: resolve(__dirname, "../../.."),
    }).trim();
    const m = out.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

const repo =
  process.argv.find((a) => a.startsWith("--repo="))?.slice(7) ||
  process.env.GITHUB_REPOSITORY ||
  detectRepoFromGit();

if (!repo) {
  console.error("Pass --repo=ORG/name or set GITHUB_REPOSITORY.");
  process.exit(1);
}

const r = spawnSync(
  "gh",
  ["workflow", "run", "deploy-matchmaking-inducer.yml", "--repo", repo],
  { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] },
);
if (r.status !== 0) {
  const err = `${r.stderr || ""}${r.stdout || ""}`;
  if (/404|not found on the default branch/i.test(err)) {
    console.error(
      `Workflow is not on ${repo}'s default branch yet. Merge/push .github/workflows/deploy-matchmaking-inducer.yml, then retry.`,
    );
  } else {
    console.error(err.trim() || `gh workflow run failed (${r.status})`);
  }
  process.exit(r.status ?? 1);
}
console.log(`Triggered deploy-matchmaking-inducer on ${repo}. Check Actions tab.`);

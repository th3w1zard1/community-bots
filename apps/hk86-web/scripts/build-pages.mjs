#!/usr/bin/env node
/**
 * Production-style build for GitHub Pages subpath /bots/hk86/
 * (matches CI env in deploy-pazaakworld.yml).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(root, "..");

process.env.BASE ??= "/bots/hk86/";
const result = spawnSync("vite", ["build"], {
  cwd: appRoot,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);

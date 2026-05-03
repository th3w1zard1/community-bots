import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "../..");
const entry = resolve(root, "src/index.ts");
const outfile = resolve(root, "../../infra/nakama/modules/pazaak-world.js");
const watch = process.argv.includes("--watch");

await mkdir(dirname(outfile), { recursive: true });

const options: esbuild.BuildOptions = {
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "neutral",
  target: "es2020",
  format: "iife",
  alias: {
    "@openkotor/pazaak-tournament": resolve(repoRoot, "packages/pazaak-tournament/src/nakama-entry.ts"),
    "node:crypto": resolve(dirname(fileURLToPath(import.meta.url)), "node-crypto-stub.ts"),
  },
  globalName: "pazaakWorldRuntime",
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
  banner: {
    js: "var exports = {}; var module = { exports: exports };",
  },
  footer: {
    js: "module.exports = pazaakWorldRuntime;",
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`Watching Nakama runtime -> ${outfile}`);
} else {
  await esbuild.build(options);
}

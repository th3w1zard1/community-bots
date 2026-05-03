#!/usr/bin/env node
/**
 * Lists registered global/application slash commands for the Trask Discord app via REST.
 * Does not open the Discord client (no browser login required).
 *
 * Env:
 *   TRASK_DISCORD_BOT_TOKEN  — Bot token (required)
 *   TRASK_DISCORD_APP_ID     — Application ID (required)
 *
 * Usage (repo root):
 *   node scripts/discord_trask_commands_smoke.mjs
 */

const token = process.env.TRASK_DISCORD_BOT_TOKEN?.trim();
const appId = process.env.TRASK_DISCORD_APP_ID?.trim();

if (!token || !appId) {
  console.error(
    "Set TRASK_DISCORD_BOT_TOKEN and TRASK_DISCORD_APP_ID to verify slash commands via Discord REST.",
  );
  process.exit(2);
}

const url = `https://discord.com/api/v10/applications/${encodeURIComponent(appId)}/commands`;
const res = await fetch(url, {
  headers: {
    Authorization: `Bot ${token}`,
  },
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error(`Non-JSON response (${res.status}):`, text.slice(0, 400));
  process.exit(1);
}

if (!res.ok) {
  console.error(`Discord API ${res.status}:`, data);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error("Unexpected response shape:", data);
  process.exit(1);
}

const names = data.map((c) => c.name).filter(Boolean);
console.log(`Registered slash commands (${names.length}): ${names.join(", ") || "(none)"}`);
const ask = data.find((c) => c.name === "ask");
if (!ask) {
  console.warn('Warning: no "ask" command found — Trask may use guild-scoped commands only.');
} else {
  console.log('"ask" command is registered at application scope.');
}

# OpenKOTOR Discord Bots

This repository contains the first implementation pass for a KOTOR-themed Discord bot suite:

- `Trask`: a source-backed KOTOR q&a assistant.
- `HK`: a curated self-role bot with HK-style responses.
- `Pazaak Bot`: a pazaak and fake-credit social game bot.
- `ingest-worker`: the shared ingestion and indexing entry point.

## Current State

This is the foundation phase. The monorepo includes:

- shared configuration, logging, UI, persona, retrieval, and persistence packages
- three runnable Discord bot apps with initial command sets
- a first pazaak vertical slice with in-memory active matches and file-backed wallets
- a Trask approved-source policy with a ResearchWizard sidecar integration path

## Bot Overview

### Trask

Purpose: answer KOTOR questions in a helpful, source-backed voice without exposing low-level retrieval details by default.

Administers:
- KOTOR troubleshooting answers
- project and tooling guidance
- citation-heavy research replies limited to approved sources

Implements its logic by:
- sending `/ask` queries to an `ai-researchwizard` sidecar
- constraining the request to the repo's hardcoded approved source list
- formatting the result into a Discord-friendly briefing with inline citations and a compact sources block

### HK

Purpose: manage curated self-assignable community roles.

Administers:
- project-follow roles
- community and event opt-ins
- timezone-sector discovery roles

Implements its logic by:
- reading the live guild role list on each interaction
- diffing the requested designations against the member's current roles
- applying Discord hierarchy-safe adds/removes with explicit error reporting

### Pazaak Bot

Purpose: run the server's pazaak table and fake-credit economy.

Administers:
- public challenges and rematches
- match state and turn flow
- wallets, daily bonuses, leaderboards, and rivalries

Implements its logic by:
- coordinating match state through a dedicated game engine
- persisting active matches and wallets to JSON storage
- exposing public board state plus private ephemeral hand controls

## Workspace Layout

```text
apps/
  trask-bot/
  trask-http-server/
  hk-bot/
  pazaak-bot/
  ingest-worker/
packages/
  config/
  core/
  discord-ui/
  persistence/
  personas/
  retrieval/
  trask/
  trask-http/
vendor/
  ai-researchwizard/
docs/
infra/
```

## Getting Started

1. Copy `.env.example` to `.env` and fill the relevant Discord app credentials.
2. Install dependencies with `corepack pnpm install`.
3. Build the workspace with `corepack pnpm build`.
4. Run one bot at a time with one of:
   - `corepack pnpm dev:trask`
   - `corepack pnpm dev:trask-http` (REST + optional static `apps/holocron-web` build)
   - `corepack pnpm dev:hk` (HK guide on the [wiki](https://github.com/OpenKotOR/community-bots/wiki/docs/guides/hk-86); reaction panels use `data/hk-bot/reaction-role-panels.json` — start from `apps/hk-bot/reaction-role-panels.example.json`; `/designations reactions help` in Discord prints setup steps; static Discord bots hub when deployed: https://openkotor.github.io/bots/hk86)
   - `corepack pnpm dev:pazaak`
   - `corepack pnpm dev:ingest`

Trask runs **headless GPT Researcher** from `vendor/ai-researchwizard` (see `TRASK_GPT_RESEARCHER_ROOT` /
`TRASK_GPT_RESEARCHER_PYTHON`); it does **not** require the FastAPI/Web UI server. The vendored tree lives in
`vendor/ai-researchwizard` (often as a git submodule).

All bots auto-register guild-scoped commands when their corresponding `*_DISCORD_GUILD_ID` is present.
You can also set `DISCORD_TARGET_GUILD_ID` once and let all three bots target the same guild by default.

## Discord Export

The repo now includes a Python CLI for full Discord guild exports at [scripts/export_discord_server.py](c:/GitHub/openkotor-discord-bots/scripts/export_discord_server.py).

Default behavior is intentionally non-interactive and broad: if `.env` contains a valid bot token plus `PAZAAK_DISCORD_GUILD_ID` or `DISCORD_TARGET_GUILD_ID`, running the script with no narrowing flags exports the full visible guild snapshot in one shot.

```powershell
c:/GitHub/openkotor-discord-bots/.venv/Scripts/python.exe -B scripts/export_discord_server.py --color
```

By default the exporter:

- fetches guild metadata
- fetches additional guild-level resources when available, including the community welcome screen, guild soundboard sounds, and the public guild widget payload when the server exposes it
- enumerates visible top-level channels and threads
- includes archived thread discovery unless explicitly disabled
- downloads message history for visible message-bearing containers
- expands reaction user lists for visible reactions
- downloads accessible message and guild asset media into a deduplicated asset store, including guild icons/banners, role icons, scheduled-event covers, guild soundboard audio when present, all public guild widget image styles plus widget member avatars when the widget is public, member profile avatars/banners, avatar decorations, clan badges when present, mentioned-user and reaction-user profile media and clan badges, emojis, stickers, and nested media inside referenced or forwarded message payloads; collectible nameplates and display-name styling metadata are also surfaced in normalized export refs when present in user payloads
- checkpoints progress and resumes the latest valid export directory automatically
- writes a manifest plus per-container JSON files under `exports/discord-server-<guild>-<id>-<timestamp>/`

Useful explicit overrides:

- `--metadata-only` to skip message history and export structure only
- `--include-channel` or `--exclude-channel` to narrow scope explicitly
- `--output-file` for a single aggregate JSON output instead of a directory tree
- `--exclude-archived-threads` to skip archived thread discovery
- `--no-reaction-users` to skip per-reaction user expansion explicitly
- `--no-assets` to skip asset downloads explicitly
- `--no-resume` to force a fresh export directory explicitly
- `--log-level`, `--verbose`, `--color`, or `--no-color` to control standardized stderr logging
- `--json-summary` for machine-readable completion output

The completion summary now includes downloaded asset totals and a split of `container_asset_ref_count`, `guild_asset_ref_count`, and `total_asset_ref_count` in both plain-text and `--json-summary` modes, alongside the persisted `guild_resource_summary` snapshot.

Deduplicated entries in `assets-manifest.json` now also retain merged provenance in `source_claims`, so reused assets can be traced back to every message, reaction-user profile, widget/member profile, or guild-level source that referenced them instead of only the first claimant.

Resume behavior is backfill-aware: if cached container JSON already exists, the exporter reuses saved message payloads and only performs missing enrichment work instead of refetching message history. Progress now checkpoints during message enrichment as well, so interrupted reaction-heavy containers can resume partway through rather than starting that container over. Reaction-user backfill resumes at the message level instead of replaying already-checkpointed messages, and asset enrichment completion is recorded per message so a container whose remaining media only failed remotely will still be recognized as complete and skipped on later resumes. Asset backfill now also revisits mentioned-user and reaction-user profile media, collectible nameplate and display-name-style metadata refs, plus nested referenced or forwarded message payloads when those embedded copies contain attachments, embeds, stickers, author avatars, avatar decorations, or clan badges that were not previously downloaded.

The verified live logger behavior is intentionally operator-friendly during long resumes:

- container logs use explicit `scope=... type=... id=... name=...` fields
- long reaction or asset backfills emit throttled progress markers instead of appearing stalled
- `manifest.json` and `assets-manifest.json` update during checkpoint writes, not only after a container finishes
- inaccessible third-party embed media is recorded as a failed asset and the run continues instead of aborting or silently dropping it
- long retry-after values on asset fetches are bounded, and repeated transient failures on external embed assets are cut short, so one bad remote host does not stall the whole export for many minutes
- the final stderr summary now includes a one-line guild resource status report covering welcome screen, soundboard count, vanity URL availability, widget JSON/settings availability, widget member count, and exported widget image style count

That same guild resource status snapshot is also persisted in `manifest.json` under `guild_resource_summary`, so both machine readers and operators see the same verified end-state without scraping colored terminal output.

Checkpoint persistence is also now interruption-safe: JSON manifests and downloaded assets are written through atomic temp-file replacement, unreadable cached JSON is quarantined to a `*.corrupt-<timestamp>.json` sibling instead of aborting the whole resume path, and disk-full write failures now stop the run immediately instead of being misreported as ordinary asset download warnings.

When a guild-level resource exists in the API but is not enabled or not exposed for the current bot permissions, the exporter records that in `optional_resource_errors` instead of aborting the run. This is how unavailable welcome-screen metadata is reported, for example.

Manifest accounting now splits asset references into `container_asset_ref_count` and `guild_asset_ref_count`, with `total_asset_ref_count` including both. This keeps guild-level exports such as member profile media, widget assets, soundboard sounds, and other non-message resources visible in the top-level totals instead of hiding them outside the per-container summaries.

The previous helper name [scripts/export_discord_channel.py](c:/GitHub/openkotor-discord-bots/scripts/export_discord_channel.py) now acts as a compatibility wrapper over the new CLI.

Completed OpenKotOR guild export:

- [exports/discord-server-openkotor-739590575359262792-20260416T171425Z/manifest.json](c:/GitHub/openkotor-discord-bots/exports/discord-server-openkotor-739590575359262792-20260416T171425Z/manifest.json)
- [exports/discord-server-openkotor-739590575359262792-20260416T171425Z/guild.json](c:/GitHub/openkotor-discord-bots/exports/discord-server-openkotor-739590575359262792-20260416T171425Z/guild.json)

Latest verified export with the leveled logger:

- [exports/discord-server-openkotor-739590575359262792-20260416T172407Z/manifest.json](c:/GitHub/openkotor-discord-bots/exports/discord-server-openkotor-739590575359262792-20260416T172407Z/manifest.json)
- [exports/discord-server-openkotor-739590575359262792-20260416T172407Z/guild.json](c:/GitHub/openkotor-discord-bots/exports/discord-server-openkotor-739590575359262792-20260416T172407Z/guild.json)

That latest live-validated checkpoint completed successfully with `63` exported containers, `12828` messages, `1811` downloaded assets, and `22629` total asset refs split as `22064` container refs plus `565` guild refs. The same completed run also verified the public guild widget surface for OpenKotOR: `widget_channel_count: 2`, `widget_member_count: 72`, `widget_presence_count: 72`, `widget_image_style_count: 5`, downloaded widget image assets for `shield` plus `banner1` through `banner4`, and downloaded widget avatar assets for the exposed widget member list. It also confirmed that `vanity_url` and bot-auth `widget_settings` are permission-blocked for the current bot and are therefore recorded in `optional_resource_errors` rather than silently omitted.

## Notes

- Trask is being moved to a sidecar-backed research flow. The approved source list stays hardcoded in this repo, while the answer synthesis path is delegated to `ai-researchwizard`.
- Pazaak Bot wallets are persisted to a JSON file so the game loop is usable before the Postgres layer is wired in.
- HK only manages a curated allowlist of opt-in roles and refuses to touch roles above the bot in the guild hierarchy.
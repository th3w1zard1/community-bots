# Setup Guide

This guide walks through getting the three bots running locally against a test Discord guild.

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 24.0.0 | Required by all apps |
| pnpm | 10.x | Managed via Corepack — run `corepack enable` once |
| Discord accounts | — | One application per bot (Trask, HK, Pazaak Bot) |

## 1. Create Three Discord Applications

Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create
three separate applications — one for each bot. For each application:

1. Copy the **Application ID** and **Public Key** from the General Information tab.
2. Open the **Bot** section, reset the token, and copy it.
3. Enable **Server Members Intent** for the HK bot.
4. Under **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, add the
   permissions your bot needs (see below), and paste the generated URL into your test guild.

### Minimum Permissions

| Bot | Permission bits |
|---|---|
| Trask | Read Messages, Send Messages, Embed Links, Read Message History |
| HK | Manage Roles, Read Messages, Send Messages, Embed Links |
| Pazaak Bot | Read Messages, Send Messages, Embed Links |

> **Role hierarchy:** For HK to assign roles, its highest role must sit above every role it is
> expected to manage in the guild's role list.

## 2. Clone and Install

```bash
git clone https://github.com/your-org/openkotor-discord-bots
cd openkotor-discord-bots
corepack enable
corepack pnpm install
```

## 3. Configure Environment

Copy `.env.example` to `.env` and fill in the values for the bots you want to run:

```bash
cp .env.example .env
```

Key variables to fill in immediately:

```
DISCORD_TARGET_GUILD_ID=      # optional shared test guild id for all three bots

TRASK_DISCORD_APP_ID=
TRASK_DISCORD_PUBLIC_KEY=
TRASK_DISCORD_BOT_TOKEN=
TRASK_DISCORD_GUILD_ID=      # optional override; otherwise DISCORD_TARGET_GUILD_ID is used

HK_DISCORD_APP_ID=
HK_DISCORD_PUBLIC_KEY=
HK_DISCORD_BOT_TOKEN=
HK_DISCORD_GUILD_ID=         # optional override; otherwise DISCORD_TARGET_GUILD_ID is used

PAZAAK_DISCORD_APP_ID=
PAZAAK_DISCORD_PUBLIC_KEY=
PAZAAK_DISCORD_BOT_TOKEN=
PAZAAK_DISCORD_GUILD_ID=    # optional override; otherwise DISCORD_TARGET_GUILD_ID is used
```

Shared AI / retrieval variables are optional until you wire the live-scrape phase:

```
OPENAI_API_KEY=            # optional until Trask ingests real content
FIRECRAWL_API_KEY=         # optional — used by future ingest pipeline
DATABASE_URL=              # optional — defaults to local file storage
```

For Trask's headless GPT Researcher `/ask` flow (and Holocron Q&A), create a Python venv with
`vendor/ai-researchwizard/requirements.txt` — see **`scripts/bootstrap_trask_gpt_researcher.ps1`** /
**`scripts/bootstrap_trask_gpt_researcher.sh`** and [docs/trask.md](trask.md) — then set:

```
TRASK_GPT_RESEARCHER_ROOT=vendor/ai-researchwizard
TRASK_GPT_RESEARCHER_PYTHON=.venv-trask-gptr/Scripts/python.exe   # or bin/python on Unix
TRASK_RESEARCHWIZARD_TIMEOUT_MS=120000
```

## 4. Build

```bash
corepack pnpm build
```

A clean exit with no output means all three apps compiled successfully.

## 5. Run a Bot

Each app is a plain Node.js script. Use the workspace dev scripts to run one at a time:

```bash
# Trask
corepack pnpm dev:trask

# HK
corepack pnpm dev:hk

# Pazaak Bot
corepack pnpm dev:pazaak
```

On the first startup, the bot auto-deploys guild-scoped slash commands to the guild configured in
`*_DISCORD_GUILD_ID`, or `DISCORD_TARGET_GUILD_ID` when the per-bot override is omitted. Guild commands appear in Discord within seconds.

To generate the three OAuth install links once the application IDs exist:

```bash
corepack pnpm discord:install-links
```

## 6. Verify Each Bot

### Trask
- `/ask query:mdlops` → should return a list of matching sources from the catalog.
- `/sources` → should list all approved source entries.
- `/queue-reindex` → should confirm queued source refresh count.

### HK
- `/designations list` → should display the curated role catalog by category.
- `/designations panel` → should open a multi-select sync panel.
- `/designations assign designation:reone` → should add the matching guild role (the role must exist
  in the guild with the exact same name as in the catalog).

### Pazaak Bot
- `/pazaak rules` → displays the pazaak rule embed.
- `/pazaak wallet` → shows your starting credit balance.
- `/pazaak daily` → awards the daily bonus on first claim.
- `/pazaak challenge opponent:@someone wager:100` → issues a challenge embed with Accept/Decline.
- After a game starts, the **"🎮 Play in Browser"** button opens the Discord Activity if the
  Activity URL is configured (see [Pazaak World](#pazaak-world-optional)).

## Pazaak World (Optional)

The Pazaak Bot ships with an optional Discord Embedded App Activity (`apps/pazaak-world`). When
enabled, players can play Pazaak directly inside a Discord Activity iframe instead of only through
text commands. Games are cross-interface: you can start a match with `/pazaak challenge` and
continue in the Activity, or vice versa.

### 1. Enable Activities in the Developer Portal

1. Open [discord.com/developers/applications](https://discord.com/developers/applications) and
   select the **Pazaak Bot** application.
2. Navigate to **Activities** in the left sidebar.
3. Under **URL Mappings**, add a mapping: set **Prefix** to `/` and **Target** to the public URL
   of your deployed `pazaak-world` frontend (e.g. `https://pazaak.example.com`). During local
   development, Discord's tunnel or a service like [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) can proxy `localhost:5173`.
4. Under **OAuth2 → General**, copy the **Client Secret** — you need it for the token exchange.

### 2. Configure Environment Variables

Add to your `.env`:

```env
PAZAAK_DISCORD_CLIENT_SECRET=<client secret from Developer Portal>
PAZAAK_API_PORT=4001              # port the embedded HTTP/WS server listens on (default 4001)
PAZAAK_ACTIVITY_URL=https://openkotor.github.io/bots/pazaakworld
PAZAAK_PUBLIC_WEB_ORIGIN=https://openkotor.github.io/bots/pazaakworld
```

The Activity frontend also needs `.env` in `apps/pazaak-world/`:

```env
VITE_DISCORD_CLIENT_ID=<same as PAZAAK_DISCORD_APP_ID>
```

### 2.1 Configure Google / Discord / GitHub OAuth Login

The standalone auth modal can now sign in using OAuth providers. Configure one or more providers in
`.env` for the Pazaak bot process:

```env
# Google OAuth (Google Cloud Console)
PAZAAK_OAUTH_GOOGLE_CLIENT_ID=
PAZAAK_OAUTH_GOOGLE_CLIENT_SECRET=
PAZAAK_OAUTH_GOOGLE_CALLBACK_URL=https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/google/callback

# Discord OAuth (Discord Developer Portal)
PAZAAK_OAUTH_DISCORD_CLIENT_ID=
PAZAAK_OAUTH_DISCORD_CLIENT_SECRET=
PAZAAK_OAUTH_DISCORD_CALLBACK_URL=https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/discord/callback

# GitHub OAuth (GitHub OAuth Apps)
PAZAAK_OAUTH_GITHUB_CLIENT_ID=
PAZAAK_OAUTH_GITHUB_CLIENT_SECRET=
PAZAAK_OAUTH_GITHUB_CALLBACK_URL=https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/github/callback
```

Provider setup checklist:

1. Register each callback URL exactly as shown above in the provider console.
2. For local API testing, keep the bot API on `http://localhost:4001`; OAuth provider callback
   registrations should point at the GitHub Pages PazaakWorld URL unless you are using a separate
   development OAuth app.
3. Restart `dev:pazaak` after editing `.env`.
4. In the standalone page, open the top-right auth modal; provider buttons become enabled only when
   each provider is fully configured.

Notes:

- Google scopes: `openid profile email`
- Discord scopes: `identify email`
- GitHub scopes: `read:user user:email`

### 2.1.1 Google OAuth Console Exact Steps

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select the project backing your OAuth client.
2. Go to **APIs & Services -> OAuth consent screen**.
3. Configure app name/support email and publish to **Testing** or **Production**.
4. Add scopes:
   - `openid`
   - `profile`
   - `email`
5. Go to **APIs & Services -> Credentials**.
6. Create (or open) an **OAuth 2.0 Client ID** of type **Web application**.
7. Add Authorized redirect URI:
   - `https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/google/callback`
8. Copy the Client ID and Client Secret into:
   - `PAZAAK_OAUTH_GOOGLE_CLIENT_ID`
   - `PAZAAK_OAUTH_GOOGLE_CLIENT_SECRET`

### 2.1.2 Discord Developer Portal Exact Steps

1. Open [Discord Developer Portal](https://discord.com/developers/applications) and select your Pazaak app.
2. Go to **OAuth2 -> General**.
3. Under Redirects, add:
   - `https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/discord/callback`
4. Save changes.
5. Copy values:
   - **Client ID** -> `PAZAAK_OAUTH_DISCORD_CLIENT_ID`
   - **Client Secret** -> `PAZAAK_OAUTH_DISCORD_CLIENT_SECRET`

Notes:

- If `PAZAAK_OAUTH_DISCORD_CLIENT_ID` is not set, the server can fall back to `PAZAAK_DISCORD_APP_ID`.
- If `PAZAAK_OAUTH_DISCORD_CLIENT_SECRET` is not set, the server can fall back to `PAZAAK_DISCORD_CLIENT_SECRET`.
- Provider button enablement still requires an effective Client ID + Client Secret pair.

### 2.1.3 GitHub OAuth App Exact Steps

1. Open GitHub **Settings -> Developer settings -> OAuth Apps**.
2. Create a **New OAuth App** (or open an existing one).
3. Set fields:
   - **Application name**: your choice
   - **Homepage URL**: `https://openkotor.github.io/bots/pazaakworld`
   - **Authorization callback URL**: `https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/github/callback`
4. Register the app.
5. Copy values:
   - **Client ID** -> `PAZAAK_OAUTH_GITHUB_CLIENT_ID`
   - **Generate a new client secret** -> `PAZAAK_OAUTH_GITHUB_CLIENT_SECRET`

### 2.1.4 Why Buttons Show "Unavailable" and How to Fix

The standalone modal reads provider enablement from:

- `GET http://localhost:4001/api/auth/oauth/providers`

If a provider is disabled, it means the server did not find a usable Client ID + Client Secret (or the process has not been restarted after `.env` changes).

Local verification flow:

1. Update `.env` with all OAuth values.
2. Fully restart `corepack pnpm dev:pazaak`.
3. Check API status:

```text
curl http://localhost:4001/api/auth/oauth/providers
```

Expected when configured:

```text
{"providers":[{"provider":"google","enabled":true},{"provider":"discord","enabled":true},{"provider":"github","enabled":true}]}
```

4. Validate each start endpoint:

```text
curl -X POST http://localhost:4001/api/auth/oauth/google/start
curl -X POST http://localhost:4001/api/auth/oauth/discord/start
curl -X POST http://localhost:4001/api/auth/oauth/github/start
```

Each should return JSON containing a `redirectUrl`.

Quick one-command check:

```text
corepack pnpm check:pazaak-oauth
```

This prints:

- Missing OAuth env vars per provider
- Whether callback URLs match localhost defaults
- Live provider enablement from `http://localhost:4001/api/auth/oauth/providers`

When no active match is running, the Activity doubles as a sideboard-management surface. The same
workshop is also reachable from the in-match Activity header, so the embedded API needs the same
bot process that owns `custom-sideboards.json`, because the Activity can list, save, activate,
duplicate, reorder, and delete saved named custom boards before or during a match.

### 3. Run Locally

```bash
# Terminal 1 — Pazaak Bot (starts bot + embedded API server on port 4001)
corepack pnpm dev:pazaak

# Terminal 2 — Activity frontend hot-reload dev server on http://localhost:5173
corepack pnpm dev:pazaak-world
```

The Vite dev server proxies `/api` and `/ws` to `localhost:4001` automatically.

**Nakama (authoritative Pazaak):** To run matches against the bundled Nakama runtime instead of the
bot’s embedded HTTP/WebSocket API, start Postgres + Nakama (`pnpm dev:pazaak-nakama` or
`docker compose -f infra/nakama/docker-compose.yml up` after `pnpm build:pazaak-nakama`), then run
`pnpm dev:pazaak-world` with client env from `infra/nakama/README.md` (`VITE_PAZAAK_BACKEND=nakama`,
`VITE_NAKAMA_HOST`, etc.). Gameplay talks to Nakama on port **7350** directly from the browser;
keep the bot on **4001** if you still need OAuth (`/api/auth/token`) or Trask (`/api/trask/*`), and
set `VITE_LEGACY_HTTP_ORIGIN=http://localhost:4001` so those routes keep working.

### 4. Build the Activity for Production

```bash
corepack pnpm --filter pazaak-world build
```

Deploy the `apps/pazaak-world/dist/` directory to any static host, then update
`PAZAAK_ACTIVITY_URL` to the public URL and re-register it in the Developer Portal URL Mappings.

## 7. Data Directories

Pazaak Bot writes wallet state to disk at the path in `PAZAAK_DATA_DIR` (default:
`data/pazaak-bot/`). The directory is created automatically on first run. These files are
local-only and not committed to the repository.

## 8. Running the Ingest Worker CLI

The ingest worker is a standalone CLI that supports both queued and immediate indexing paths:

```bash
# List all registered sources
node --import tsx/esm apps/ingest-worker/src/main.ts list-sources

# Queue a refresh for one source
node --import tsx/esm apps/ingest-worker/src/main.ts queue-reindex deadlystream

# Process currently queued refresh jobs once
node --import tsx/esm apps/ingest-worker/src/main.ts drain-queue

# Run a continuous queue worker (polling every 15s by default)
node --import tsx/esm apps/ingest-worker/src/main.ts run-queue-worker

# Run an immediate refresh without queueing
node --import tsx/esm apps/ingest-worker/src/main.ts reindex-now deadlystream

# Show loaded config
node --import tsx/esm apps/ingest-worker/src/main.ts show-config
```

## Common Problems

| Symptom | Likely cause |
|---|---|
| `Missing required environment variable` | `.env` is not present or a required `*_DISCORD_BOT_TOKEN` is blank |
| Commands not appearing in Discord | `*_DISCORD_GUILD_ID` is wrong or the bot lacks `applications.commands` OAuth scope in the guild |
| HK cannot assign roles | HK's role is not above the target roles in the guild hierarchy |
| `Object is possibly undefined` at runtime | Restart the TypeScript build; this should not surface in compiled output |
| Empty wallet file on startup | Expected — the file is created on first interaction |
| Activity shows "Authentication Failed" | `PAZAAK_DISCORD_CLIENT_SECRET` is missing or wrong, or the Activity URL is not registered in the Developer Portal URL Mappings |
| "Play in Browser" button missing from match embed | `PAZAAK_ACTIVITY_URL` is not set in `.env`, or the bot needs a restart after adding it |
| Activity loads but hangs on "Connecting…" | The bot API server (`PAZAAK_API_PORT=4001`) is not reachable from the browser; check the Vite proxy config or the deployed URL mapping |

# Trask Bot

Trask Ulgo is the guild's KOTOR q&a bot. His job is to answer questions clearly, stay useful for
non-technical users, and support his claims with visible citations without dumping backend search
mechanics into the conversation.

## Persona

Trask answers like a competent officer briefing a junior crew member. He states the most important
thing first, provides relevant citations, and flags when information is uncertain. He does not pad
answers with filler text, does not pretend to know things he cannot cite, and avoids genericisms
("interesting question", "great point").

Key voice notes:
- Concise and action-oriented.
- Caveats uncertain information explicitly ("I do not have a cached result for this yet").
- Prefers two sentences over a paragraph when the answer fits.
- References source names naturally ("Per the Deadly Stream index, …").

## Commands

### `/ask`

Ask a KOTOR question and get a source-backed answer.

**Options:**
| Option | Required | Description |
|---|---|---|
| `query` | yes | Question or topic (max 200 characters) |

**Behavior:**
- Runs the vendored **headless GPT Researcher** (`vendor/ai-researchwizard/trask_headless_research.py`) — same core
  engine as `cli.py`, **not** the FastAPI/Web UI server.
- Restricts research to Trask's approved source list.
- Returns a short Discord-friendly answer with inline numeric citations and a compact `Sources`
  bibliography section.
- Does not explain retrieval internals unless the user explicitly asks.

**Example:**
```
/ask query:mdlops model formats
```

Returns a direct answer supported by approved sources such as MDLOps, KOTOR Neocities, PyKotor,
Deadly Stream, and related KOTOR references.

---

### `/sources`

Inspect the currently approved source policy. This is an admin-facing command.

**Options:**
| Option | Required | Description |
|---|---|---|
| `kind` | no | Filter by type: `website`, `github`, or `discord` |

**Behavior:**
Returns up to ten sources per call. Shows source name, description, and freshness policy.

---

### `/queue-reindex`

Queue a source refresh request. Requires **Manage Guild** permission.

**Options:**
| Option | Required | Description |
|---|---|---|
| `source` | no | Source ID to refresh, or leave blank for all sources |

**Behavior:**
- Writes source IDs into the ingest-worker file queue.
- The ingest worker can then process queued jobs with `drain-queue` (single pass) or `run-queue-worker` (continuous polling).

---

## Approved Source Catalog

Trask's answer generation is pinned to these approved sources by default:

| ID | Name | Kind | Notes |
|---|---|---|---|
| `deadlystream` | Deadly Stream | website | Primary KOTOR modding hub |
| `lucasforums-archive` | LucasForums Archive | website | Historical forum archive |
| `pcgamingwiki-kotor` | PCGamingWiki | website | PC compatibility and fixes |
| `kotor-neocities` | KOTOR Neocities | website | Community technical docs |
| `pykotor-wiki` | PyKotor Wiki | website | PyKotor scripting reference |
| `reone-repo` | reone | github | Open engine reimplementation |
| `northernlights-repo` | Northern Lights | github | Engine and tooling work |
| `mdlops-repo` | MDLOps | github | Model conversion tooling |
| `pykotor-repo` | PyKotor | github | Python KOTOR library |
| `kotorjs-repo` | kotor.js | github | JS KOTOR tooling |
| `approved-discord-knowledge` | Approved Discord | discord | Opt-in guild channel index |

## Admin Setup

The following environment variables control Trask's scope:

| Variable | Purpose |
|---|---|
| `TRASK_ALLOWED_GUILD_IDS` | Comma-separated guild IDs where Trask is active |
| `TRASK_APPROVED_CHANNEL_IDS` | Comma-separated channel IDs where `/ask` is allowed |
| `TRASK_SLASH_GUILD_IDS` | Comma-separated guild IDs where slash commands are **registered** (use when the bot serves multiple servers; overrides single-guild deploy when non-empty) |
| `TRASK_GPT_RESEARCHER_ROOT` | Absolute path to `vendor/ai-researchwizard` (optional if you run the bot from the monorepo root — auto-detected when `vendor/ai-researchwizard/gpt_researcher` exists) |
| `TRASK_GPT_RESEARCHER_PYTHON` | Python interpreter for the headless runner (default `python`; point at the venv that has `gpt-researcher` deps installed) |
| `TRASK_GPT_RESEARCHER_SCRIPT` | Optional absolute path to override `trask_headless_research.py` |
| `TRASK_RESEARCHWIZARD_TIMEOUT_MS` | Max time for one research run (default `120000`) |

When `TRASK_APPROVED_CHANNEL_IDS` is set, Trask only answers `/ask` in those channels. It does not
perform blanket server-history reads unless proactive mode is enabled (see below).

### GPT Researcher Python environment (required for `/ask` and Holocron research)

Trask spawns **`vendor/ai-researchwizard/trask_headless_research.py`**, which loads `.env` via
**`python-dotenv`** and imports the vendored **`gpt_researcher`** package. Use a dedicated virtualenv
and point **`TRASK_GPT_RESEARCHER_PYTHON`** at its interpreter (plain `python` on PATH is fine only if
that environment already has the dependencies).

**Bootstrap (recommended)**

- **Windows (PowerShell):** `.\scripts\bootstrap_trask_gpt_researcher.ps1`
- **macOS / Linux:** `bash scripts/bootstrap_trask_gpt_researcher.sh`

Each script creates **`.venv-trask-gptr`** at the repo root and runs  
`pip install -r vendor/ai-researchwizard/requirements.txt` (includes **`python-dotenv`** and the rest
of GPT Researcher’s stack).

**Manual**

```bash
python3 -m venv .venv-trask-gptr
source .venv-trask-gptr/bin/activate   # Windows: .venv-trask-gptr\Scripts\activate
pip install -r vendor/ai-researchwizard/requirements.txt
export TRASK_GPT_RESEARCHER_PYTHON="$(pwd)/.venv-trask-gptr/bin/python"
```

If you see **`ModuleNotFoundError: No module named 'dotenv'`**, install deps from that requirements
file (or `pip install python-dotenv`) into the **same** interpreter **`TRASK_GPT_RESEARCHER_PYTHON`**
uses — not only the Node/pnpm toolchain.

API keys and retriever settings are read from **`.env`** in **`vendor/ai-researchwizard`** (or the
process environment); copy upstream `.env.example` there if you need a template.

### Smoke test (headless JSON contract)

Use **`scripts/smoke_trask_headless_gptr.py`** to verify the same stdin/stdout shape Node uses when it
spawns `trask_headless_research.py`.

| Command | Purpose |
|---|---|
| `python scripts/smoke_trask_headless_gptr.py --dry-run` | Confirms **`TRASK_GPT_RESEARCHER_PYTHON`** (or `.venv-trask-gptr`) can import **`dotenv`** and **`gpt_researcher`** with **`cwd`** set to `vendor/ai-researchwizard`. **No API calls.** |
| `python scripts/smoke_trask_headless_gptr.py` | Runs one minimal **`research_report`** / **`web`** payload; stdout must be **JSON** with a non-empty **`report`**. Uses **`--timeout-ms`** (default **180000**). Requires working **`.env`** (LLM + default retriever, often Tavily). |

pnpm wrappers (repo root): **`pnpm smoke:trask-gptr-dry`** and **`pnpm smoke:trask-gptr`**.

### Holocron browser E2E (Playwright)

End-to-end UI checks run against **built** `apps/holocron-web` served by **`trask-http-server`** on **4010**
(the same integrated layout as production Holocron behind the API).

```bash
pnpm exec playwright install chromium   # once per machine (repo root)
pnpm holocron:e2e
```

This exercises the composer, relevance gating, and at least one full **`/api/trask/ask`** round-trip
(answer with **Sources**, or **Research service error** if Python GPT Researcher keys are missing).

### Discord bot slash commands (REST smoke)

Automating Discord’s **web client** requires a logged-in session; this repo ships a small **REST** probe instead:

```bash
set TRASK_DISCORD_BOT_TOKEN=...
set TRASK_DISCORD_APP_ID=...
node scripts/discord_trask_commands_smoke.mjs
```

Guild-scoped commands may not appear here if your deploy registers only per-guild — the script still validates token/app pairing.

### Proactive channel replies (optional)

When **`TRASK_PROACTIVE_ENABLED=1`**, Trask registers **privileged intents** (`Guild Messages`, `Message Content`),
listens in resolved proactive channels, and may answer **without** `/ask` using a short plain-text reply (chat-style,
not the long embed briefing).

**Requirements**

- Enable **Message Content Intent** (and guild message events) for the application in the Discord Developer Portal.
- Set **`OPENAI_API_KEY`** (or **`OPENROUTER_API_KEY`**) — used for a **small-model JSON classifier** (question +
  KOTOR relevance), **embeddings** to compare the draft answer against the research report, and the brief rewrite path.
- Configure at least one channel: **`TRASK_PROACTIVE_CHANNEL_IDS`** or **`TRASK_APPROVED_CHANNEL_IDS`** (proactive falls
  back to approved channels when the proactive list is empty).

**Behavior (high level)**

1. **Debounce** (`TRASK_PROACTIVE_DEBOUNCE_MS`, default 25s): waits for quiet time before running the pipeline on the
   latest eligible message in that channel.
2. **Competing reply heuristic**: after the wait, if another (non-bot) user posted a message at least
   `TRASK_PROACTIVE_COMPETING_MIN_LENGTH` characters long, Trask stays silent so humans can answer first.
3. **Classifier** (`TRASK_PROACTIVE_CLASSIFIER_MODEL`, default `gpt-4o-mini`): JSON output gates obvious non-questions
   and off-topic chatter.
4. **Research**: runs headless GPT Researcher with a **brief** digest prompt and a short Discord rewrite.
5. **Semantic gate** (`TRASK_PROACTIVE_SIMILARITY_THRESHOLD`): embedding similarity between the user question / brief
   answer and the normalized report must clear the threshold, reducing confident-but-ungrounded replies.
6. **Per-user cooldown** (`TRASK_PROACTIVE_USER_COOLDOWN_MS`) limits spam.

See [`apps/trask-bot/.env.example`](apps/trask-bot/.env.example) for all proactive tunables.

### Discord web, `/ask`, and Playwright

Discord’s web client treats slash options as structured fields. Typing a single line like
`/ask query What is MDLOps?` (or filling the composer without selecting the `query` chip) often leaves
`query` empty and shows **“This option is required”**. For manual use or automation, prefer **Apps →
Trask Q&A Assistant → `ask`**, then enter text **inside the `query` parameter** (click the `query`
pill so it is active before typing). Playwright and similar tools should mimic that flow—**Tab alone
may not bind** the option—rather than pasting a full pseudo-command string.

## Current Limitations

- Trask depends on a working **Python + GPT Researcher** install under `TRASK_GPT_RESEARCHER_ROOT` (API keys such as
  `OPENAI_API_KEY` / retriever keys live in `.env` loaded by the headless script).
- The vendored backend defaults to a report-oriented workflow, so prompt and formatting controls
  still need refinement to keep replies concise under Discord limits.
- Ingest queue processing is still a separate operator workflow. `/queue-reindex` enqueues work,
  while indexing execution is managed by ingest-worker CLI commands.
- With **`TRASK_PROACTIVE_ENABLED=0`** (default), Trask is slash-command-only and does not use privileged message intents.
- Proactive mode reads channel messages and requires **Message Content** intent plus operator discipline (scoped channels,
  cooldowns) to avoid noisy or intrusive automation.

## Architecture (modular)

| Piece | Role |
|---|---|
| `@openkotor/trask` | Spawns `trask_headless_research.py` (GPT Researcher); optional OpenAI-compatible rewrite pass |
| `@openkotor/trask-http` | Express router factory: `GET/POST /sources`, `/history`, `/ask` under `/api/trask` with pluggable auth |
| `apps/trask-bot` | Discord slash commands; optional proactive listener uses `@openkotor/trask` brief answers + LLM gates |
| `apps/trask-http-server` | Standalone API + optional static serving of `apps/holocron-web/dist` |
| `apps/pazaak-bot` | Still mounts the same router at `/api/trask` for PazaakWorld |
| `apps/holocron-web` | Holocron SPA; **default** path calls the Trask HTTP API (legacy Spark simulation behind `VITE_TRASK_LEGACY_SPARK=1`) |
| `vendor/ai-researchwizard` | Upstream GPT Researcher tree; Trask uses `trask_headless_research.py` (+ optional `cli.py` for humans) |
| `vendor/llm_fallbacks` | Python ordering for free/chat models; optional helper script for GPTR env |

Trask Q&A does **not** require PazaakWorld: run `trask-http-server` + `holocron-web` against the same headless GPT Researcher
install on disk (`TRASK_GPT_RESEARCHER_ROOT`).

## Standalone HTTP server (`apps/trask-http-server`)

Runs the shared router and optionally serves a built `apps/holocron-web` bundle.

```bash
pnpm dev:trask-http
```

See [`apps/trask-http-server/.env.example`](apps/trask-http-server/.env.example) for variables.

### Auth modes for the web UI

| Mode | Configuration |
|---|---|
| Local dev | `TRASK_WEB_ALLOW_ANONYMOUS=1` — requests are scoped to `TRASK_WEB_DEFAULT_USER_ID` |
| Shared secret | `TRASK_WEB_API_KEY` — send `Authorization: Bearer <key>` or `X-Trask-Api-Key` (Holocron web can store a key in Settings) |

### Shared history with Discord

Point both processes at the same JSON store: set **`TRASK_HTTP_DATA_DIR`** on `trask-http-server` and use the same directory + filename pattern (`trask-queries.json` via `resolveDataFile`) if you extend the bot to POST to the API later—or symlink/copy **one** `trask-queries.json` path in ops.

## Holocron Web UI (`apps/holocron-web`)

- **Default:** questions go to `/api/trask/ask` (relative URL). Vite dev proxies `/api/trask` → `TRASK_HTTP_PROXY_TARGET` (default `http://127.0.0.1:4010`).
- **Env:** `VITE_TRASK_API_BASE` (optional absolute API origin), `VITE_TRASK_API_KEY` (optional build-time bearer), `VITE_TRASK_LEGACY_SPARK=1` to restore the old Spark + simulated multi-agent path.

```bash
pnpm install   # monorepo root
pnpm dev:holocron-web   # or: pnpm --filter @openkotor/holocron-web dev
```

Then either open the app via `trask-http-server` (static, after `pnpm --filter @openkotor/holocron-web build`) or run the dev server with `trask-http-server` on port 4010.

## Web UI (PazaakWorld, optional)

Trask remains available from PazaakWorld after sign-in (**◉ Ask Trask**). It uses the same `/api/trask/*` contract mounted inside `pazaak-bot`.

### Q&A Screen layout (PazaakWorld)

```
┌─────────────────────────────────────────────────────────────┐
│ nav: ◉ Trask Q&A              [Sources (N)]  [← Back]       │
├─────────────────────────────────────────────────────────────┤
│  ┌───── sidebar ──────┐  ┌──── main panel ─────────────────┐│
│  │ History            │  │  <welcome / answer exchange>    ││
│  │ ─────────────────  │  │                                 ││
│  │ question 1 (done)  │  │  ┌── input form ───────────────┐││
│  │ question 2 (fail)  │  │  │  textarea (Enter to submit) │││
│  │ …                  │  │  │  [count]          [Ask]     │││
│  └────────────────────┘  └──┴─────────────────────────────┘││
└─────────────────────────────────────────────────────────────┘
```

### API endpoints (`/api/trask/*`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/trask/sources` | List approved knowledge sources (requires auth) |
| `GET` | `/api/trask/history?limit=N` | Recent questions for the authenticated user |
| `POST` | `/api/trask/ask` | Submit a question; returns a `TraskQueryRecord` |

Returns **503** if the Trask runtime is not wired (pazaak-bot) or GPT Researcher root/script cannot run (`trask-http-server` still mounts routes but handlers error when misconfigured).

### DTO shapes

```ts
interface TraskSourceRecord {
  id: string;
  name: string;
  kind: "website" | "github" | "discord";
  homeUrl: string;
  description: string;
  freshnessPolicy: string;
}

interface TraskQueryRecord {
  queryId: string;
  userId: string;
  query: string;
  status: "pending" | "complete" | "failed";
  answer: string | null;
  sources: Array<{ id: string; name: string; url: string }>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
```

## LLM configuration

### GPT Researcher (`vendor/ai-researchwizard`)

Install Python deps in a venv rooted at `vendor/ai-researchwizard` (see upstream README), then point
`TRASK_GPT_RESEARCHER_PYTHON` at that interpreter. Configure the stack with standard upstream env vars, for example:

- `OPENAI_API_KEY` / `OPENROUTER_API_KEY` — LLM + embeddings
- `TAVILY_API_KEY` or other retriever keys required by your GPTR config
- `FAST_LLM` / `SMART_LLM` — set to `openrouter/auto` or a concrete LiteLLM model id

When OpenRouter is unavailable, generate conservative defaults from vendored **`llm_fallbacks`**:

```bash
python scripts/trask_print_fallback_llm.py
```

Paste or export the printed `FAST_LLM=` / `SMART_LLM=` lines into the same `.env` the headless runner loads. The script imports `vendor/llm_fallbacks/src`; install that package’s dependencies if imports fail.

### Post-report rewrite (`@openkotor/trask`)

After GPT Researcher returns a report, Trask optionally calls an **OpenAI-compatible** chat completion to tighten Discord formatting.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Primary API key |
| `OPENROUTER_API_KEY` | Used when `OPENAI_API_KEY` is unset |
| `OPENAI_BASE_URL` | e.g. `https://openrouter.ai/api/v1` |
| `OPENAI_CHAT_MODEL` | e.g. `openrouter/auto` or another routed id |
| `OPENROUTER_HTTP_REFERER` / `OPENROUTER_APP_TITLE` | OpenRouter suggested headers |
| `TRASK_REWRITE_MODEL_FALLBACKS` | Comma-separated fallback model ids if the primary rewrite fails |

If no key is configured, Trask uses a deterministic formatter (`fallbackDiscordRewrite`).

## Shared packages

`packages/trask/` exports `ResearchWizardClient` and `createResearchWizardClient`.

`packages/trask-http/` exports `createTraskHttpRouter` for any host (pazaak-bot, trask-http-server, tests).

## Persistence

- **Standalone server:** `${TRASK_HTTP_DATA_DIR}/trask-queries.json` (default `data/trask-http-server/trask-queries.json`).
- **Pazaak bot:** `${PAZAAK_DATA_DIR}/trask-queries.json`.

Uses `JsonTraskQueryRepository` from `@openkotor/persistence`.

## Next Phase

- Tighten the adapter contract with GPT Researcher for structured citations instead of formatting plain report text.
- Feature flag to hide the PazaakWorld **Ask Trask** entry when the API returns 503 at startup.

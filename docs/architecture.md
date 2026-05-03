# Architecture Snapshot

## Foundation Choices

- Runtime: Node.js 24+
- Language: TypeScript (strict, `exactOptionalPropertyTypes`)
- Discord SDK: `discord.js` 14.26.x
- Workspace tool: `pnpm` via Corepack
- Build tool: `tsc -b` project references
- Persistence bootstrap: JSON file storage (`packages/persistence`)
- Planned long-term persistence: Postgres + pgvector

## Apps

### Trask (`apps/trask-bot`)

Purpose: guild-first KOTOR q&a and troubleshooting.

Commands: `/ask`, `/sources`, `/queue-reindex`.

Current implementation: `/ask` runs the vendored **headless GPT Researcher** Python entrypoint
(`trask_headless_research.py`, same library as upstream `cli.py`), pins the request to this repo's
hardcoded approved source list, and renders the returned report into a Discord-native briefing with
inline numeric citations plus a compact `Sources` block. `/sources` remains as an admin-facing policy
inspection command. `/queue-reindex` remains an operational ingest hook.

Config prefix: `TRASK_*`. Reads `TRASK_ALLOWED_GUILD_IDS` and `TRASK_APPROVED_CHANNEL_IDS` for scope
restrictions, plus `TRASK_GPT_RESEARCHER_ROOT`, `TRASK_GPT_RESEARCHER_PYTHON`, optional
`TRASK_GPT_RESEARCHER_SCRIPT`, and `TRASK_RESEARCHWIZARD_TIMEOUT_MS` for the research subprocess.

Next phase: tighten the vendor adapter contract, normalize source metadata further, and decide
whether ingest-worker remains a secondary indexing path or becomes maintainer-only infrastructure.

---

### HK (`apps/hk-bot`)

Purpose: curated self-role assignment.

Commands: `/designations panel`, `/designations list`, `/designations assign`,
`/designations remove`.

Components: string select menu (`hk:designation-sync`) for batch sync.

Current implementation: reads live guild roles on each request, applies diffs using Discord role
hierarchy checks, and surfaces missing or blocked roles explicitly. All changes include audit-log
reasons.

Config prefix: `HK_*`.

Next phase: persisted designation presets, onboarding message with panel link, optional
admin-only role catalog management commands.

---

### Pazaak Bot (`apps/pazaak-bot`)

Purpose: KOTOR-faithful pazaak with a fake-credit economy.

Commands: `/pazaak rules`, `/pazaak wallet`, `/pazaak daily`, `/pazaak leaderboard`,
`/pazaak challenge`, `/pazaak rivalry`.

Components: Accept/Decline challenge buttons, public board with Open Controls/Forfeit/Rematch
buttons, private ephemeral action panels with Draw/Stand/EndTurn/Play side card buttons.

Current implementation: `PazaakCoordinator` with file-backed match snapshots (`MatchStore`)
plus disk-backed wallet repository (`JsonWalletRepository`). Match state survives process
restarts. A 60-second interval auto-forfeits the active player when `PAZAAK_TURN_TIMEOUT_MS`
default 5 min) elapses without action. Wallet state (balance, wins, losses, streak,
rivalries, last daily) is persisted to JSON in `PAZAAK_DATA_DIR`.

Config prefix: `PAZAAK_*`. Configurable starting credits, daily bonus amount, daily cooldown,
and turn timeout.

Next phase: streak bonuses on daily claim, admin credit adjustment command.

---

### Ingest Worker (`apps/ingest-worker`)

Purpose: shared indexing and source refresh orchestration.

CLI commands: `list-sources`, `queue-reindex [sourceIds...]`, `reindex-now [sourceIds...]`,
`drain-queue`, `run-queue-worker [pollMs]`, `show-indexed`, `show-config`.

Current implementation:
- `queue-reindex` writes source IDs into a persisted queue file (`reindex-queue.json`) under
	`INGEST_STATE_DIR`.
- `drain-queue` runs one queue-processing pass: loads queued IDs, indexes known sources, and
	re-queues failed source IDs for retry.
- `run-queue-worker` executes the same drain logic continuously on a configurable poll interval.
- `reindex-now` performs immediate indexing without queueing.
- Source indexing fetches each source's `homeUrl` (Firecrawl markdown when configured,
	raw HTTP + HTML strip fallback otherwise), chunks text into ~500-word pieces, persists each
	chunk via `FileChunkStore`, and writes a `_index.json` manifest per source recording chunk
	count and fetch timestamp.
- A 1-second delay is applied between sources to avoid hammering external servers.

Config: reads `INGEST_STATE_DIR` and shared AI config.

Next phase: deeper multi-page crawl policies (per-source depth/path controls), GitHub README/wiki
sync, Discord channel backfill, OpenAI embeddings, and chunk storage in pgvector.

---

## Shared Packages

| Package | Purpose |
|---|---|
| `@openkotor/config` | Typed environment loading for all apps |
| `@openkotor/core` | Discord client factory, logger, `deployGuildCommands`, `deployGlobalCommands` |
| `@openkotor/discord-ui` | Embed builders (`buildInfoEmbed`, `buildSuccessEmbed`, etc.) |
| `@openkotor/personas` | Persona copy, curated HK role catalog |
| `@openkotor/persistence` | `JsonWalletRepository` with wallet, rivals, daily bonus, and balance adjustment |
| `@openkotor/retrieval` | Source registry, `FileChunkStore` with source index manifests, `ChunkSearchProvider` |

## Data Flow: Pazaak Bot Match

```
/pazaak challenge  ->  PazaakCoordinator.createChallenge()
Accept button      ->  PazaakCoordinator.acceptChallenge()
Draw/Stand/Play    ->  PazaakCoordinator.*()  (private ephemeral panel)
Match completes    ->  settleCompletedMatch() -> JsonWalletRepository.recordMatch()
Rematch button     ->  coordinator.createChallenge() -> new challenge embed
```

## Known Gaps

- Postgres and pgvector are not wired. All non-wallet persistence is file-based JSON.

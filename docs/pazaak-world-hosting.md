# PazaakWorld Hosting, Deploy, and Failover

This repository now supports a no-server baseline deployment pattern:

- Frontend: GitHub Pages
- Free API fallback: Cloudflare Worker + Durable Object
- Client failover: multiple API origins via `VITE_API_BASES`
- Final safety net: local offline practice mode in the app

## What is configured

- GitHub Pages workflow:
  - `.github/workflows/deploy-pazaakworld.yml`
  - Builds `apps/pazaak-world` and deploys `apps/pazaak-world/dist`.
  - Pins Vite `BASE` to `/bots/` for `https://openkotor.github.io/bots/`.
  - Serves the suite operator console at `/bots/` and `/community-bots`, and PazaakWorld at
    `/bots/pazaakworld`.
  - Copies `index.html` to `404.html` so direct `/bots/pazaakworld` loads resolve to the SPA.
  - Resolves optional repository variable `PAZAAK_API_BASES` during the workflow and injects it as
    `VITE_API_BASES` without requiring the variable to exist.
- Cloudflare Worker fallback API:
  - `infra/pazaak-matchmaking-worker/wrangler.toml`
  - `infra/pazaak-matchmaking-worker/src/index.ts`
  - `infra/pazaak-matchmaking-worker/README.md`
- Discord Activity support on the Worker:
  - `POST /api/auth/token` / `POST /api/token` for Activity OAuth code exchange.
  - `wss://<worker>/relay/:instanceId` for lightweight Activity instance presence.
  - The relay is intentionally non-authoritative; live Pazaak match actions still
    flow through the embedded Pazaak bot API.
- Worker deployment workflow:
  - `.github/workflows/pazaak-matchmaking-worker.yml`

## API failover strategy

The frontend API client now supports a comma-separated list of API origins:

- `VITE_API_BASES="https://primary.workers.dev,https://secondary.workers.dev"`

Behavior:

1. Request goes to the first origin.
2. On network failure or `5xx`, the client retries the next origin.
3. If all origins fail, existing offline practice paths remain usable.

If `VITE_API_BASES` is unset, the client defaults to relative `/api`.

Discord Activity token exchange can use a separate origin:

- `VITE_ACTIVITY_TOKEN_BASE="https://pazaak-matchmaking.example.workers.dev"`

If unset, the Activity auth flow uses the first `VITE_API_BASES` origin, then
falls back to same-origin `/api/auth/token`.

The optional Activity presence relay is configured separately:

- `VITE_ACTIVITY_RELAY_URL="wss://pazaak-matchmaking.example.workers.dev/relay"`

This is for Activity room presence and participant coordination only. Match
state remains on the authoritative API/WebSocket origin from `VITE_API_BASES`.

## Operator console

The Pages app also exposes a route-aware operator console on `/bots` and `/community-bots`.
It is intentionally non-secret and browser-local:

- API target controls for a primary origin plus fallback origins.
- `VITE_API_BASES` generator for Pages repository variables.
- Public and bearer-token API probes with visible status, latency, and response payloads.
- Endpoint explorer for REST, WebSocket, Discord command, and ingest worker surfaces.
- OpenAPI-style sketch export for REST routes.
- Setup runbooks for local embedded API, Pages/OAuth, Cloudflare Worker fallback, and maintenance.
- Persistent browser-local readiness checklist and accessibility toggles.

Bearer tokens typed into the console are kept only in React state for the current page session and
are not written to local storage.

## Matchmaking server choices

PazaakWorld can run with three levels of backend support:

1. **Embedded Pazaak bot API**: the full authoritative server, running inside
  `@openkotor/pazaak-bot` on `PAZAAK_API_PORT` (default `4001`). It owns WebSockets, live match
  actions, sideboards, wallets, lobbies, and Discord parity. Start it with `corepack pnpm
  dev:pazaak`.
2. **Cloudflare Worker fallback**: free public auth/session/settings/queue/lobby support via
  `infra/pazaak-matchmaking-worker`. It is suitable for sign-in, queue, lobby continuity, Discord
  Activity token exchange, and Activity presence relay, but intentionally does not run authoritative
  match simulation.
3. **Static/offline mode**: no API target. The game remains playable through local practice, but
  shared accounts, lobbies, OAuth, and multiplayer queues are unavailable.

For production, prefer a primary authoritative API origin first in `VITE_API_BASES`, then a Worker
fallback origin, then the built-in offline practice fallback.

## Cloudflare free-tier fit (research summary)

From Cloudflare docs:

- Workers Free includes `100,000` requests/day and `10ms` CPU time/invocation.
- Durable Objects are available on Free with SQLite-backed storage.
- Durable Objects Free includes `100,000` requests/day and `13,000 GB-s` duration/day.

Sources:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/

## Worker capability scope

The fallback Worker implements auth/session, profile/settings, matchmaking queue,
and basic lobby operations so users can sign in and queue without a dedicated server.

Multiplayer match simulation/action endpoints are intentionally not enabled in this
fallback service and return explicit errors. The client can continue using local
practice mode when real-time authoritative gameplay is unavailable.

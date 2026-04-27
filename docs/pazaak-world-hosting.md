# PazaakWorld Hosting, Deploy, and Failover

This repository now supports a no-server baseline deployment pattern:

- Frontend: GitHub Pages
- Free API fallback: Cloudflare Worker + Durable Object
- Client failover: multiple API origins via `VITE_API_BASES`
- Final safety net: local offline practice mode in the app

## What is configured

- GitHub Pages workflow:
  - `.github/workflows/pazaak-world-pages.yml`
  - Builds `apps/pazaak-world` and deploys `apps/pazaak-world/dist`.
  - Computes Vite `BASE` automatically for project pages vs user/org pages.
  - Injects optional `VITE_API_BASES` from repository variable `PAZAAK_API_BASES`.
- Cloudflare Worker fallback API:
  - `infra/pazaak-matchmaking-worker/wrangler.toml`
  - `infra/pazaak-matchmaking-worker/src/index.ts`
  - `infra/pazaak-matchmaking-worker/README.md`
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

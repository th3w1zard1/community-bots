# Holocron web (Trask Q&A)

Vite + React SPA served by `apps/trask-http-server` and `apps/trask-bot` as static files (`dist/`). It talks to `/api/trask/*` on the same origin by default.

## Develop

From the monorepo root (with `trask-http-server` on port 4010):

```bash
pnpm --filter @openkotor/holocron-web dev
```

Proxy target: `TRASK_HTTP_PROXY_TARGET` (default `http://127.0.0.1:4010`).

## Build

```bash
pnpm --filter @openkotor/holocron-web build
```

Output: `apps/holocron-web/dist`.

## Env

- `VITE_TRASK_API_BASE` — optional absolute API origin
- `VITE_TRASK_API_KEY` — optional build-time bearer
- `VITE_TRASK_LEGACY_SPARK=1` — legacy Spark / simulated multi-agent path
- `BASE` — Vite base path (e.g. `/bots/qa-webui/` for GitHub Pages)
- `ENABLE_SPARK=1` — enable GitHub Spark Vite plugin when deploying on Spark

See `docs/trask.md` for full Trask + Holocron setup.

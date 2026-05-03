# Matchmaking inducer (regional PaaS nodes)

This service is a **tiny reverse proxy** (HTTP + WebSocket) to your **authoritative** [Cloudflare Worker](../pazaak-matchmaking-worker/README.md). Deploy the same container to Fly.io, Render, Railway, Koyeb, etc., so `VITE_API_BASES` can list several geographic entrypoints while **one** upstream (Worker + Durable Objects) owns queues, lobbies, and match state.

## Why not five separate matchmakers?

Split-brain matchmaking across vendors without shared storage produces duplicate matches and inconsistent queues. This pattern gives you **many global edges for TLS + routing** and **one brain** (Cloudflare).

## Third-party “free GameSpy” APIs

There is **no** modern nonprofit equivalent to classic GameSpy for arbitrary indie backends. Realistic options:

| Option | Notes |
|--------|--------|
| **This repo** | Worker + DO + optional inducers (you control data). |
| **Nakama** | Open source; self-host on Fly/Railway/etc. (another stack to operate). |
| **PlayFab / Photon / etc.** | Vendor SDKs; free tiers change; not generic HTTP proxies to your Worker. |
| **Edgegap** | Docs advertise trial/free-test clusters; still a vendor integration with API keys. |

We do **not** wire a specific third-party matchmaker here; keep upstream URL configurable.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `MATCHMAKING_UPSTREAM_URL` | yes | Worker origin, e.g. `https://pazaak-matchmaking.xxx.workers.dev` (no path). |
| `PORT` | no | Listen port (default `8080`). |
| `INDUCER_REGION` | no | Label for logs / response header (e.g. `iad`, `fra`). |
| `INDUCER_PROVIDER` | no | `fly`, `render`, `railway`, `koyeb`, etc. |

## Local run

```bash
cd infra/matchmaking-inducer
npm install
MATCHMAKING_UPSTREAM_URL=https://YOUR.worker.dev INDUCER_REGION=local npm start
curl -s http://127.0.0.1:8080/inducer/health
```

## Docker

```bash
docker build -t matchmaking-inducer infra/matchmaking-inducer
docker run --rm -e MATCHMAKING_UPSTREAM_URL=https://YOUR.worker.dev -e INDUCER_REGION=docker -p 8080:8080 matchmaking-inducer
```

## Cloudflare (authority)

Deploy the Worker (not this container):

```bash
pnpm dlx wrangler deploy --config infra/pazaak-matchmaking-worker/wrangler.toml
```

Set `MATCHMAKING_UPSTREAM_URL` on every inducer to that Worker URL.

## Fly.io

```bash
cd infra/matchmaking-inducer
fly launch --no-deploy   # pick app name, region
fly secrets set MATCHMAKING_UPSTREAM_URL=https://YOUR.worker.dev
fly deploy
```

Optional: clone the app or use `fly scale count` / multiple regions per Fly docs.

## Render

Use [render.yaml](./render.yaml) from the repository root in the Render dashboard (adjust `dockerfilePath` / `dockerContext` if your repo layout differs), or create a **Web Service → Docker** pointing at this directory.

## Railway

Set project **root directory** to `infra/matchmaking-inducer`, use [railway.toml](./railway.toml), add variable `MATCHMAKING_UPSTREAM_URL`.

## Koyeb

See [koyeb.md](./koyeb.md).

## Vercel

Host **PazaakWorld static assets** on Vercel (`apps/pazaak-world`), not this Node proxy (Vercel serverless is the wrong fit for long-lived WebSocket proxy). Set **environment variable** at build time:

`VITE_API_BASES=https://fly-inducer.fly.dev,https://onrender.com/...,https://YOUR.worker.dev`

Put the **Worker last** or **first** depending on whether you want inducers tried before direct Worker (latency vs simplicity).

## Client wiring

`apps/pazaak-world` already supports comma-separated `VITE_API_BASES` ([api.ts](../../apps/pazaak-world/src/api.ts)). Each inducer must expose the **same routes** as the Worker (`/api/*`, WebSocket relay, etc.) because traffic is proxied transparently.

## GitHub Actions (CI deploy)

Workflow: [`.github/workflows/deploy-matchmaking-inducer.yml`](../../.github/workflows/deploy-matchmaking-inducer.yml).

### CLI automation (no dashboard clicking)

1. **Install Fly CLI (Windows):** `powershell -ExecutionPolicy Bypass -File scripts/install-flyctl.ps1`
2. **Copy** `matchmaking-ci.env.template` → `matchmaking-ci.env` (gitignored), fill hooks/token as you obtain them.
3. **Push secrets/vars to GitHub:** `npm run ci:bootstrap` (needs `gh auth login` with repo access).
4. **Fly locally:** after `flyctl auth login` and `flyctl tokens create deploy …`, put the token in `matchmaking-ci.env` as `FLY_API_TOKEN`, run `npm run ci:bootstrap` again, then either `npm run deploy:fly -- --create-app` (first time) or rely on CI: `npm run ci:trigger`.

| Goal | Repository configuration |
|------|---------------------------|
| **Fly.io** Docker deploy | Secret `FLY_API_TOKEN`. Variable `FLY_INDUCER_APP_NAME` (must match `fly.toml` / `fly apps create`). Variable `PAZAAK_WORKER_URL` = Worker `https://…workers.dev` origin (synced into Fly as `MATCHMAKING_UPSTREAM_URL`). Create the Fly app once locally: `fly launch` in this directory. |
| **Render** | Service connected to repo → generate **Deploy Hook** URL → secret `RENDER_INDUCER_DEPLOY_HOOK_URL`. |
| **Railway** | Service → **Deploy → Deploy Hooks** → secret `RAILWAY_INDUCER_DEPLOY_HOOK_URL`. |
| **Koyeb** | If the service exposes a redeploy webhook URL → secret `KOYEB_INDUCER_DEPLOY_HOOK_URL`. |

Jobs no-op with a notice when secrets/vars are missing (safe for forks).

## Security

- Inducers add identification headers only; they **do not** add auth. Keep Discord secrets on the Worker.
- Use HTTPS everywhere; free tiers may sleep (Render) — keep Worker in the chain for reliability.

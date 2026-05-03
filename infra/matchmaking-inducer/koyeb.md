# Koyeb deployment

1. Create an app → **Docker** → GitHub repo → set **Root directory** / **Dockerfile path** to `infra/matchmaking-inducer`.
2. Expose port **8080** (or set `PORT` if Koyeb overrides it).
3. Environment variables:
   - `MATCHMAKING_UPSTREAM_URL` — your Cloudflare Worker `https://…` origin (required).
   - `INDUCER_REGION` — e.g. `fra`, `was`, `sin` (for `X-Matchmaking-Inducer-Region`).
   - `INDUCER_PROVIDER` — `koyeb`.

Health check path: `/inducer/health`.

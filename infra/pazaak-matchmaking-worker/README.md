# Pazaak Matchmaking Worker (Free Fallback)

This Worker provides a free, deployable fallback API for PazaakWorld auth/session,
queueing, and basic lobbies. It is designed to run on Cloudflare Workers + Durable
Objects with zero server maintenance.

## Endpoints implemented

- `GET /api/ping`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/oauth/providers`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET/PUT /api/settings`
- `GET /api/leaderboard`
- `GET /api/me/history`
- `GET /api/pazaak/opponents`
- `POST /api/matchmaking/enqueue`
- `POST /api/matchmaking/leave`
- `GET /api/matchmaking/status`
- `GET /api/matchmaking/stats`
- `GET/POST /api/lobbies`
- `POST /api/lobbies/join-by-code`
- `POST /api/lobbies/:id/join`
- `POST /api/lobbies/:id/ready`
- `POST /api/lobbies/:id/status`
- `POST /api/lobbies/:id/leave`

Multiplayer match action endpoints intentionally return errors, so clients can
fall back to local play.

## Local dev

```bash
pnpm dlx wrangler dev --config infra/pazaak-matchmaking-worker/wrangler.toml
```

## Deploy

```bash
pnpm dlx wrangler deploy --config infra/pazaak-matchmaking-worker/wrangler.toml
```

After deploy, use the worker URL in `VITE_API_BASES` (comma-separated list) to
enable frontend failover.

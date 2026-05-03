# PazaakWorld Nakama backend

This local stack replaces the active PazaakWorld matchmaking/gameplay Worker path
with Nakama + Postgres. The React client talks to Nakama through
`@heroiclabs/nakama-js`; Pazaak game authority runs in the bundled TypeScript
runtime module at `modules/pazaak-world.js`.

## Local run

From the repository root:

```powershell
pnpm install
pnpm --filter @openkotor/pazaak-nakama build
docker compose -f infra/nakama/docker-compose.yml up
pnpm dev:pazaak-world
```

Nakama ports:

- `7350` HTTP and realtime socket API
- `7351` console
- `7349` gRPC

The local stack intentionally uses `defaultkey` for development. Use unique
server keys, session encryption keys, runtime HTTP keys, and managed secret
injection for any shared or production environment.

**Security:** the client uses Nakama `authenticateCustom` with an `openkotor:*`
stable id for Discord-linked accounts without a server-side token exchange in
this dev path. For production, add a `beforeAuthenticateCustom` hook (or exchange
Discord OAuth on your API and mint signed credentials) so accounts cannot be
impersonated.

**Live tournament WebSocket feeds** (`subscribeToTournaments`) still require the
legacy Worker or bot relay; Nakama RPC polling covers CRUD until a socket story
is added (e.g. Nakama realtime channel).

## Runtime surface

The bundled runtime registers:

- `pazaak_authoritative` match handler for server-owned Pazaak games.
- `pazaak.*` RPCs for profiles, settings, sideboards, lobby lifecycle,
  matchmaking queue, leaderboard/history, **tournaments** (create/join/leave/start/report/cancel), and chat.
- Authoritative MMR settlement on match completion with Nakama leaderboards.

## Cutover note

PazaakWorld no longer needs `VITE_API_BASES` for active matchmaking/gameplay
when using this stack. Configure the client with:

```env
VITE_PAZAAK_BACKEND=nakama
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_USE_SSL=false
VITE_NAKAMA_SERVER_KEY=defaultkey
# Optional: Trask + legacy OAuth still hit the bot HTTP API:
# VITE_LEGACY_HTTP_ORIGIN=http://localhost:4001
```

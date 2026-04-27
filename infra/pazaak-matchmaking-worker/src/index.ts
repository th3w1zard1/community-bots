interface Env {
  COORDINATOR: DurableObjectNamespace;
  SERVICE_NAME?: string;
}

type Json = Record<string, unknown>;

type AccountState = {
  accountId: string;
  username: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  mmr: number;
};

type SessionState = {
  sessionId: string;
  token: string;
  accountId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

type QueueEntry = {
  userId: string;
  displayName: string;
  mmr: number;
  preferredMaxPlayers: number;
  enqueuedAt: string;
};

type LobbyPlayer = {
  userId: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  isAi: boolean;
  joinedAt: string;
};

type LobbyRecord = {
  id: string;
  lobbyCode: string;
  name: string;
  hostUserId: string;
  maxPlayers: number;
  tableSettings: {
    variant: "canonical" | "multi_seat";
    maxPlayers: number;
    maxRounds: number;
    turnTimerSeconds: number;
    ranked: boolean;
    allowAiFill: boolean;
    sideboardMode: "runtime_random" | "player_active_custom" | "host_mirror_custom";
  };
  passwordHash: string | null;
  status: "waiting" | "matchmaking" | "in_game" | "closed";
  matchId: string | null;
  players: LobbyPlayer[];
  createdAt: string;
  updatedAt: string;
};

type StorageShape = {
  accounts: Record<string, AccountState>;
  sessions: Record<string, SessionState>;
  queue: QueueEntry[];
  lobbies: LobbyRecord[];
};

const DEFAULT_SETTINGS = {
  theme: "kotor",
  soundEnabled: true,
  reducedMotionEnabled: false,
  turnTimerSeconds: 45,
  preferredAiDifficulty: "normal",
};

const OAUTH_PROVIDERS = {
  providers: [
    { provider: "google", enabled: false },
    { provider: "discord", enabled: false },
    { provider: "github", enabled: false },
  ],
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function empty(status = 204): Response {
  return new Response(null, { status, headers: corsHeaders });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function nowIso(): string {
  return new Date().toISOString();
}

function plusDaysIso(days: number): string {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function parseAuthToken(req: Request): string | null {
  const value = req.headers.get("authorization");
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function toSlug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "guest";
}

function randomCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return empty();

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return error("Not found", 404);
    }

    const id = env.COORDINATOR.idFromName("global");
    const stub = env.COORDINATOR.get(id);
    return stub.fetch(request);
  },
};

export class MatchCoordinator extends DurableObject<Env> {
  private loaded: StorageShape | null = null;

  private async readState(): Promise<StorageShape> {
    if (this.loaded) return this.loaded;
    const existing = await this.ctx.storage.get<StorageShape>("state");
    this.loaded = existing ?? {
      accounts: {},
      sessions: {},
      queue: [],
      lobbies: [],
    };
    return this.loaded;
  }

  private async persist(state: StorageShape): Promise<void> {
    this.loaded = state;
    await this.ctx.storage.put("state", state);
  }

  private resolveSession(token: string | null, state: StorageShape): { account: AccountState; session: SessionState } | null {
    if (!token) return null;
    const session = state.sessions[token];
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
    const account = state.accounts[session.accountId];
    if (!account) return null;
    return { account, session };
  }

  private buildWallet(account: AccountState): Json {
    return {
      userId: account.accountId,
      displayName: account.displayName,
      preferredRuntimeDeckId: null,
      balance: 1000,
      wins: 0,
      losses: 0,
      mmr: account.mmr,
      gamesPlayed: 0,
      gamesWon: 0,
      lastMatchAt: null,
      userSettings: DEFAULT_SETTINGS,
      streak: 0,
      bestStreak: 0,
      lastDailyAt: null,
      updatedAt: nowIso(),
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return empty();

    const state = await this.readState();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/ping" && (request.method === "GET" || request.method === "HEAD")) {
      return empty();
    }

    if (path === "/api/auth/oauth/providers" && request.method === "GET") {
      return json(OAUTH_PROVIDERS);
    }

    if ((path === "/api/auth/register" || path === "/api/auth/login") && request.method === "POST") {
      const body = await request.json<Json>().catch(() => ({}));
      const identifier = String(body.identifier ?? body.username ?? body.displayName ?? "guest");
      const displayName = String(body.displayName ?? identifier ?? "Guest Pilot").slice(0, 48) || "Guest Pilot";
      const username = toSlug(String(body.username ?? identifier)).slice(0, 32);
      const email = typeof body.email === "string" && body.email.includes("@") ? body.email : null;

      let account = Object.values(state.accounts).find((candidate) => candidate.username === username || candidate.email === email);
      if (!account) {
        const createdAt = nowIso();
        account = {
          accountId: crypto.randomUUID(),
          username,
          displayName,
          email,
          createdAt,
          updatedAt: createdAt,
          mmr: 1000,
        };
        state.accounts[account.accountId] = account;
      }

      const createdAt = nowIso();
      const token = crypto.randomUUID();
      const session: SessionState = {
        sessionId: crypto.randomUUID(),
        token,
        accountId: account.accountId,
        createdAt,
        lastUsedAt: createdAt,
        expiresAt: plusDaysIso(30),
      };
      state.sessions[token] = session;
      account.updatedAt = createdAt;

      await this.persist(state);

      return json({
        app_token: token,
        token_type: "Bearer",
        account: {
          accountId: account.accountId,
          username: account.username,
          displayName: account.displayName,
          email: account.email,
          legacyGameUserId: null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
        session: {
          sessionId: session.sessionId,
          accountId: account.accountId,
          label: null,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          expiresAt: session.expiresAt,
        },
        linkedIdentities: [],
      });
    }

    const authed = this.resolveSession(parseAuthToken(request), state);
    if (!authed) {
      return error("Unauthorized", 401);
    }

    authed.session.lastUsedAt = nowIso();

    if (path === "/api/auth/logout" && request.method === "POST") {
      delete state.sessions[authed.session.token];
      await this.persist(state);
      return json({ ok: true });
    }

    if (path === "/api/auth/session" && request.method === "GET") {
      await this.persist(state);
      return json({
        account: {
          accountId: authed.account.accountId,
          username: authed.account.username,
          displayName: authed.account.displayName,
          email: authed.account.email,
          legacyGameUserId: null,
          createdAt: authed.account.createdAt,
          updatedAt: authed.account.updatedAt,
        },
        linkedIdentities: [],
      });
    }

    if (path === "/api/me" && request.method === "GET") {
      const queue = state.queue.find((entry) => entry.userId === authed.account.accountId) ?? null;
      await this.persist(state);
      return json({
        user: {
          id: authed.account.accountId,
          username: authed.account.username,
          displayName: authed.account.displayName,
        },
        wallet: this.buildWallet(authed.account),
        queue,
        match: null,
      });
    }

    if (path === "/api/settings" && request.method === "GET") {
      await this.persist(state);
      return json({ settings: DEFAULT_SETTINGS, wallet: this.buildWallet(authed.account) });
    }

    if (path === "/api/settings" && request.method === "PUT") {
      await request.text();
      await this.persist(state);
      return json({ settings: DEFAULT_SETTINGS, wallet: this.buildWallet(authed.account) });
    }

    if (path === "/api/leaderboard" && request.method === "GET") {
      return json({ leaders: [] });
    }

    if (path === "/api/me/history" && request.method === "GET") {
      return json({ history: [] });
    }

    if (path === "/api/pazaak/opponents" && request.method === "GET") {
      return json({ opponents: [], serverTime: nowIso() });
    }

    if (path === "/api/matchmaking/enqueue" && request.method === "POST") {
      const payload = await request.json<Json>().catch(() => ({}));
      const preferredMaxPlayers = Number(payload.preferredMaxPlayers ?? 2);
      state.queue = state.queue.filter((entry) => entry.userId !== authed.account.accountId);
      const entry: QueueEntry = {
        userId: authed.account.accountId,
        displayName: authed.account.displayName,
        mmr: authed.account.mmr,
        preferredMaxPlayers: Number.isFinite(preferredMaxPlayers) ? Math.max(2, Math.min(8, preferredMaxPlayers)) : 2,
        enqueuedAt: nowIso(),
      };
      state.queue.push(entry);
      await this.persist(state);
      return json({ queue: entry });
    }

    if (path === "/api/matchmaking/leave" && request.method === "POST") {
      const before = state.queue.length;
      state.queue = state.queue.filter((entry) => entry.userId !== authed.account.accountId);
      await this.persist(state);
      return json({ removed: state.queue.length < before });
    }

    if (path === "/api/matchmaking/status" && request.method === "GET") {
      const queue = state.queue.find((entry) => entry.userId === authed.account.accountId) ?? null;
      return json({ queue });
    }

    if (path === "/api/matchmaking/stats" && request.method === "GET") {
      return json({
        playersInQueue: state.queue.length,
        openLobbies: state.lobbies.filter((lobby) => lobby.status === "waiting").length,
        activeGames: 0,
        averageWaitSeconds: 12,
        averageWaitTime: "~12s",
        queueUpdatedAt: nowIso(),
      });
    }

    if (path === "/api/lobbies" && request.method === "GET") {
      return json({ lobbies: state.lobbies });
    }

    if (path === "/api/lobbies" && request.method === "POST") {
      const payload = await request.json<Json>().catch(() => ({}));
      const createdAt = nowIso();
      const lobbyId = crypto.randomUUID();
      const maxPlayers = Math.max(2, Math.min(8, Number(payload.maxPlayers ?? 2) || 2));
      const lobby: LobbyRecord = {
        id: lobbyId,
        lobbyCode: randomCode(6),
        name: String(payload.name ?? `${authed.account.displayName}'s Lobby`).slice(0, 64),
        hostUserId: authed.account.accountId,
        maxPlayers,
        tableSettings: {
          variant: payload.variant === "multi_seat" ? "multi_seat" : "canonical",
          maxPlayers,
          maxRounds: Math.max(1, Math.min(5, Number(payload.maxRounds ?? 3) || 3)),
          turnTimerSeconds: Math.max(10, Math.min(120, Number(payload.turnTimerSeconds ?? 45) || 45)),
          ranked: Boolean(payload.ranked),
          allowAiFill: Boolean(payload.allowAiFill),
          sideboardMode: payload.sideboardMode === "player_active_custom" || payload.sideboardMode === "host_mirror_custom"
            ? payload.sideboardMode
            : "runtime_random",
        },
        passwordHash: typeof payload.password === "string" && payload.password.length > 0 ? "set" : null,
        status: "waiting",
        matchId: null,
        players: [
          {
            userId: authed.account.accountId,
            displayName: authed.account.displayName,
            ready: false,
            isHost: true,
            isAi: false,
            joinedAt: createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      };
      state.lobbies.unshift(lobby);
      await this.persist(state);
      return json({ lobby });
    }

    if (path === "/api/lobbies/join-by-code" && request.method === "POST") {
      const payload = await request.json<Json>().catch(() => ({}));
      const lobbyCode = String(payload.lobbyCode ?? "").toUpperCase();
      const lobby = state.lobbies.find((candidate) => candidate.lobbyCode === lobbyCode);
      if (!lobby) return error("Lobby not found", 404);
      const existing = lobby.players.find((player) => player.userId === authed.account.accountId);
      if (!existing && lobby.players.length < lobby.maxPlayers) {
        lobby.players.push({
          userId: authed.account.accountId,
          displayName: authed.account.displayName,
          ready: false,
          isHost: false,
          isAi: false,
          joinedAt: nowIso(),
        });
        lobby.updatedAt = nowIso();
      }
      await this.persist(state);
      return json({ lobby });
    }

    const lobbyJoinMatch = path.match(/^\/api\/lobbies\/([^/]+)\/join$/);
    if (lobbyJoinMatch && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyJoinMatch[1]);
      const lobby = state.lobbies.find((candidate) => candidate.id === lobbyId);
      if (!lobby) return error("Lobby not found", 404);
      const existing = lobby.players.find((player) => player.userId === authed.account.accountId);
      if (!existing && lobby.players.length < lobby.maxPlayers) {
        lobby.players.push({
          userId: authed.account.accountId,
          displayName: authed.account.displayName,
          ready: false,
          isHost: false,
          isAi: false,
          joinedAt: nowIso(),
        });
        lobby.updatedAt = nowIso();
      }
      await this.persist(state);
      return json({ lobby });
    }

    const lobbyReadyMatch = path.match(/^\/api\/lobbies\/([^/]+)\/ready$/);
    if (lobbyReadyMatch && request.method === "POST") {
      const payload = await request.json<Json>().catch(() => ({}));
      const lobby = state.lobbies.find((candidate) => candidate.id === decodeURIComponent(lobbyReadyMatch[1]));
      if (!lobby) return error("Lobby not found", 404);
      const player = lobby.players.find((candidate) => candidate.userId === authed.account.accountId);
      if (player) player.ready = Boolean(payload.ready);
      lobby.updatedAt = nowIso();
      await this.persist(state);
      return json({ lobby });
    }

    const lobbyStatusMatch = path.match(/^\/api\/lobbies\/([^/]+)\/status$/);
    if (lobbyStatusMatch && request.method === "POST") {
      const payload = await request.json<Json>().catch(() => ({}));
      const lobby = state.lobbies.find((candidate) => candidate.id === decodeURIComponent(lobbyStatusMatch[1]));
      if (!lobby) return error("Lobby not found", 404);
      lobby.status = payload.status === "matchmaking" ? "matchmaking" : "waiting";
      lobby.updatedAt = nowIso();
      await this.persist(state);
      return json({ lobby });
    }

    const lobbyLeaveMatch = path.match(/^\/api\/lobbies\/([^/]+)\/leave$/);
    if (lobbyLeaveMatch && request.method === "POST") {
      const lobby = state.lobbies.find((candidate) => candidate.id === decodeURIComponent(lobbyLeaveMatch[1]));
      if (!lobby) return json({ lobby: null });
      lobby.players = lobby.players.filter((player) => player.userId !== authed.account.accountId);
      if (lobby.players.length === 0) {
        state.lobbies = state.lobbies.filter((candidate) => candidate.id !== lobby.id);
        await this.persist(state);
        return json({ lobby: null });
      }
      if (!lobby.players.some((player) => player.isHost)) {
        lobby.players[0].isHost = true;
        lobby.hostUserId = lobby.players[0].userId;
      }
      lobby.updatedAt = nowIso();
      await this.persist(state);
      return json({ lobby });
    }

    const lobbyStartMatch = path.match(/^\/api\/lobbies\/([^/]+)\/start$/);
    if (lobbyStartMatch && request.method === "POST") {
      return error("Multiplayer match hosting is not enabled on this free fallback backend.", 409);
    }

    if (path === "/api/match/me" && request.method === "GET") {
      return error("No active match", 404);
    }

    if (path.startsWith("/api/match/") && request.method === "GET") {
      return error("Match not found", 404);
    }

    return error("Not found", 404);
  }
}

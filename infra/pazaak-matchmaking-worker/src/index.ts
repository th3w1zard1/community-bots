import {
  buildSocialAuthAuthorizeUrl,
  createObjectEnvLookup,
  fetchDiscordSocialAuthProfile,
  fetchGithubSocialAuthProfile,
  fetchGoogleSocialAuthProfile,
  listSocialAuthProviders,
} from "@openkotor/platform/oauth";
import {
  advanceTournament,
  buildBracketView,
  computeSwissStandings,
  createTournament,
  registerParticipant,
  startTournament,
  withdrawParticipant,
  type TournamentFormat,
  type TournamentState,
} from "@openkotor/pazaak-tournament";
import type { SerializedMatch } from "@openkotor/pazaak-engine";
import {
  deepMergePolicy,
  loadPazaakOpsPolicy,
  parsePolicyJson,
  toPublicConfig,
  type PazaakOpsPolicy,
} from "@openkotor/pazaak-policy";

import { MatchActor } from "./match-actor.js";

export { MatchActor };

interface Env {
  COORDINATOR: DurableObjectNamespace;
  RELAY_ROOM: DurableObjectNamespace;
  MATCH_ACTOR: DurableObjectNamespace;
  SERVICE_NAME?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_BOT_TOKEN?: string;
  ALLOW_UNVERIFIED_INSTANCES?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  PUBLIC_WEB_ORIGIN?: string;
  PAZAAK_POLICY_JSON?: string;
  ADMIN_USER_IDS?: string;
  PAZAAK_TURN_TIMEOUT_MS?: string;
  PAZAAK_DISCONNECT_FORFEIT_MS?: string;
  PAZAAK_BOT_SYNC_SECRET?: string;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type Json = Record<string, JsonValue>;

type AccountState = {
  accountId: string;
  username: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  mmr: number;
  /** Matches persistence default (Chess.com-style high RD for new accounts). */
  mmrRd?: number;
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
  preferredRegions: string[];
  enqueuedAtMs: number;
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
    gameMode: "canonical" | "wacky";
  };
  passwordHash: string | null;
  status: "waiting" | "matchmaking" | "in_game" | "closed";
  matchId: string | null;
  players: LobbyPlayer[];
  createdAt: string;
  updatedAt: string;
};

type PolicyRuntimeState = {
  blob: unknown;
  etag: string;
  updatedAt: string;
};

type AuditEntry = {
  at: string;
  actorId: string;
  action: string;
  detail: JsonValue | null;
};

type StorageShape = {
  accounts: Record<string, AccountState>;
  sessions: Record<string, SessionState>;
  queue: QueueEntry[];
  lobbies: LobbyRecord[];
  tournaments: Record<string, TournamentState>;
  oauthStates: Record<string, { provider: string; expiresAt: number; pendingMatchId?: string }>;
  policyRuntime?: PolicyRuntimeState;
  auditLog?: AuditEntry[];
};

type RelayMember = {
  ws: WebSocket;
  userId: string;
  username: string;
  seatIndex: number;
  color: string;
};

type RelayVerifyEntry = {
  ok: boolean;
  expiresAt: number;
};

const DEFAULT_SETTINGS = {
  theme: "kotor",
  soundEnabled: true,
  reducedMotionEnabled: false,
  turnTimerSeconds: 45,
  preferredAiDifficulty: "normal",
};

function getOauthProviders(env: Env): { providers: Array<{ provider: string; enabled: boolean }> } {
  return {
    providers: listSocialAuthProviders(createObjectEnvLookup(env)).map((entry) => ({
      provider: entry.provider,
      enabled: entry.enabled,
    })),
  };
}

const DISCORD_API = "https://discord.com/api/v10";
const RELAY_SEAT_COLORS = ["#ff6b6b", "#4dd0ff", "#9cff7a", "#ffd166"];
const RELAY_VERIFY_TTL_MS = 30_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function json(data: JsonValue | object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function readLobbyWackyGameMode(payload: Json): boolean {
  if (payload.gameMode === "wacky") {
    return true;
  }
  const tableSettings = payload.tableSettings;
  if (tableSettings !== null && typeof tableSettings === "object" && !Array.isArray(tableSettings)) {
    const gm = (tableSettings as Record<string, JsonValue>).gameMode;
    return gm === "wacky";
  }
  return false;
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

function envToRecord(env: Env): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = typeof value === "string" ? value : undefined;
  }
  return out;
}

function resolvePolicy(env: Env, state: StorageShape): PazaakOpsPolicy {
  return loadPazaakOpsPolicy(envToRecord(env), { jsonOverride: state.policyRuntime?.blob });
}

function isAdminAccount(accountId: string, policy: PazaakOpsPolicy, env: Env): boolean {
  const extra = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return policy.admin.discordUserAllowlist.includes(accountId) || extra.includes(accountId);
}

function pickLocationHint(ra: string[], rb: string[], policy: PazaakOpsPolicy): string | undefined {
  const regs = policy.matchmaking.regions;
  const hintOf = (id: string) => regs.find((r) => r.id === id)?.locationHint;
  const shared = ra.find((r) => r !== "auto" && rb.includes(r));
  if (shared) {
    return hintOf(shared);
  }
  const nonAuto = ra.concat(rb).find((r) => r !== "auto");
  if (nonAuto) {
    return hintOf(nonAuto);
  }
  return hintOf(policy.matchmaking.defaultRegionId) ?? hintOf("enam");
}

function pushAudit(state: StorageShape, actorId: string, action: string, detail: JsonValue | null): void {
  const log = state.auditLog ?? [];
  log.push({ at: nowIso(), actorId, action, detail });
  state.auditLog = log.slice(-200);
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

async function handleDiscordTokenExchange(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed", 405);
  }

  const body = await request.json<Json>().catch(() => ({} as Json));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return error("Missing authorization code", 400);
  }

  const clientId = env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return error("Discord token exchange is not configured", 500);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
  });
  const redirectUri = env.DISCORD_REDIRECT_URI?.trim();
  if (redirectUri) {
    params.set("redirect_uri", redirectUri);
  }

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({ error: "Invalid Discord token response" })) as JsonValue;
  return json(payload, response.status);
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

// ---------------------------------------------------------------------------
// OAuth state store (in-memory, 10-min TTL). Workers are single-threaded so
// a module-level Map is safe here for a single-instance deployment.
// ---------------------------------------------------------------------------
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const workerOauthStates = new Map<string, { provider: string; expiresAt: number; pendingMatchId?: string }>();

function createWorkerOauthState(provider: string, pendingMatchId?: string): string {
  const now = Date.now();
  // Prune expired entries first
  for (const [k, v] of workerOauthStates) {
    if (v.expiresAt <= now) workerOauthStates.delete(k);
  }
  const state = crypto.randomUUID().replace(/-/g, "");
  workerOauthStates.set(state, { provider, expiresAt: now + OAUTH_STATE_TTL_MS, pendingMatchId });
  return state;
}

function consumeWorkerOauthState(state: string, provider: string): { pendingMatchId?: string } | null {
  const entry = workerOauthStates.get(state);
  workerOauthStates.delete(state);
  if (!entry || entry.expiresAt <= Date.now() || entry.provider !== provider) return null;
  return { pendingMatchId: entry.pendingMatchId };
}

function buildProviderAuthorizeUrl(provider: string, state: string, env: Env, callbackBase: string): string {
  if (provider !== "discord" && provider !== "github" && provider !== "google") {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return buildSocialAuthAuthorizeUrl(provider, {
    clientId: provider === "discord"
      ? env.DISCORD_CLIENT_ID ?? ""
      : provider === "github"
        ? env.GITHUB_CLIENT_ID ?? ""
        : env.GOOGLE_CLIENT_ID ?? "",
    redirectUri: provider === "discord"
      ? (env.DISCORD_REDIRECT_URI?.trim() || `${callbackBase}/api/auth/oauth/discord/callback`)
      : provider === "github"
        ? (env.GITHUB_REDIRECT_URI?.trim() || `${callbackBase}/api/auth/oauth/github/callback`)
        : (env.GOOGLE_REDIRECT_URI?.trim() || `${callbackBase}/api/auth/oauth/google/callback`),
    state,
  }, {
    discordApiBase: DISCORD_API,
  });
}

const SOCIAL_PROVIDERS = ["discord", "github", "google"] as const;

async function handleOauthStart(request: Request, env: Env, provider: string, callbackBase: string): Promise<Response> {
  if (request.method !== "POST") return error("Method not allowed", 405);
  let pendingMatchId: string | undefined;
  try {
    const body = await request.json<Json>();
    if (typeof body.matchId === "string" && body.matchId.trim()) pendingMatchId = body.matchId.trim();
  } catch { /* body may be empty */ }
  const state = createWorkerOauthState(provider, pendingMatchId);
  const redirectUrl = buildProviderAuthorizeUrl(provider, state, env, callbackBase);
  return json({ provider, redirectUrl });
}

async function handleOauthCallback(request: Request, env: Env, provider: string, callbackBase: string, coordinatorStub: { fetch(req: Request): Promise<Response> }): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error") ?? "";
  const landingBase = env.PUBLIC_WEB_ORIGIN?.trim() || callbackBase;
  const redirect = new URL("/", landingBase);

  if (oauthError) {
    redirect.searchParams.set("oauth_error", oauthError);
    return Response.redirect(redirect.toString(), 302);
  }

  if (!code || !state) {
    redirect.searchParams.set("oauth_error", "missing_code_or_state");
    return Response.redirect(redirect.toString(), 302);
  }

  const pending = consumeWorkerOauthState(state, provider);
  if (!pending) {
    redirect.searchParams.set("oauth_error", "invalid_or_expired_state");
    return Response.redirect(redirect.toString(), 302);
  }

  try {
    let profile: { providerUserId: string; username: string; displayName: string; email: string | null };
    if (provider === "discord") {
      profile = await fetchDiscordSocialAuthProfile(code, {
        clientId: env.DISCORD_CLIENT_ID!,
        clientSecret: env.DISCORD_CLIENT_SECRET!,
        redirectUri: env.DISCORD_REDIRECT_URI?.trim() ?? "",
      }, {
        discordApiBase: DISCORD_API,
      });
    } else if (provider === "github") {
      profile = await fetchGithubSocialAuthProfile(code, {
        clientId: env.GITHUB_CLIENT_ID!,
        clientSecret: env.GITHUB_CLIENT_SECRET!,
        redirectUri: env.GITHUB_REDIRECT_URI?.trim() ?? "",
      }, {
        userAgent: "PazaakWorld/1.0",
      });
    } else {
      profile = await fetchGoogleSocialAuthProfile(code, {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        redirectUri: env.GOOGLE_REDIRECT_URI?.trim() || `${callbackBase}/api/auth/oauth/google/callback`,
      });
    }

    // Delegate account creation to the Coordinator DO
    const ensureRes = await coordinatorStub.fetch(new Request("http://internal/api/auth/oauth/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...profile }),
    }));
    const ensureData = await ensureRes.json<{ app_token?: string; displayName?: string; userId?: string; error?: string }>();
    if (!ensureData.app_token) {
      throw new Error(ensureData.error ?? "Account creation failed");
    }

    redirect.searchParams.set("oauth_provider", provider);
    redirect.searchParams.set("oauth_app_token", ensureData.app_token);
    redirect.searchParams.set("oauth_username", ensureData.displayName ?? profile.displayName);
    redirect.searchParams.set("oauth_user_id", ensureData.userId ?? profile.providerUserId);
    if (pending.pendingMatchId) redirect.searchParams.set("matchId", pending.pendingMatchId);
    return Response.redirect(redirect.toString(), 302);
  } catch (err) {
    redirect.searchParams.set("oauth_error", err instanceof Error ? err.message : String(err));
    return Response.redirect(redirect.toString(), 302);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return empty();

    const url = new URL(request.url);
    const callbackBase = `${url.protocol}//${url.host}`;

    if (url.pathname === "/api/auth/token" || url.pathname === "/api/token") {
      return handleDiscordTokenExchange(request, env);
    }

    if (url.pathname.startsWith("/relay")) {
      if (!isWebSocketUpgrade(request)) {
        return error("Expected WebSocket upgrade", 426);
      }

      const roomName = url.pathname.replace(/^\/relay\/?/, "").split("/").filter(Boolean)[0] ?? "lobby";
      const id = env.RELAY_ROOM.idFromName(roomName);
      const stub = env.RELAY_ROOM.get(id);
      return stub.fetch(request);
    }

    // Activity clients subscribe to a tournament broadcast room without the
    // Discord-activity instance verification requirements.
    if (url.pathname.startsWith("/ws/tournaments/")) {
      if (!isWebSocketUpgrade(request)) {
        return error("Expected WebSocket upgrade", 426);
      }
      const tournamentId = url.pathname.replace(/^\/ws\/tournaments\/?/, "").split("/").filter(Boolean)[0] ?? "";
      if (!tournamentId) return error("Missing tournament id", 400);
      const id = env.RELAY_ROOM.idFromName(`tournament:${tournamentId}`);
      const stub = env.RELAY_ROOM.get(id);
      return stub.fetch(request);
    }

    if (!url.pathname.startsWith("/api/")) {
      return error("Not found", 404);
    }

    const id = env.COORDINATOR.idFromName("global");
    const stub = env.COORDINATOR.get(id);

    // OAuth providers list — resolved dynamically from env secrets
    if (url.pathname === "/api/auth/oauth/providers" && request.method === "GET") {
      return json(getOauthProviders(env));
    }

    // OAuth start — handled here so we have env access for client IDs
    const oauthStartMatch = url.pathname.match(/^\/api\/auth\/oauth\/([a-z]+)\/start$/);
    if (oauthStartMatch) {
      const provider = oauthStartMatch[1];
      if (!(SOCIAL_PROVIDERS as readonly string[]).includes(provider)) {
        return error("Unsupported OAuth provider.", 404);
      }
      const providers = getOauthProviders(env).providers;
      if (!providers.find((p) => p.provider === provider)?.enabled) {
        return error(`OAuth provider ${provider} is not configured on this server.`, 501);
      }
      return handleOauthStart(request, env, provider, callbackBase);
    }

    // OAuth callback — handled here so we can redirect to the frontend
    const oauthCallbackMatch = url.pathname.match(/^\/api\/auth\/oauth\/([a-z]+)\/callback$/);
    if (oauthCallbackMatch && request.method === "GET") {
      const provider = oauthCallbackMatch[1];
      if (!(SOCIAL_PROVIDERS as readonly string[]).includes(provider)) {
        return error("Unsupported OAuth provider.", 404);
      }
      return handleOauthCallback(request, env, provider, callbackBase, stub);
    }

    if (url.pathname === "/api/bot-match-sync" && request.method === "POST") {
      const secret = env.PAZAAK_BOT_SYNC_SECRET?.trim();
      const header = request.headers.get("x-pazaak-sync-secret")?.trim();
      if (!secret || header !== secret) {
        return error("Forbidden", 403);
      }
      if (!env.MATCH_ACTOR) {
        return error("Match actor unavailable", 501);
      }
      let body: { matchId?: string; snapshot?: SerializedMatch };
      try {
        body = (await request.json()) as { matchId?: string; snapshot?: SerializedMatch };
      } catch {
        return error("Invalid JSON", 400);
      }
      const matchId = String(body.matchId ?? "").trim();
      if (!matchId || !body.snapshot) {
        return error("matchId and snapshot required", 400);
      }
      const namespace = env.MATCH_ACTOR;
      const actorStub = namespace.get(namespace.idFromName(matchId));
      return actorStub.fetch(
        new Request("http://internal/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: body.snapshot }),
        }),
      );
    }

    const matchRoute = url.pathname.match(/^\/api\/matches\/([^/]+)\/(state|command)$/);
    if (matchRoute && env.MATCH_ACTOR) {
      const matchId = decodeURIComponent(matchRoute[1] ?? "");
      const sub = matchRoute[2] ?? "";
      if (!matchId) {
        return error("Missing match id", 400);
      }
      const namespace = env.MATCH_ACTOR;
      const actorStub = namespace.get(namespace.idFromName(matchId));
      const suffix = sub === "state" ? `/state${url.search}` : "/command";
      return actorStub.fetch(
        new Request(`http://internal${suffix}`, {
          method: request.method,
          headers: request.headers,
          body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        }),
      );
    }

    return stub.fetch(request);
  },
};

export class PazaakRelayRoom {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private readonly members = new Map<string, RelayMember>();
  private readonly subscribers = new Set<WebSocket>();
  private readonly verifyCache = new Map<string, RelayVerifyEntry>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) {
      // Internal broadcast endpoint so the Coordinator DO can push tournament
      // events to every subscribed WebSocket client.
      const url = new URL(request.url);
      if (url.pathname === "/broadcast" && request.method === "POST") {
        let payload: JsonValue;
        try {
          payload = await request.json<JsonValue>();
        } catch {
          return error("Invalid broadcast payload", 400);
        }
        this.broadcast(payload);
        return json({ ok: true });
      }
      return error("Expected WebSocket upgrade", 426);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    this.subscribers.add(server);
    server.addEventListener("message", (event: MessageEvent) => {
      void this.handleMessage(server, String(event.data));
    });
    server.addEventListener("close", () => this.handleClose(server));
    server.addEventListener("error", () => this.handleClose(server));

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    const message = parseRelayMessage(raw);
    if (!message) {
      return;
    }

    if (message.type === "join") {
      const instanceId = getRelayString(message.instanceId);
      const userId = getRelayString(message.userId);
      const username = getRelayString(message.username) || "Player";
      if (!instanceId || !userId) {
        this.reject(ws, "missing-instance-or-user");
        return;
      }

      const verified = await this.verifyParticipant(instanceId, userId);
      if (!verified) {
        this.reject(ws, "instance-not-verified");
        return;
      }

      const seatIndex = this.pickSeat();
      const color = RELAY_SEAT_COLORS[seatIndex] ?? "#cfd8dc";
      this.members.set(userId, { ws, userId, username, seatIndex, color });
      this.send(ws, { type: "welcome", instanceId, userId, username, seat: seatIndex, color });
      this.broadcastPresence();
      return;
    }

    const member = this.findMember(ws);
    if (!member) {
      return;
    }

    if (message.type === "ping") {
      this.send(ws, { type: "pong", at: Date.now() });
      return;
    }

    if (message.type === "presence") {
      this.broadcastPresence();
      return;
    }

    if (message.type === "relay") {
      this.broadcast({ type: "relay", from: { userId: member.userId, username: member.username }, payload: message.payload ?? null }, ws);
    }
  }

  private handleClose(ws: WebSocket): void {
    this.subscribers.delete(ws);
    const entry = [...this.members.entries()].find(([, member]) => member.ws === ws);
    if (!entry) {
      return;
    }

    this.members.delete(entry[0]);
    this.broadcastPresence();
  }

  private async verifyParticipant(instanceId: string, userId: string): Promise<boolean> {
    if (instanceId.startsWith("local-") || instanceId.startsWith("dev-") || instanceId.startsWith("match-")) {
      return true;
    }

    if (this.env.ALLOW_UNVERIFIED_INSTANCES === "1") {
      return true;
    }

    const clientId = this.env.DISCORD_CLIENT_ID?.trim();
    const botToken = this.env.DISCORD_BOT_TOKEN?.trim();
    if (!clientId || !botToken) {
      return false;
    }

    const key = `${instanceId}:${userId}`;
    const cached = this.verifyCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ok;
    }

    let ok = false;
    try {
      const response = await fetch(`${DISCORD_API}/applications/${clientId}/activity-instances/${instanceId}`, {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (response.ok) {
        const payload = await response.json() as { users?: string[] };
        ok = Array.isArray(payload.users) && payload.users.includes(userId);
      }
    } catch {
      ok = false;
    }

    this.verifyCache.set(key, { ok, expiresAt: Date.now() + RELAY_VERIFY_TTL_MS });
    return ok;
  }

  private pickSeat(): number {
    const used = new Set([...this.members.values()].map((member) => member.seatIndex));
    for (let index = 0; index < RELAY_SEAT_COLORS.length; index += 1) {
      if (!used.has(index)) {
        return index;
      }
    }

    return this.members.size;
  }

  private findMember(ws: WebSocket): RelayMember | null {
    return [...this.members.values()].find((member) => member.ws === ws) ?? null;
  }

  private broadcastPresence(): void {
    this.broadcast({
      type: "presence",
      members: [...this.members.values()].map((member) => ({
        userId: member.userId,
        username: member.username,
        seat: member.seatIndex,
        color: member.color,
      })),
    });
  }

  private broadcast(message: JsonValue, except?: WebSocket): void {
    // Broadcast to every connected socket (members + plain subscribers) so
    // tournament-subscription clients without an activity `join` still get
    // events. `members` is a subset of `subscribers` once the socket joins,
    // so iterating the subscriber set alone covers everyone.
    for (const ws of this.subscribers) {
      if (ws !== except) {
        this.send(ws, message);
      }
    }
  }

  private send(ws: WebSocket, message: JsonValue): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Ignore closed sockets.
    }
  }

  private reject(ws: WebSocket, reason: string): void {
    this.send(ws, { type: "error", reason });
    try {
      ws.close(1008, reason);
    } catch {
      // Ignore closed sockets.
    }
  }
}

function parseRelayMessage(raw: string): Record<string, JsonValue> | null {
  try {
    const value = JSON.parse(raw) as JsonValue;
    return value && typeof value === "object" ? value as Record<string, JsonValue> : null;
  } catch {
    return null;
  }
}

function getRelayString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export class MatchCoordinator {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private loaded: StorageShape | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async readState(): Promise<StorageShape> {
    if (this.loaded) return this.loaded;
    const existing = await this.ctx.storage.get<StorageShape>("state");
    const loaded: StorageShape = existing ?? {
      accounts: {},
      sessions: {},
      queue: [],
      lobbies: [],
      tournaments: {},
      oauthStates: {},
    };
    // Back-fill tournaments map for pre-existing storage snapshots.
    if (!loaded.tournaments) {
      loaded.tournaments = {};
    }
    for (const entry of loaded.queue) {
      if (!entry.preferredRegions?.length) {
        entry.preferredRegions = ["auto"];
      }
      if (entry.enqueuedAtMs === undefined) {
        entry.enqueuedAtMs = Date.parse(entry.enqueuedAt) || Date.now();
      }
    }
    this.loaded = loaded;
    return loaded;
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
    const mmrRd = typeof account.mmrRd === "number" && Number.isFinite(account.mmrRd) ? account.mmrRd : 350;
    return {
      userId: account.accountId,
      displayName: account.displayName,
      preferredRuntimeDeckId: null,
      balance: 1000,
      wins: 0,
      losses: 0,
      mmr: account.mmr,
      mmrRd,
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

    if (path === "/api/config/public" && request.method === "GET") {
      return json(toPublicConfig(resolvePolicy(this.env, state)));
    }

    // OAuth providers list is handled by the main Worker (has env access).
    // This route is kept here only as a fallback but should not be reached.
    if (path === "/api/auth/oauth/providers" && request.method === "GET") {
      return json({ providers: [] });
    }

    // Internal: called by the main Worker after a successful OAuth code exchange
    if (path === "/api/auth/oauth/ensure" && request.method === "POST") {
      const body = await request.json<Json>().catch(() => ({} as Json));
      const provider = String(body.provider ?? "");
      const providerUserId = String(body.providerUserId ?? "");
      const username = toSlug(String(body.username ?? providerUserId)).slice(0, 32);
      const displayName = String(body.displayName ?? username).slice(0, 48) || "Player";
      const email = typeof body.email === "string" && body.email.includes("@") ? body.email : null;
      const identityKey = `${provider}:${providerUserId}`;
      // Find existing account by provider identity key stored in accountId prefix or username
      let account = Object.values(state.accounts).find((a) => a.accountId.startsWith(`${identityKey}:`) || a.email === email);
      if (!account) {
        const createdAt = nowIso();
        account = {
          accountId: `${identityKey}:${crypto.randomUUID()}`,
          username,
          displayName,
          email,
          createdAt,
          updatedAt: createdAt,
          mmr: 1000,
          mmrRd: 350,
        };
        state.accounts[account.accountId] = account;
      }
      const token = crypto.randomUUID();
      const createdAt = nowIso();
      state.sessions[token] = {
        sessionId: crypto.randomUUID(),
        token,
        accountId: account.accountId,
        createdAt,
        lastUsedAt: createdAt,
        expiresAt: plusDaysIso(30),
      };
      await this.persist(state);
      return json({ app_token: token, displayName: account.displayName, userId: account.accountId });
    }

    if ((path === "/api/auth/register" || path === "/api/auth/login") && request.method === "POST") {
      const body = await request.json<Json>().catch(() => ({} as Json));
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
          mmrRd: 350,
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

    if (path === "/api/admin/policy" && request.method === "GET") {
      const policy = resolvePolicy(this.env, state);
      if (!isAdminAccount(authed.account.accountId, policy, this.env)) {
        return error("Forbidden", 403);
      }
      await this.persist(state);
      return json({ policy: resolvePolicy(this.env, state), etag: state.policyRuntime?.etag ?? null });
    }

    if (path === "/api/admin/policy" && request.method === "PUT") {
      const policy = resolvePolicy(this.env, state);
      if (!isAdminAccount(authed.account.accountId, policy, this.env)) {
        return error("Forbidden", 403);
      }
      const body = await request.json<Json>().catch(() => ({} as Json));
      const merged = deepMergePolicy(policy, body);
      parsePolicyJson(merged);
      state.policyRuntime = { blob: merged, etag: crypto.randomUUID(), updatedAt: nowIso() };
      pushAudit(state, authed.account.accountId, "policy.update", {
        etag: state.policyRuntime.etag,
      } as unknown as JsonValue);
      await this.persist(state);
      return json({ ok: true, etag: state.policyRuntime.etag });
    }

    if (path === "/api/admin/audit" && request.method === "GET") {
      const policy = resolvePolicy(this.env, state);
      if (!isAdminAccount(authed.account.accountId, policy, this.env)) {
        return error("Forbidden", 403);
      }
      return json({ entries: state.auditLog ?? [] });
    }

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
      const policy = resolvePolicy(this.env, state);
      return json({
        settings: { ...DEFAULT_SETTINGS, turnTimerSeconds: policy.timers.turnTimerSeconds },
        wallet: this.buildWallet(authed.account),
      });
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
      const payload = await request.json<Json>().catch(() => ({} as Json));
      const preferredMaxPlayers = Number(payload.preferredMaxPlayers ?? 2);
      const policy = resolvePolicy(this.env, state);
      const rawRegions = payload.preferredRegions;
      const preferredRegions = Array.isArray(rawRegions)
        ? rawRegions
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      const regions =
        preferredRegions.length > 0 ? preferredRegions : [policy.matchmaking.defaultRegionId];
      state.queue = state.queue.filter((entry) => entry.userId !== authed.account.accountId);
      const entry: QueueEntry = {
        userId: authed.account.accountId,
        displayName: authed.account.displayName,
        mmr: authed.account.mmr,
        preferredMaxPlayers: Number.isFinite(preferredMaxPlayers) ? Math.max(2, Math.min(8, preferredMaxPlayers)) : 2,
        enqueuedAt: nowIso(),
        preferredRegions: regions,
        enqueuedAtMs: Date.now(),
      };
      state.queue.push(entry);
      await this.persist(state);
      await this.tryPairMatchmakingQueue(state);
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
      const payload = await request.json<Json>().catch(() => ({} as Json));
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
          gameMode: Boolean(payload.ranked) ? "canonical" : (readLobbyWackyGameMode(payload) ? "wacky" : "canonical"),
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
      const payload = await request.json<Json>().catch(() => ({} as Json));
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
      const payload = await request.json<Json>().catch(() => ({} as Json));
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
      const payload = await request.json<Json>().catch(() => ({} as Json));
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
      const policy = resolvePolicy(this.env, state);
      if (!policy.features.workerMatchAuthority || !this.env.MATCH_ACTOR) {
        return error("Multiplayer match hosting is not enabled on this free fallback backend.", 409);
      }
      const lobby = state.lobbies.find((candidate) => candidate.id === decodeURIComponent(lobbyStartMatch[1]));
      if (!lobby) return error("Lobby not found", 404);
      if (lobby.hostUserId !== authed.account.accountId) {
        return error("Only the host can start this lobby.", 403);
      }
      const humans = lobby.players.filter((player) => !player.isAi);
      if (humans.length < 2) {
        return error("At least two human players are required to start.", 400);
      }
      const [p1, p2] = humans;
      const matchId = crypto.randomUUID();
      const ra = [policy.matchmaking.defaultRegionId];
      const rb = [policy.matchmaking.defaultRegionId];
      const hint = pickLocationHint(ra, rb, policy);
      const namespace = this.env.MATCH_ACTOR;
      const stub = namespace.get(
        hint ? namespace.idFromName(matchId, { locationHint: hint }) : namespace.idFromName(matchId),
      );
      const gm = lobby.tableSettings.gameMode === "wacky" ? "wacky" : "canonical";
      const createRes = await stub.fetch(
        new Request("http://internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId,
            playerOneId: p1!.userId,
            playerOneName: p1!.displayName,
            playerTwoId: p2!.userId,
            playerTwoName: p2!.displayName,
            gameMode: gm,
          }),
        }),
      );
      if (!createRes.ok) {
        const errText = await createRes.text();
        return error(errText || "Failed to create match", createRes.status);
      }
      lobby.matchId = matchId;
      lobby.status = "in_game";
      lobby.updatedAt = nowIso();
      await this.persist(state);
      return json({ lobby, matchId });
    }

    if (path === "/api/match/me" && request.method === "GET") {
      return error("No active match", 404);
    }

    if (path.startsWith("/api/match/") && request.method === "GET") {
      return error("Match not found", 404);
    }

    if (path === "/api/blackjack/rules" && request.method === "GET") {
      const policy = resolvePolicy(this.env, state);
      if (!policy.features.blackjackOnlineEnabled) {
        return error("Blackjack online is disabled by policy.", 403);
      }
      return json({ blackjack: policy.blackjack });
    }

    // ---------- Tournaments ---------------------------------------------------

    if (path === "/api/tournaments" && request.method === "GET") {
      const tournaments = Object.values(state.tournaments)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((entry) => summarizeTournament(entry));
      return json({ tournaments });
    }

    if (path === "/api/tournaments" && request.method === "POST") {
      const payload = await request.json<Json>().catch(() => ({} as Json));
      const formatRaw = String(payload.format ?? "single_elim");
      const format: TournamentFormat = formatRaw === "double_elim" || formatRaw === "swiss"
        ? formatRaw
        : "single_elim";
      const modeRaw = String(payload.gameMode ?? payload.mode ?? "canonical");
      const gameMode = modeRaw === "wacky" ? "wacky" : "canonical";

      const tournament = createTournament({
        name: String(payload.name ?? "Unnamed Tournament").slice(0, 64),
        organizerId: authed.account.accountId,
        organizerName: authed.account.displayName,
        format,
        gameMode,
        setsPerMatch: Math.max(1, Math.min(9, Number(payload.setsPerMatch ?? 3) || 3)),
        rounds: Math.max(2, Math.min(12, Number(payload.rounds ?? 5) || 5)),
        maxParticipants: typeof payload.maxParticipants === "number" ? payload.maxParticipants : null,
      });
      state.tournaments[tournament.id] = tournament;
      await this.persist(state);
      await this.broadcastTournamentEvent("tournament.updated", tournament);
      return json({ tournament });
    }

    const tournamentIdMatch = path.match(/^\/api\/tournaments\/([^/]+)(?:\/([^/]+))?$/);
    if (tournamentIdMatch && request.method === "GET" && !tournamentIdMatch[2]) {
      const id = decodeURIComponent(tournamentIdMatch[1]);
      const tournament = state.tournaments[id];
      if (!tournament) return error("Tournament not found", 404);
      return json({
        tournament,
        bracket: buildBracketView(tournament),
        standings: tournament.format === "swiss" ? computeSwissStandings(tournament) : null,
      });
    }

    const tournamentJoinMatch = path.match(/^\/api\/tournaments\/([^/]+)\/join$/);
    if (tournamentJoinMatch && request.method === "POST") {
      const id = decodeURIComponent(tournamentJoinMatch[1]);
      const tournament = state.tournaments[id];
      if (!tournament) return error("Tournament not found", 404);
      let next: TournamentState;
      try {
        next = registerParticipant(tournament, {
          userId: authed.account.accountId,
          displayName: authed.account.displayName,
          mmr: authed.account.mmr,
        });
      } catch (err) {
        return error(err instanceof Error ? err.message : "Registration failed", 400);
      }
      state.tournaments[id] = next;
      await this.persist(state);
      await this.broadcastTournamentEvent("tournament.updated", next);
      return json({ tournament: next });
    }

    const tournamentLeaveMatch = path.match(/^\/api\/tournaments\/([^/]+)\/leave$/);
    if (tournamentLeaveMatch && request.method === "POST") {
      const id = decodeURIComponent(tournamentLeaveMatch[1]);
      const tournament = state.tournaments[id];
      if (!tournament) return error("Tournament not found", 404);
      const next = withdrawParticipant(tournament, authed.account.accountId);
      state.tournaments[id] = next;
      await this.persist(state);
      await this.broadcastTournamentEvent("tournament.updated", next);
      return json({ tournament: next });
    }

    const tournamentStartMatch = path.match(/^\/api\/tournaments\/([^/]+)\/start$/);
    if (tournamentStartMatch && request.method === "POST") {
      const id = decodeURIComponent(tournamentStartMatch[1]);
      const tournament = state.tournaments[id];
      if (!tournament) return error("Tournament not found", 404);
      if (tournament.organizerId !== authed.account.accountId) {
        return error("Only the organizer can start this tournament.", 403);
      }
      let started: TournamentState;
      try {
        started = startTournament(tournament);
      } catch (err) {
        return error(err instanceof Error ? err.message : "Unable to start", 400);
      }
      state.tournaments[id] = started;
      await this.persist(state);
      await this.broadcastTournamentEvent("tournament.updated", started);
      for (const match of started.matches.filter((entry) => entry.state === "active")) {
        await this.broadcastTournamentEvent("match.scheduled", started, match.id);
      }
      return json({ tournament: started });
    }

    const tournamentReportMatch = path.match(/^\/api\/tournaments\/([^/]+)\/report$/);
    if (tournamentReportMatch && request.method === "POST") {
      const id = decodeURIComponent(tournamentReportMatch[1]);
      const payload = await request.json<Json>().catch(() => ({} as Json));
      const tournament = state.tournaments[id];
      if (!tournament) return error("Tournament not found", 404);
      const matchId = String(payload.matchId ?? "");
      const winnerUserId = payload.winnerUserId === null ? null : String(payload.winnerUserId ?? "");
      const match = tournament.matches.find((entry) => entry.id === matchId);
      if (!match) return error("Match not found", 404);
      const isParticipant = authed.account.accountId === match.participantAId || authed.account.accountId === match.participantBId;
      const isOrganizer = authed.account.accountId === tournament.organizerId;
      if (!isParticipant && !isOrganizer) {
        return error("Only the match participants or the organizer can report this match.", 403);
      }
      let result;
      try {
        result = advanceTournament(tournament, { matchId, winnerUserId });
      } catch (err) {
        return error(err instanceof Error ? err.message : "Advance failed", 400);
      }
      state.tournaments[id] = result.state;
      await this.persist(state);
      await this.broadcastTournamentEvent("tournament.updated", result.state);
      if (result.newSwissRound !== null) {
        await this.broadcastTournamentEvent("round.advanced", result.state);
      }
      for (const scheduled of result.matchesToSchedule) {
        await this.broadcastTournamentEvent("match.scheduled", result.state, scheduled.id);
      }
      return json({ tournament: result.state, tournamentCompleted: result.tournamentCompleted });
    }

    const tournamentCancelMatch = path.match(/^\/api\/tournaments\/([^/]+)\/cancel$/);
    if (tournamentCancelMatch && request.method === "POST") {
      const id = decodeURIComponent(tournamentCancelMatch[1]);
      const tournament = state.tournaments[id];
      if (!tournament) return error("Tournament not found", 404);
      if (tournament.organizerId !== authed.account.accountId) {
        return error("Only the organizer can cancel this tournament.", 403);
      }
      const cancelled: TournamentState = { ...tournament, status: "cancelled", updatedAt: Date.now() };
      state.tournaments[id] = cancelled;
      await this.persist(state);
      await this.broadcastTournamentEvent("tournament.updated", cancelled);
      return json({ tournament: cancelled });
    }

    return error("Not found", 404);
  }

  private async tryPairMatchmakingQueue(state: StorageShape): Promise<void> {
    const policy = resolvePolicy(this.env, state);
    if (!policy.features.workerMatchAuthority || !this.env.MATCH_ACTOR) {
      return;
    }
    const namespace = this.env.MATCH_ACTOR;
    const now = Date.now();
    const q = [...state.queue];
    outer: for (let i = 0; i < q.length - 1; i++) {
      for (let j = i + 1; j < q.length; j++) {
        const a = q[i]!;
        const b = q[j]!;
        const ra = a.preferredRegions ?? [policy.matchmaking.defaultRegionId];
        const rb = b.preferredRegions ?? [policy.matchmaking.defaultRegionId];
        const waited = now - Math.min(a.enqueuedAtMs ?? now, b.enqueuedAtMs ?? now);
        const widen = waited >= policy.matchmaking.queueWidenAfterMs;
        let ok = widen;
        if (!ok) {
          if (ra.includes("auto") || rb.includes("auto")) {
            ok = true;
          } else {
            ok = ra.some((region) => rb.includes(region));
          }
        }
        if (!ok) {
          continue;
        }
        const matchId = crypto.randomUUID();
        const hint = pickLocationHint(ra, rb, policy);
        const stub = namespace.get(
          hint ? namespace.idFromName(matchId, { locationHint: hint }) : namespace.idFromName(matchId),
        );
        const res = await stub.fetch(
          new Request("http://internal/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchId,
              playerOneId: a.userId,
              playerOneName: a.displayName,
              playerTwoId: b.userId,
              playerTwoName: b.displayName,
              gameMode: "canonical",
            }),
          }),
        );
        if (!res.ok) {
          continue;
        }
        state.queue = state.queue.filter((e) => e.userId !== a.userId && e.userId !== b.userId);
        break outer;
      }
    }
  }

  private async broadcastTournamentEvent(
    type: "tournament.updated" | "match.scheduled" | "round.advanced",
    tournament: TournamentState,
    matchId?: string,
  ): Promise<void> {
    try {
      const roomName = `tournament:${tournament.id}`;
      const id = this.env.RELAY_ROOM.idFromName(roomName);
      const stub = this.env.RELAY_ROOM.get(id);
      await stub.fetch(new Request("http://internal/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: type,
          tournamentId: tournament.id,
          ...(matchId ? { matchId } : {}),
          summary: summarizeTournament(tournament),
        }),
      }));
    } catch {
      // Broadcast failures should not block API responses.
    }
  }
}

const summarizeTournament = (state: TournamentState): Json => {
  return {
    id: state.id,
    name: state.name,
    format: state.format,
    gameMode: state.gameMode,
    status: state.status,
    currentRound: state.currentRound,
    participants: Object.values(state.participants).map((entry) => ({
      userId: entry.userId,
      displayName: entry.displayName,
      seed: entry.seed,
      status: entry.status,
      mmr: entry.mmr,
    })) as JsonValue,
    championUserId: state.championUserId,
    setsPerMatch: state.setsPerMatch,
    rounds: state.rounds,
    maxParticipants: state.maxParticipants,
    organizerId: state.organizerId,
    organizerName: state.organizerName,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
};

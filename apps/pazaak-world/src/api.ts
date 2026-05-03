import type {
  AdvisorDifficulty,
  LeaderboardEntry,
  MatchmakingQueueRecord,
  PazaakGameMode,
  PazaakOpponentProfileRecord,
  PazaakLobbyRecord,
  PazaakMatchHistoryRecord,
  PazaakTableSettings,
  PazaakUserSettings,
  SavedSideboardCollectionRecord,
  SerializedMatch,
  SideCardOption,
  SwissStandingsRowRecord,
  TournamentBracketViewRecord,
  TournamentFormat,
  TournamentStateRecord,
  WalletRecord,
} from "./types.ts";
import {
  createBrowserApiClient,
  parseConfiguredBases,
  resolveBrowserApiBases,
  subscribeToReconnectingWebSocket,
  type RealtimeConnectionState,
} from "@openkotor/platform/browser";
import { SOCIAL_AUTH_PROVIDERS, type CardWorldConfig, type SocialAuthProvider } from "@openkotor/platform";
import { DefaultSocket } from "@heroiclabs/nakama-js";
import {
  bootstrapNakamaActivitySession,
  getNakamaClient,
  isNakamaBackend,
  nakamaRpc,
  sessionFromPazaakAccessToken,
  tryDecodeNakamaCredential,
} from "./nakamaClient.ts";

export type { SocialAuthProvider };
export { isNakamaBackend, bootstrapNakamaActivitySession };

export interface PazaakAccountRecord {
  accountId: string;
  username: string;
  displayName: string;
  email: string | null;
  legacyGameUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PazaakLinkedIdentityRecord {
  provider: "discord";
  providerUserId: string;
  accountId: string;
  username: string;
  displayName: string;
  linkedAt: string;
  updatedAt: string;
}

export interface PazaakAccountSessionRecord {
  sessionId: string;
  accountId: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface AuthSessionResponse {
  app_token: string;
  token_type: "Bearer";
  account: PazaakAccountRecord;
  session: PazaakAccountSessionRecord;
  linkedIdentities: PazaakLinkedIdentityRecord[];
}

export interface SocialAuthProviderConfig {
  provider: SocialAuthProvider;
  enabled: boolean;
}

export interface SocialAuthProviderListResponse {
  providers: SocialAuthProviderConfig[];
}

export interface SocialAuthStartResponse {
  provider: SocialAuthProvider;
  redirectUrl: string;
}

const legacyOrigin = String(import.meta.env.VITE_LEGACY_HTTP_ORIGIN ?? "").trim();
const apiClient = createBrowserApiClient({
  apiBases: legacyOrigin
    ? parseConfiguredBases(legacyOrigin)
    : resolveBrowserApiBases({
        configuredBases: parseConfiguredBases(import.meta.env.VITE_API_BASES),
        localApiPort: 4001,
      }),
});

const apiFetch = apiClient.requestJsonWithBearer;
const apiPublicFetch = apiClient.requestJson;
const apiPublicOptionalFetch = apiClient.requestOptionalJson;

export interface MatchResponse {
  match: SerializedMatch;
}

export interface SideboardsResponse {
  sideboards: SavedSideboardCollectionRecord;
}

export interface MeResponse {
  user: { id: string; username: string; displayName: string };
  wallet: WalletRecord;
  queue: MatchmakingQueueRecord | null;
  match: SerializedMatch | null;
}

export interface SettingsResponse {
  settings: PazaakUserSettings;
  wallet?: WalletRecord;
}

export interface LeaderboardResponse {
  leaders: LeaderboardEntry[];
}

export interface HistoryResponse {
  history: PazaakMatchHistoryRecord[];
}

export interface OpponentsResponse {
  opponents: PazaakOpponentProfileRecord[];
  serverTime: string;
}

const DEFAULT_CARDWORLD_CONFIG: CardWorldConfig = {
  botGameType: "pazaak",
  defaultPublicGameType: "blackjack",
  pazaakRequiresOwnershipProof: true,
  acceptedOwnershipProofFilenames: ["chitin.key"],
};

export interface QueueResponse {
  queue: MatchmakingQueueRecord | null;
}

/** Matchmaking enqueue may return an immediate match when another player was already queued. */
export interface EnqueueMatchmakingResult {
  queue: MatchmakingQueueRecord | null;
  match: SerializedMatch | null;
}

export interface MatchmakingStatsResponse {
  playersInQueue: number;
  openLobbies: number;
  activeGames: number;
  averageWaitSeconds: number;
  averageWaitTime: string;
  queueUpdatedAt: string;
}

export interface LobbiesResponse {
  lobbies: PazaakLobbyRecord[];
}

export interface LobbyResponse {
  lobby: PazaakLobbyRecord | null;
  match?: SerializedMatch;
}

export interface TraskSourceRecord {
  id: string;
  name: string;
  kind: "website" | "github" | "discord";
  homeUrl: string;
  description: string;
  freshnessPolicy: string;
}

export interface TraskQueryRecord {
  queryId: string;
  userId: string;
  query: string;
  status: "pending" | "complete" | "failed";
  answer: string | null;
  sources: Array<{
    id: string;
    name: string;
    url: string;
  }>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

function nakamaUseSsl(): boolean {
  const raw = String(import.meta.env.VITE_NAKAMA_USE_SSL ?? "").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Nakama ranked queue uses the built-in matchmaker; ticket is tied to this socket until matched or cancelled. */
let nakamaMatchmakingSession: {
  accessToken: string;
  socket: DefaultSocket;
  ticket: string;
  queue: MatchmakingQueueRecord;
} | null = null;

async function nakamaDisconnectMatchmaking(accessToken: string): Promise<boolean> {
  const cur = nakamaMatchmakingSession;
  if (!cur || cur.accessToken !== accessToken) return false;
  try {
    await cur.socket.removeMatchmaker(cur.ticket);
  } catch {
    /* ticket may already be consumed */
  }
  cur.socket.disconnect(false);
  nakamaMatchmakingSession = null;
  return true;
}

const NAKAMA_OP_SNAPSHOT = 1;
const NAKAMA_OP_COMMAND = 2;
const NAKAMA_OP_CHAT = 3;
const NAKAMA_OP_ERROR = 4;

function normalizeNakamaLobby(raw: Record<string, unknown>): PazaakLobbyRecord {
  const players = Array.isArray(raw.players) ? raw.players : [];
  return {
    id: String(raw.id ?? ""),
    lobbyCode: String(raw.lobbyCode ?? ""),
    name: String(raw.name ?? ""),
    hostUserId: String(raw.hostUserId ?? ""),
    maxPlayers: Number(raw.maxPlayers ?? 2),
    tableSettings: raw.tableSettings as PazaakLobbyRecord["tableSettings"],
    passwordHash: raw.passwordHash != null ? String(raw.passwordHash) : null,
    status: raw.status as PazaakLobbyRecord["status"],
    matchId: raw.matchId != null ? String(raw.matchId) : null,
    players: players.map((p) => {
      const o = p as Record<string, unknown>;
      return {
        userId: String(o.userId ?? ""),
        displayName: String(o.displayName ?? ""),
        ready: Boolean(o.ready),
        isHost: Boolean(o.isHost),
        isAi: Boolean(o.isAi),
        ...(typeof o.aiDifficulty === "string" ? { aiDifficulty: o.aiDifficulty as AdvisorDifficulty } : {}),
        joinedAt: String(o.joinedAt ?? ""),
      };
    }),
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

async function nakamaMatchSnapshot(accessToken: string, logicalMatchId: string): Promise<SerializedMatch> {
  const data = await nakamaRpc<{ match: SerializedMatch | null }>(accessToken, "pazaak.match_get", { matchId: logicalMatchId });
  if (!data.match) throw new Error("Match not found.");
  return data.match;
}

async function nakamaSendMatchCommand(accessToken: string, nakamaMatchId: string, body: Record<string, unknown>): Promise<void> {
  const session = await sessionFromPazaakAccessToken(accessToken);
  const socket = getNakamaClient().createSocket(nakamaUseSsl()) as DefaultSocket;
  const clientMoveId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `mv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await socket.connect(session, false);
  try {
    await socket.joinMatch(nakamaMatchId);
    await socket.sendMatchState(
      nakamaMatchId,
      NAKAMA_OP_COMMAND,
      JSON.stringify({ ...body, clientMoveId }),
    );
  } finally {
    socket.disconnect(false);
  }
}

async function nakamaMove(accessToken: string, logicalMatchId: string, cmd: Record<string, unknown>): Promise<SerializedMatch> {
  const snap = await nakamaMatchSnapshot(accessToken, logicalMatchId);
  const nid = snap.nakamaMatchId;
  if (!nid) throw new Error("Active match is missing a realtime id; try re-entering the match.");
  await nakamaSendMatchCommand(accessToken, nid, cmd);
  return nakamaMatchSnapshot(accessToken, logicalMatchId);
}

function decodeChatMessagePayload(data: Uint8Array): ChatMessage | null {
  try {
    const text = new TextDecoder().decode(data);
    const msg = JSON.parse(text) as ChatMessage;
    return msg && typeof msg.id === "string" && typeof msg.text === "string" ? msg : null;
  } catch {
    return null;
  }
}

function decodeSnapshotPayload(data: Uint8Array): SerializedMatch | null {
  try {
    const text = new TextDecoder().decode(data);
    const outer = JSON.parse(text) as { type?: string; data?: SerializedMatch };
    if (outer?.type === "match_update" && outer.data) return outer.data;
  } catch {
    return null;
  }
  return null;
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  if (isNakamaBackend()) {
    return nakamaRpc<MeResponse>(accessToken, "pazaak.me", {});
  }
  return apiFetch<MeResponse>("/api/me", accessToken);
}

/** Public ops subset (time presets, regions, flags) — no auth. */
export interface PublicPazaakConfig {
  version: 1;
  timers: { turnTimerSeconds: number };
  matchmaking: {
    regions: Array<{ id: string; label: string; locationHint?: string }>;
    defaultRegionId: string;
  };
  timeControls: {
    presets: Array<{ id: string; label: string; turnSeconds: number; incrementSeconds?: number }>;
  };
  features: { blackjackOnlineEnabled: boolean; allowPrivateBackendUrl: boolean };
}

export async function fetchPublicPazaakConfig(): Promise<PublicPazaakConfig | null> {
  if (isNakamaBackend()) {
    try {
      const httpKey = String(import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey").trim() || "defaultkey";
      const res = await getNakamaClient().rpcHttpKey(httpKey, "pazaak.config_public", {});
      return (res.payload ?? null) as PublicPazaakConfig | null;
    } catch {
      return null;
    }
  }
  return apiPublicOptionalFetch<PublicPazaakConfig>("/api/config/public");
}

export async function fetchAdminPolicy(accessToken: string): Promise<{ policy: unknown; etag: string | null }> {
  return apiFetch<{ policy: unknown; etag: string | null }>("/api/admin/policy", accessToken);
}

export async function putAdminPolicy(accessToken: string, patch: unknown): Promise<{ ok: true; etag: string }> {
  return apiFetch<{ ok: true; etag: string }>("/api/admin/policy", accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function fetchBlackjackRules(accessToken: string): Promise<{ blackjack: unknown }> {
  return apiFetch<{ blackjack: unknown }>("/api/blackjack/rules", accessToken);
}

export interface CrateOpenResponse {
  wallet: WalletRecord;
  opened: { tokens: string[]; bonusCredits: number };
  kind: "standard" | "premium";
}

export async function openRewardCrate(accessToken: string, kind: "standard" | "premium"): Promise<CrateOpenResponse> {
  if (isNakamaBackend()) {
    throw new Error("Reward crates are not wired to Nakama in this build yet.");
  }
  return apiFetch<CrateOpenResponse>("/api/crates/open", accessToken, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

export async function registerAccount(input: {
  username: string;
  displayName?: string;
  email?: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiPublicFetch<AuthSessionResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function loginAccount(identifier: string, password: string): Promise<AuthSessionResponse> {
  return apiPublicFetch<AuthSessionResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
}

export async function fetchSocialAuthProviders(): Promise<SocialAuthProviderListResponse> {
  const body = await apiPublicOptionalFetch<SocialAuthProviderListResponse>("/api/auth/oauth/providers");
  return body ?? {
    providers: SOCIAL_AUTH_PROVIDERS.map((provider: SocialAuthProvider) => ({ provider, enabled: false })),
  };
}

export async function startSocialAuth(provider: SocialAuthProvider, matchId?: string): Promise<SocialAuthStartResponse> {
  return apiPublicFetch<SocialAuthStartResponse>(`/api/auth/oauth/${encodeURIComponent(provider)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: matchId ? JSON.stringify({ matchId }) : undefined,
  });
}

export async function fetchAuthSession(accessToken: string): Promise<{
  account: PazaakAccountRecord;
  linkedIdentities: PazaakLinkedIdentityRecord[];
}> {
  if (isNakamaBackend()) {
    const decoded = tryDecodeNakamaCredential(accessToken);
    if (!decoded?.user_id) {
      throw new Error("Invalid Nakama session.");
    }
    const account = await getNakamaClient().getAccount(decoded);
    const u = account.user;
    const userId = u?.id ?? decoded.user_id;
    const displayName = u?.display_name ?? u?.username ?? "Player";
    const username = u?.username ?? userId;
    return {
      account: {
        accountId: userId,
        username,
        displayName,
        email: null,
        legacyGameUserId: userId,
        createdAt: "",
        updatedAt: "",
      },
      linkedIdentities: [],
    };
  }
  return apiFetch("/api/auth/session", accessToken);
}

export async function logoutAccount(accessToken: string): Promise<void> {
  if (isNakamaBackend()) {
    try {
      const s = await sessionFromPazaakAccessToken(accessToken);
      await getNakamaClient().sessionLogout(s, s.token, s.refresh_token);
    } catch {
      /* ignore */
    }
    return;
  }
  await apiFetch<{ ok: true }>("/api/auth/logout", accessToken, { method: "POST" });
}

export async function fetchSettings(accessToken: string): Promise<PazaakUserSettings> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<SettingsResponse>(accessToken, "pazaak.settings_get", {});
    return data.settings;
  }
  const data = await apiFetch<SettingsResponse>("/api/settings", accessToken);
  return data.settings;
}

export async function updateSettings(
  accessToken: string,
  settings: Partial<PazaakUserSettings>,
): Promise<PazaakUserSettings> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<SettingsResponse>(accessToken, "pazaak.settings_update", settings as object);
    return data.settings;
  }
  const data = await apiFetch<SettingsResponse>("/api/settings", accessToken, {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return data.settings;
}

export async function fetchLeaderboard(accessToken: string): Promise<LeaderboardEntry[]> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ leaders: LeaderboardEntry[] }>(accessToken, "pazaak.leaderboard", {});
    return (data.leaders ?? []).map((row) => ({
      rank: row.rank ?? 0,
      userId: row.userId,
      displayName: row.displayName,
      mmr: row.mmr ?? 0,
      gamesPlayed: row.gamesPlayed ?? 0,
      gamesWon: row.gamesWon ?? row.wins ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      balance: row.balance ?? 0,
    }));
  }
  const data = await apiFetch<LeaderboardResponse>("/api/leaderboard", accessToken);
  return data.leaders;
}

export async function fetchHistory(accessToken: string, limit = 25): Promise<PazaakMatchHistoryRecord[]> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{
      history: Array<{ matchId: string; opponentName: string; result: string; mmrDelta: number; playedAt: string }>;
    }>(accessToken, "pazaak.history", { limit });
    return (data.history ?? []).map((r) => ({
      matchId: r.matchId,
      channelId: "",
      winnerId: "",
      winnerName: r.result === "win" ? "You" : r.opponentName,
      loserId: "",
      loserName: r.result === "loss" ? "You" : r.opponentName,
      wager: 0,
      completedAt: r.playedAt,
      summary: `${r.result === "win" ? "Win" : "Loss"} vs ${r.opponentName} (${r.mmrDelta >= 0 ? "+" : ""}${r.mmrDelta} MMR)`,
    }));
  }
  const data = await apiFetch<HistoryResponse>(`/api/me/history?limit=${encodeURIComponent(String(limit))}`, accessToken);
  return data.history;
}

export async function fetchPazaakOpponents(): Promise<PazaakOpponentProfileRecord[]> {
  const body = await apiPublicOptionalFetch<OpponentsResponse>("/api/pazaak/opponents");
  return body?.opponents ?? [];
}

export async function fetchCardWorldConfig(): Promise<CardWorldConfig> {
  const body = await apiPublicOptionalFetch<CardWorldConfig>("/api/cardworld/config");
  return body ?? DEFAULT_CARDWORLD_CONFIG;
}

export async function enqueueMatchmaking(
  accessToken: string,
  preferredMaxPlayers = 2,
  preferredRegions?: string[],
): Promise<EnqueueMatchmakingResult> {
  if (isNakamaBackend()) {
    await nakamaDisconnectMatchmaking(accessToken);

    const me = await nakamaRpc<MeResponse>(accessToken, "pazaak.me", {});
    const session = await sessionFromPazaakAccessToken(accessToken);
    const socket = getNakamaClient().createSocket(nakamaUseSsl()) as DefaultSocket;

    /** Nakama counts total players in the formed match (see Heroic matchmaker docs), not “opponents only”. */
    const partySize = Math.max(2, Math.min(8, Math.floor(preferredMaxPlayers) || 2));

    const stringProps: Record<string, string> = {};
    if (preferredRegions?.length) stringProps.region = preferredRegions[0]!;

    await socket.connect(session, false);
    let ticket: string;
    try {
      const ticketRes = await socket.addMatchmaker("*", partySize, partySize, stringProps);
      ticket = ticketRes.ticket;
    } catch (err) {
      socket.disconnect(false);
      throw err;
    }

    const queue: MatchmakingQueueRecord = {
      userId: me.user.id,
      displayName: me.user.displayName,
      mmr: me.wallet.mmr,
      preferredMaxPlayers: partySize,
      enqueuedAt: new Date().toISOString(),
    };

    nakamaMatchmakingSession = { accessToken, socket, ticket, queue };

    socket.onmatchmakermatched = async (mm) => {
      const held = nakamaMatchmakingSession;
      if (!held || held.socket !== socket) return;
      try {
        await socket.joinMatch(undefined, mm.token);
      } catch {
        /* presence may already be joined via another path */
      } finally {
        socket.disconnect(false);
        if (nakamaMatchmakingSession?.socket === socket) nakamaMatchmakingSession = null;
      }
    };

    return { queue, match: null };
  }
  const data = await apiFetch<QueueResponse & { match?: SerializedMatch | null }>("/api/matchmaking/enqueue", accessToken, {
    method: "POST",
    body: JSON.stringify({
      preferredMaxPlayers,
      ...(preferredRegions?.length ? { preferredRegions } : {}),
    }),
  });
  return { queue: data.queue ?? null, match: data.match ?? null };
}

export async function leaveMatchmaking(accessToken: string): Promise<boolean> {
  if (isNakamaBackend()) {
    const removed = await nakamaDisconnectMatchmaking(accessToken);
    try {
      await nakamaRpc<{ removed: boolean }>(accessToken, "pazaak.matchmaking_leave", {});
    } catch {
      /* ignore */
    }
    return removed;
  }
  const data = await apiFetch<{ removed: boolean }>("/api/matchmaking/leave", accessToken, { method: "POST" });
  return data.removed;
}

export async function fetchMatchmakingStatus(accessToken: string): Promise<MatchmakingQueueRecord | null> {
  if (isNakamaBackend()) {
    const local = nakamaMatchmakingSession?.accessToken === accessToken ? nakamaMatchmakingSession.queue : null;
    if (local) return local;
    const data = await nakamaRpc<QueueResponse>(accessToken, "pazaak.matchmaking_status", {});
    return data.queue ?? null;
  }
  const data = await apiFetch<QueueResponse>("/api/matchmaking/status", accessToken);
  return data.queue;
}

export async function fetchMatchmakingStats(accessToken: string): Promise<MatchmakingStatsResponse> {
  if (isNakamaBackend()) {
    return nakamaRpc<MatchmakingStatsResponse>(accessToken, "pazaak.matchmaking_stats", {});
  }
  return apiFetch<MatchmakingStatsResponse>("/api/matchmaking/stats", accessToken);
}

export async function fetchLobbies(accessToken: string): Promise<PazaakLobbyRecord[]> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobbies: Record<string, unknown>[] }>(accessToken, "pazaak.lobbies_list", {});
    return (data.lobbies ?? []).map(normalizeNakamaLobby);
  }
  const data = await apiFetch<LobbiesResponse>("/api/lobbies", accessToken);
  return data.lobbies;
}

export async function createLobby(
  accessToken: string,
  input: {
    name?: string;
    maxPlayers?: number;
    password?: string;
    variant?: "canonical" | "multi_seat";
    tableSettings?: Partial<PazaakTableSettings>;
    maxRounds?: number;
    turnTimerSeconds?: number;
    ranked?: boolean;
    allowAiFill?: boolean;
    sideboardMode?: "runtime_random" | "player_active_custom" | "host_mirror_custom";
    gameMode?: PazaakGameMode;
  },
): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> }>(accessToken, "pazaak.lobby_create", input as object);
    if (!data.lobby) throw new Error("Lobby was not created.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>("/api/lobbies", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!data.lobby) throw new Error("Lobby was not created.");
  return data.lobby;
}

export async function joinLobby(accessToken: string, lobbyId: string, password?: string): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(accessToken, "pazaak.lobby_join", { lobbyId, password });
    if (!data.lobby) throw new Error("Lobby was not joined.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/join`, accessToken, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!data.lobby) throw new Error("Lobby was not joined.");
  return data.lobby;
}

export async function joinLobbyByCode(accessToken: string, lobbyCode: string, password?: string): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(accessToken, "pazaak.lobby_join", { lobbyCode, password });
    if (!data.lobby) throw new Error("Lobby was not joined.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>("/api/lobbies/join-by-code", accessToken, {
    method: "POST",
    body: JSON.stringify({ lobbyCode, password }),
  });
  if (!data.lobby) throw new Error("Lobby was not joined.");
  return data.lobby;
}

export async function setLobbyReady(accessToken: string, lobbyId: string, ready: boolean): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(accessToken, "pazaak.lobby_ready", { lobbyId, ready });
    if (!data.lobby) throw new Error("Lobby was not updated.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, accessToken, {
    method: "POST",
    body: JSON.stringify({ ready }),
  });
  if (!data.lobby) throw new Error("Lobby was not updated.");
  return data.lobby;
}

export async function setLobbyStatus(accessToken: string, lobbyId: string, status: "waiting" | "matchmaking"): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(accessToken, "pazaak.lobby_status", { lobbyId, status });
    if (!data.lobby) throw new Error("Lobby status was not updated.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/status`, accessToken, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  if (!data.lobby) throw new Error("Lobby status was not updated.");
  return data.lobby;
}

export async function updateLobbyAiDifficulty(accessToken: string, lobbyId: string, aiUserId: string, difficulty: AdvisorDifficulty): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(
      accessToken,
      "pazaak.lobby_ai_difficulty",
      { lobbyId, aiUserId, difficulty },
    );
    if (!data.lobby) throw new Error("Lobby AI seat was not updated.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/ai/${encodeURIComponent(aiUserId)}/difficulty`, accessToken, {
    method: "POST",
    body: JSON.stringify({ difficulty }),
  });
  if (!data.lobby) throw new Error("Lobby AI seat was not updated.");
  return data.lobby;
}

export async function addLobbyAi(accessToken: string, lobbyId: string, difficulty: AdvisorDifficulty): Promise<PazaakLobbyRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(accessToken, "pazaak.lobby_add_ai", { lobbyId, difficulty });
    if (!data.lobby) throw new Error("AI seat was not added.");
    return normalizeNakamaLobby(data.lobby);
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/addAi`, accessToken, {
    method: "POST",
    body: JSON.stringify({ difficulty }),
  });
  if (!data.lobby) throw new Error("AI seat was not added.");
  return data.lobby;
}

export async function leaveLobby(accessToken: string, lobbyId: string): Promise<PazaakLobbyRecord | null> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null }>(accessToken, "pazaak.lobby_leave", { lobbyId });
    return data.lobby ? normalizeNakamaLobby(data.lobby) : null;
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/leave`, accessToken, { method: "POST" });
  return data.lobby;
}

export async function startLobby(accessToken: string, lobbyId: string): Promise<{ lobby: PazaakLobbyRecord; match: SerializedMatch }> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ lobby: Record<string, unknown> | null; match: SerializedMatch | null }>(
      accessToken,
      "pazaak.lobby_start",
      { lobbyId },
    );
    if (!data.lobby || !data.match) throw new Error("Lobby did not start a match.");
    return { lobby: normalizeNakamaLobby(data.lobby), match: data.match };
  }
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/start`, accessToken, { method: "POST" });
  if (!data.lobby || !data.match) throw new Error("Lobby did not start a match.");
  return { lobby: data.lobby, match: data.match };
}

export async function fetchMyMatch(accessToken: string): Promise<SerializedMatch | null> {
  if (isNakamaBackend()) {
    try {
      const data = await nakamaRpc<{ match: SerializedMatch | null }>(accessToken, "pazaak.match_get", {});
      return data.match ?? null;
    } catch {
      return null;
    }
  }
  try {
    const data = await apiFetch<MatchResponse>("/api/match/me", accessToken);
    return data.match;
  } catch (err) {
    if (err instanceof Error && err.message.includes("No active match")) return null;
    throw err;
  }
}

export async function fetchMatch(matchId: string, accessToken: string): Promise<SerializedMatch | null> {
  if (isNakamaBackend()) {
    if (!accessToken) return null;
    try {
      const data = await nakamaRpc<{ match: SerializedMatch | null }>(accessToken, "pazaak.match_get", { matchId });
      return data.match ?? null;
    } catch {
      return null;
    }
  }
  try {
    const data = await apiFetch<MatchResponse>(`/api/match/${matchId}`, accessToken);
    return data.match;
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) return null;
    throw err;
  }
}

export async function fetchSideboards(accessToken: string): Promise<SavedSideboardCollectionRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<SideboardsResponse>(accessToken, "pazaak.sideboards_get", {});
    return data.sideboards;
  }
  const data = await apiFetch<SideboardsResponse>("/api/sideboards", accessToken);
  return data.sideboards;
}

export async function saveSideboard(
  name: string,
  tokens: string[],
  accessToken: string,
  makeActive = true,
): Promise<SavedSideboardCollectionRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<SideboardsResponse>(accessToken, "pazaak.sideboard_save", { name, tokens, makeActive });
    return data.sideboards;
  }
  const data = await apiFetch<SideboardsResponse>(`/api/sideboards/${encodeURIComponent(name)}`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ tokens, makeActive }),
  });
  return data.sideboards;
}

export async function setActiveSideboard(name: string, accessToken: string): Promise<SavedSideboardCollectionRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<SideboardsResponse>(accessToken, "pazaak.sideboard_active", { name });
    return data.sideboards;
  }
  const data = await apiFetch<SideboardsResponse>("/api/sideboards/active", accessToken, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.sideboards;
}

export async function deleteSideboard(name: string, accessToken: string): Promise<SavedSideboardCollectionRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<SideboardsResponse>(accessToken, "pazaak.sideboard_delete", { name });
    return data.sideboards;
  }
  const data = await apiFetch<SideboardsResponse>(`/api/sideboards/${encodeURIComponent(name)}`, accessToken, {
    method: "DELETE",
  });
  return data.sideboards;
}

export async function fetchTraskSources(accessToken: string): Promise<TraskSourceRecord[]> {
  const data = await apiFetch<{ sources: TraskSourceRecord[] }>("/api/trask/sources", accessToken);
  return data.sources;
}

export async function probeTraskAvailable(accessToken: string): Promise<boolean> {
  try {
    await fetchTraskSources(accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function fetchTraskHistory(accessToken: string, limit = 25): Promise<TraskQueryRecord[]> {
  const data = await apiFetch<{ history: TraskQueryRecord[] }>(`/api/trask/history?limit=${encodeURIComponent(String(limit))}`, accessToken);
  return data.history;
}

export async function askTrask(accessToken: string, query: string): Promise<TraskQueryRecord> {
  const data = await apiFetch<{ query: TraskQueryRecord }>("/api/trask/ask", accessToken, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return data.query;
}

export async function draw(matchId: string, accessToken: string): Promise<SerializedMatch> {
  if (isNakamaBackend()) return nakamaMove(accessToken, matchId, { type: "draw" });
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/draw`, accessToken, { method: "POST" });
  return data.match;
}

export async function stand(matchId: string, accessToken: string): Promise<SerializedMatch> {
  if (isNakamaBackend()) return nakamaMove(accessToken, matchId, { type: "stand" });
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/stand`, accessToken, { method: "POST" });
  return data.match;
}

export async function endTurn(matchId: string, accessToken: string): Promise<SerializedMatch> {
  if (isNakamaBackend()) return nakamaMove(accessToken, matchId, { type: "end_turn" });
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/endturn`, accessToken, { method: "POST" });
  return data.match;
}

export async function playSideCard(
  matchId: string,
  accessToken: string,
  option: SideCardOption,
): Promise<SerializedMatch> {
  if (isNakamaBackend()) {
    return nakamaMove(accessToken, matchId, {
      type: "play_side",
      cardId: option.cardId,
      appliedValue: option.appliedValue,
    });
  }
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/play`, accessToken, {
    method: "POST",
    body: JSON.stringify({ cardId: option.cardId, appliedValue: option.appliedValue }),
  });
  return data.match;
}

export async function forfeit(matchId: string, accessToken: string): Promise<SerializedMatch> {
  if (isNakamaBackend()) return nakamaMove(accessToken, matchId, { type: "forfeit" });
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/forfeit`, accessToken, { method: "POST" });
  return data.match;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  displayName: string;
  text: string;
  at: number;
}

export type MatchUpdateHandler = (match: SerializedMatch) => void;

export type MatchSocketConnectionState = RealtimeConnectionState;

export interface MatchSubscriptionOptions {
  reconnect?: boolean;
  maxDelayMs?: number;
  onConnectionChange?: (state: MatchSocketConnectionState) => void;
  onChatMessage?: (msg: ChatMessage) => void;
  /** Nakama authoritative match id (from SerializedMatch.nakamaMatchId). */
  nakamaMatchId?: string;
}

interface MatchUpdateWsMessage {
  type: "match_update";
  data: SerializedMatch;
}

interface ChatWsMessage {
  type: "chat_message";
  data: ChatMessage;
}

type WsMessage = MatchUpdateWsMessage | ChatWsMessage;

interface LobbyWsMessage {
  type: "lobby_update" | "lobby_list_update";
  data: PazaakLobbyRecord | PazaakLobbyRecord[];
}

export function subscribeToMatch(
  matchId: string,
  accessToken: string,
  onUpdate: MatchUpdateHandler,
  options: MatchSubscriptionOptions = {},
): () => void {
  if (isNakamaBackend()) {
    let cancelled = false;
    let socket: DefaultSocket | null = null;
    const scheduleReconnect = () => {
      /* Nakama socket adapter reconnect is manual; keep simple single connection for MVP. */
    };

    const run = async () => {
      options.onConnectionChange?.("connecting");
      try {
        const session = await sessionFromPazaakAccessToken(accessToken);
        let nakamaMatchId = options.nakamaMatchId;
        if (!nakamaMatchId) {
          const snap = await nakamaMatchSnapshot(accessToken, matchId);
          nakamaMatchId = snap.nakamaMatchId;
        }
        if (!nakamaMatchId || cancelled) {
          options.onConnectionChange?.("disconnected");
          return;
        }

        socket = getNakamaClient().createSocket(nakamaUseSsl()) as DefaultSocket;
        socket.onmatchdata = (md) => {
          if (md.match_id !== nakamaMatchId) return;
          if (md.op_code === NAKAMA_OP_SNAPSHOT) {
            const snap = decodeSnapshotPayload(md.data);
            if (snap) onUpdate(snap);
          } else if (md.op_code === NAKAMA_OP_CHAT) {
            const msg = decodeChatMessagePayload(md.data);
            if (msg) options.onChatMessage?.(msg);
          } else if (md.op_code === NAKAMA_OP_ERROR) {
            try {
              const text = new TextDecoder().decode(md.data);
              const err = JSON.parse(text) as { error?: string };
              if (err?.error) console.warn("[pazaak nakama]", err.error);
            } catch {
              /* ignore */
            }
          }
        };
        socket.ondisconnect = () => {
          if (!cancelled) options.onConnectionChange?.("disconnected");
        };

        await socket.connect(session, false);
        if (cancelled) {
          socket.disconnect(false);
          return;
        }
        await socket.joinMatch(nakamaMatchId);
        options.onConnectionChange?.("connected");
      } catch {
        options.onConnectionChange?.("disconnected");
        scheduleReconnect();
      }
    };

    void run();

    return () => {
      cancelled = true;
      socket?.disconnect(false);
      socket = null;
    };
  }

  return subscribeToReconnectingWebSocket<WsMessage>({
    createUrl: () => `${apiClient.resolveWebSocketBase()}/ws?matchId=${encodeURIComponent(matchId)}`,
    reconnect: options.reconnect,
    maxDelayMs: options.maxDelayMs,
    onConnectionChange: options.onConnectionChange,
    onMessage: (msg: WsMessage) => {
      if (msg.type === "match_update") {
        onUpdate(msg.data);
      } else if (msg.type === "chat_message") {
        options.onChatMessage?.(msg.data);
      }
    },
  });
}

export type LobbyUpdateHandler = () => void;

export function subscribeToLobbies(onUpdate: LobbyUpdateHandler, options: MatchSubscriptionOptions = {}): () => void {
  if (isNakamaBackend()) {
    const id = window.setInterval(() => {
      onUpdate();
    }, 4000);
    return () => window.clearInterval(id);
  }
  return subscribeToReconnectingWebSocket<LobbyWsMessage>({
    createUrl: () => `${apiClient.resolveWebSocketBase()}/ws?stream=lobbies`,
    reconnect: options.reconnect,
    maxDelayMs: options.maxDelayMs,
    onConnectionChange: options.onConnectionChange,
    onMessage: (msg: LobbyWsMessage) => {
      if (msg.type === "lobby_update" || msg.type === "lobby_list_update") {
        onUpdate();
      }
    },
  });
}

export interface TournamentsListResponse {
  tournaments: TournamentStateRecord[];
}

export interface TournamentDetailResponse {
  tournament: TournamentStateRecord;
  bracket: TournamentBracketViewRecord;
  standings: SwissStandingsRowRecord[] | null;
}

export interface CreateTournamentInput {
  name: string;
  format: TournamentFormat;
  gameMode?: PazaakGameMode;
  setsPerMatch?: number;
  rounds?: number;
  maxParticipants?: number | null;
}

export async function fetchTournaments(accessToken: string): Promise<TournamentStateRecord[]> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<TournamentsListResponse>(accessToken, "pazaak.tournaments_list", {});
    return data.tournaments ?? [];
  }
  const data = await apiFetch<TournamentsListResponse>("/api/tournaments", accessToken);
  return data.tournaments;
}

export async function fetchTournament(accessToken: string, tournamentId: string): Promise<TournamentDetailResponse> {
  if (isNakamaBackend()) {
    return nakamaRpc<TournamentDetailResponse>(accessToken, "pazaak.tournament_detail", { tournamentId });
  }
  return apiFetch<TournamentDetailResponse>(`/api/tournaments/${encodeURIComponent(tournamentId)}`, accessToken);
}

export async function createTournament(accessToken: string, input: CreateTournamentInput): Promise<TournamentStateRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ tournament: TournamentStateRecord }>(accessToken, "pazaak.tournament_create", input as object);
    return data.tournament;
  }
  const data = await apiFetch<{ tournament: TournamentStateRecord }>("/api/tournaments", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.tournament;
}

export async function joinTournament(accessToken: string, tournamentId: string): Promise<TournamentStateRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ tournament: TournamentStateRecord }>(accessToken, "pazaak.tournament_join", { tournamentId });
    return data.tournament;
  }
  const data = await apiFetch<{ tournament: TournamentStateRecord }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/join`, accessToken, { method: "POST" });
  return data.tournament;
}

export async function leaveTournament(accessToken: string, tournamentId: string): Promise<TournamentStateRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ tournament: TournamentStateRecord }>(accessToken, "pazaak.tournament_leave", { tournamentId });
    return data.tournament;
  }
  const data = await apiFetch<{ tournament: TournamentStateRecord }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/leave`, accessToken, { method: "POST" });
  return data.tournament;
}

export async function startTournament(accessToken: string, tournamentId: string): Promise<TournamentStateRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ tournament: TournamentStateRecord }>(accessToken, "pazaak.tournament_start", { tournamentId });
    return data.tournament;
  }
  const data = await apiFetch<{ tournament: TournamentStateRecord }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/start`, accessToken, { method: "POST" });
  return data.tournament;
}

export async function reportTournamentMatch(
  accessToken: string,
  tournamentId: string,
  matchId: string,
  winnerUserId: string | null,
): Promise<{ tournament: TournamentStateRecord; tournamentCompleted: boolean }> {
  if (isNakamaBackend()) {
    return nakamaRpc<{ tournament: TournamentStateRecord; tournamentCompleted: boolean }>(accessToken, "pazaak.tournament_report", {
      tournamentId,
      matchId,
      winnerUserId,
    });
  }
  return apiFetch<{ tournament: TournamentStateRecord; tournamentCompleted: boolean }>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/report`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ matchId, winnerUserId }),
    },
  );
}

export async function cancelTournament(accessToken: string, tournamentId: string): Promise<TournamentStateRecord> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ tournament: TournamentStateRecord }>(accessToken, "pazaak.tournament_cancel", { tournamentId });
    return data.tournament;
  }
  const data = await apiFetch<{ tournament: TournamentStateRecord }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/cancel`, accessToken, { method: "POST" });
  return data.tournament;
}

export interface TournamentSubscriptionEvent {
  event: "tournament.updated" | "match.scheduled" | "round.advanced";
  tournamentId: string;
  matchId?: string;
  summary: TournamentStateRecord;
}

export function subscribeToTournaments(
  tournamentId: string,
  onEvent: (event: TournamentSubscriptionEvent) => void,
  options: MatchSubscriptionOptions = {},
): () => void {
  if (isNakamaBackend()) {
    void tournamentId;
    void onEvent;
    void options;
    return () => {};
  }
  return subscribeToReconnectingWebSocket<TournamentSubscriptionEvent>({
    createUrl: () => `${apiClient.resolveWebSocketBase()}/ws/tournaments/${encodeURIComponent(tournamentId)}`,
    reconnect: options.reconnect,
    maxDelayMs: options.maxDelayMs,
    onConnectionChange: options.onConnectionChange,
    onMessage: (msg: TournamentSubscriptionEvent) => {
      if (msg && typeof msg.event === "string") {
        onEvent(msg);
      }
    },
  });
}

export async function sendChatMessage(matchId: string, accessToken: string, text: string): Promise<ChatMessage> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ message: ChatMessage }>(accessToken, "pazaak.chat_send", { matchId, text });
    return data.message;
  }
  const data = await apiFetch<{ message: ChatMessage }>(`/api/match/${encodeURIComponent(matchId)}/chat`, accessToken, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return data.message;
}

export async function fetchChatHistory(matchId: string, accessToken: string): Promise<ChatMessage[]> {
  if (isNakamaBackend()) {
    const data = await nakamaRpc<{ messages: ChatMessage[] }>(accessToken, "pazaak.chat_history", { matchId });
    return data.messages ?? [];
  }
  const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/match/${encodeURIComponent(matchId)}/chat`, accessToken);
  return data.messages;
}

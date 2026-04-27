import type {
  AdvisorDifficulty,
  LeaderboardEntry,
  MatchmakingQueueRecord,
  PazaakOpponentProfileRecord,
  PazaakLobbyRecord,
  PazaakMatchHistoryRecord,
  PazaakTableSettings,
  PazaakUserSettings,
  SavedSideboardCollectionRecord,
  SerializedMatch,
  SideCardOption,
  WalletRecord,
} from "./types.ts";

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

export type SocialAuthProvider = "google" | "discord" | "github";

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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const configuredApiBases = String(import.meta.env.VITE_API_BASES ?? "")
  .split(",")
  .map((value: string) => value.trim())
  .filter((value: string) => value.length > 0);

const apiBases = configuredApiBases.length > 0 ? configuredApiBases : [""];

function buildApiUrl(path: string, base: string): string {
  if (!base) return path;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function fetchApiWithFailover(path: string, init?: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown;

  for (const base of apiBases) {
    const url = buildApiUrl(path, base);
    try {
      const response = await fetch(url, init);
      if (response.status >= 500 && response.status <= 599) {
        lastResponse = response;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Failed to reach API for ${path}`);
}

async function parseJsonBodySafe<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchApiWithFailover(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  const body = await parseJsonBodySafe<Record<string, unknown>>(res);

  if (!res.ok) {
    const message = typeof body?.["error"] === "string" && body["error"].trim().length > 0
      ? body["error"]
      : `HTTP ${res.status}`;
    throw new Error(message);
  }

  if (!body) {
    throw new Error(`Empty response body from ${path}`);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

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

export interface QueueResponse {
  queue: MatchmakingQueueRecord | null;
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

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me", accessToken);
}

export async function registerAccount(input: {
  username: string;
  displayName?: string;
  email?: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetchApiWithFailover("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJsonBodySafe<AuthSessionResponse | { error?: string }>(res);
  if (!res.ok) throw new Error(body && typeof (body as { error?: string }).error === "string" ? (body as { error?: string }).error as string : `HTTP ${res.status}`);
  if (!body) throw new Error("Empty register response from auth service");
  return body as AuthSessionResponse;
}

export async function loginAccount(identifier: string, password: string): Promise<AuthSessionResponse> {
  const res = await fetchApiWithFailover("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const body = await parseJsonBodySafe<AuthSessionResponse | { error?: string }>(res);
  if (!res.ok) throw new Error(body && typeof (body as { error?: string }).error === "string" ? (body as { error?: string }).error as string : `HTTP ${res.status}`);
  if (!body) throw new Error("Empty login response from auth service");
  return body as AuthSessionResponse;
}

export async function fetchSocialAuthProviders(): Promise<SocialAuthProviderListResponse> {
  const res = await fetchApiWithFailover("/api/auth/oauth/providers");
  const body = await parseJsonBodySafe<SocialAuthProviderListResponse | { error?: string }>(res);
  if (!res.ok) throw new Error(body && typeof (body as { error?: string }).error === "string" ? (body as { error?: string }).error as string : `HTTP ${res.status}`);
  if (!body) {
    return {
      providers: [
        { provider: "google", enabled: false },
        { provider: "discord", enabled: false },
        { provider: "github", enabled: false },
      ],
    };
  }
  return body as SocialAuthProviderListResponse;
}

export async function startSocialAuth(provider: SocialAuthProvider): Promise<SocialAuthStartResponse> {
  const res = await fetchApiWithFailover(`/api/auth/oauth/${encodeURIComponent(provider)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = await parseJsonBodySafe<SocialAuthStartResponse | { error?: string }>(res);
  if (!res.ok) throw new Error(body && typeof (body as { error?: string }).error === "string" ? (body as { error?: string }).error as string : `HTTP ${res.status}`);
  if (!body) throw new Error("Empty social auth response from auth service");
  return body as SocialAuthStartResponse;
}

export async function fetchAuthSession(accessToken: string): Promise<{
  account: PazaakAccountRecord;
  linkedIdentities: PazaakLinkedIdentityRecord[];
}> {
  return apiFetch("/api/auth/session", accessToken);
}

export async function logoutAccount(accessToken: string): Promise<void> {
  await apiFetch<{ ok: true }>("/api/auth/logout", accessToken, { method: "POST" });
}

export async function fetchSettings(accessToken: string): Promise<PazaakUserSettings> {
  const data = await apiFetch<SettingsResponse>("/api/settings", accessToken);
  return data.settings;
}

export async function updateSettings(
  accessToken: string,
  settings: Partial<PazaakUserSettings>,
): Promise<PazaakUserSettings> {
  const data = await apiFetch<SettingsResponse>("/api/settings", accessToken, {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return data.settings;
}

export async function fetchLeaderboard(accessToken: string): Promise<LeaderboardEntry[]> {
  const data = await apiFetch<LeaderboardResponse>("/api/leaderboard", accessToken);
  return data.leaders;
}

export async function fetchHistory(accessToken: string, limit = 25): Promise<PazaakMatchHistoryRecord[]> {
  const data = await apiFetch<HistoryResponse>(`/api/me/history?limit=${encodeURIComponent(String(limit))}`, accessToken);
  return data.history;
}

export async function fetchPazaakOpponents(): Promise<PazaakOpponentProfileRecord[]> {
  const res = await fetchApiWithFailover("/api/pazaak/opponents");
  const body = await parseJsonBodySafe<OpponentsResponse | { error?: string }>(res);
  if (!res.ok) throw new Error(body && typeof (body as { error?: string }).error === "string" ? (body as { error?: string }).error as string : `HTTP ${res.status}`);
  if (!body) return [];
  return (body as OpponentsResponse).opponents;
}

export async function enqueueMatchmaking(accessToken: string, preferredMaxPlayers = 2): Promise<MatchmakingQueueRecord | null> {
  const data = await apiFetch<QueueResponse>("/api/matchmaking/enqueue", accessToken, {
    method: "POST",
    body: JSON.stringify({ preferredMaxPlayers }),
  });
  return data.queue;
}

export async function leaveMatchmaking(accessToken: string): Promise<boolean> {
  const data = await apiFetch<{ removed: boolean }>("/api/matchmaking/leave", accessToken, { method: "POST" });
  return data.removed;
}

export async function fetchMatchmakingStatus(accessToken: string): Promise<MatchmakingQueueRecord | null> {
  const data = await apiFetch<QueueResponse>("/api/matchmaking/status", accessToken);
  return data.queue;
}

export async function fetchMatchmakingStats(accessToken: string): Promise<MatchmakingStatsResponse> {
  return apiFetch<MatchmakingStatsResponse>("/api/matchmaking/stats", accessToken);
}

export async function fetchLobbies(accessToken: string): Promise<PazaakLobbyRecord[]> {
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
  },
): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>("/api/lobbies", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!data.lobby) throw new Error("Lobby was not created.");
  return data.lobby;
}

export async function joinLobby(accessToken: string, lobbyId: string, password?: string): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/join`, accessToken, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!data.lobby) throw new Error("Lobby was not joined.");
  return data.lobby;
}

export async function joinLobbyByCode(accessToken: string, lobbyCode: string, password?: string): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>("/api/lobbies/join-by-code", accessToken, {
    method: "POST",
    body: JSON.stringify({ lobbyCode, password }),
  });
  if (!data.lobby) throw new Error("Lobby was not joined.");
  return data.lobby;
}

export async function setLobbyReady(accessToken: string, lobbyId: string, ready: boolean): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, accessToken, {
    method: "POST",
    body: JSON.stringify({ ready }),
  });
  if (!data.lobby) throw new Error("Lobby was not updated.");
  return data.lobby;
}

export async function setLobbyStatus(accessToken: string, lobbyId: string, status: "waiting" | "matchmaking"): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/status`, accessToken, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  if (!data.lobby) throw new Error("Lobby status was not updated.");
  return data.lobby;
}

export async function updateLobbyAiDifficulty(accessToken: string, lobbyId: string, aiUserId: string, difficulty: AdvisorDifficulty): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/ai/${encodeURIComponent(aiUserId)}/difficulty`, accessToken, {
    method: "POST",
    body: JSON.stringify({ difficulty }),
  });
  if (!data.lobby) throw new Error("Lobby AI seat was not updated.");
  return data.lobby;
}

export async function addLobbyAi(accessToken: string, lobbyId: string, difficulty: AdvisorDifficulty): Promise<PazaakLobbyRecord> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/addAi`, accessToken, {
    method: "POST",
    body: JSON.stringify({ difficulty }),
  });
  if (!data.lobby) throw new Error("AI seat was not added.");
  return data.lobby;
}

export async function leaveLobby(accessToken: string, lobbyId: string): Promise<PazaakLobbyRecord | null> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/leave`, accessToken, { method: "POST" });
  return data.lobby;
}

export async function startLobby(accessToken: string, lobbyId: string): Promise<{ lobby: PazaakLobbyRecord; match: SerializedMatch }> {
  const data = await apiFetch<LobbyResponse>(`/api/lobbies/${encodeURIComponent(lobbyId)}/start`, accessToken, { method: "POST" });
  if (!data.lobby || !data.match) throw new Error("Lobby did not start a match.");
  return { lobby: data.lobby, match: data.match };
}

/** Fetch the caller's active match, or null if none exists. */
export async function fetchMyMatch(accessToken: string): Promise<SerializedMatch | null> {
  try {
    const data = await apiFetch<MatchResponse>("/api/match/me", accessToken);
    return data.match;
  } catch (err) {
    if (err instanceof Error && err.message.includes("No active match")) return null;
    throw err;
  }
}

/** Fetch a match by ID. */
export async function fetchMatch(matchId: string, accessToken: string): Promise<SerializedMatch | null> {
  try {
    const data = await apiFetch<MatchResponse>(`/api/match/${matchId}`, accessToken);
    return data.match;
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) return null;
    throw err;
  }
}

export async function fetchSideboards(accessToken: string): Promise<SavedSideboardCollectionRecord> {
  const data = await apiFetch<SideboardsResponse>("/api/sideboards", accessToken);
  return data.sideboards;
}

export async function saveSideboard(
  name: string,
  tokens: string[],
  accessToken: string,
  makeActive = true,
): Promise<SavedSideboardCollectionRecord> {
  const data = await apiFetch<SideboardsResponse>(`/api/sideboards/${encodeURIComponent(name)}`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ tokens, makeActive }),
  });
  return data.sideboards;
}

export async function setActiveSideboard(name: string, accessToken: string): Promise<SavedSideboardCollectionRecord> {
  const data = await apiFetch<SideboardsResponse>("/api/sideboards/active", accessToken, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.sideboards;
}

export async function deleteSideboard(name: string, accessToken: string): Promise<SavedSideboardCollectionRecord> {
  const data = await apiFetch<SideboardsResponse>(`/api/sideboards/${encodeURIComponent(name)}`, accessToken, {
    method: "DELETE",
  });
  return data.sideboards;
}

export async function draw(matchId: string, accessToken: string): Promise<SerializedMatch> {
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/draw`, accessToken, { method: "POST" });
  return data.match;
}

export async function stand(matchId: string, accessToken: string): Promise<SerializedMatch> {
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/stand`, accessToken, { method: "POST" });
  return data.match;
}

export async function endTurn(matchId: string, accessToken: string): Promise<SerializedMatch> {
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/endturn`, accessToken, { method: "POST" });
  return data.match;
}

export async function playSideCard(
  matchId: string,
  accessToken: string,
  option: SideCardOption,
): Promise<SerializedMatch> {
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/play`, accessToken, {
    method: "POST",
    body: JSON.stringify({ cardId: option.cardId, appliedValue: option.appliedValue }),
  });
  return data.match;
}

export async function forfeit(matchId: string, accessToken: string): Promise<SerializedMatch> {
  const data = await apiFetch<MatchResponse>(`/api/match/${matchId}/forfeit`, accessToken, { method: "POST" });
  return data.match;
}

// ---------------------------------------------------------------------------
// WebSocket subscription
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  displayName: string;
  text: string;
  at: number;
}

export type MatchUpdateHandler = (match: SerializedMatch) => void;

export type MatchSocketConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface MatchSubscriptionOptions {
  reconnect?: boolean;
  maxDelayMs?: number;
  onConnectionChange?: (state: MatchSocketConnectionState) => void;
  onChatMessage?: (msg: ChatMessage) => void;
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

/**
 * Opens a WebSocket connection that listens for live match updates.
 * Returns an unsubscribe function.
 */
export function subscribeToMatch(matchId: string, onUpdate: MatchUpdateHandler, options: MatchSubscriptionOptions = {}): () => void {
  const wsBase = window.location.origin.replace(/^http/, "ws");
  const reconnect = options.reconnect !== false;
  const maxDelayMs = options.maxDelayMs ?? 8000;

  let socket: WebSocket | null = null;
  let retryCount = 0;
  let active = true;
  let reconnectTimer: number | undefined;

  const setConnectionState = (state: MatchSocketConnectionState) => {
    options.onConnectionChange?.(state);
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const connect = () => {
    if (!active) return;

    setConnectionState(retryCount === 0 ? "connecting" : "reconnecting");
    socket = new WebSocket(`${wsBase}/ws?matchId=${encodeURIComponent(matchId)}`);

    socket.addEventListener("open", () => {
      retryCount = 0;
      setConnectionState("connected");
    });

    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        if (msg.type === "match_update") {
          onUpdate(msg.data);
        } else if (msg.type === "chat_message") {
          options.onChatMessage?.(msg.data);
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    socket.addEventListener("close", () => {
      if (!active) {
        setConnectionState("disconnected");
        return;
      }

      if (!reconnect) {
        setConnectionState("disconnected");
        return;
      }

      retryCount += 1;
      const delay = Math.min(maxDelayMs, 400 * (2 ** Math.min(retryCount, 5)));
      setConnectionState("reconnecting");
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(connect, delay);
    });

    socket.addEventListener("error", () => {
      // Let close handle reconnect behavior.
    });
  };

  connect();

  return () => {
    active = false;
    clearReconnectTimer();
    setConnectionState("disconnected");
    socket?.close();
  };
}

export type LobbyUpdateHandler = () => void;

/**
 * Opens a WebSocket connection for lobby updates.
 * Emits callback whenever lobby state changes server-side.
 */
export function subscribeToLobbies(onUpdate: LobbyUpdateHandler, options: MatchSubscriptionOptions = {}): () => void {
  const wsBase = window.location.origin.replace(/^http/, "ws");
  const reconnect = options.reconnect !== false;
  const maxDelayMs = options.maxDelayMs ?? 8000;

  let socket: WebSocket | null = null;
  let retryCount = 0;
  let active = true;
  let reconnectTimer: number | undefined;

  const setConnectionState = (state: MatchSocketConnectionState) => {
    options.onConnectionChange?.(state);
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const connect = () => {
    if (!active) return;

    setConnectionState(retryCount === 0 ? "connecting" : "reconnecting");
    socket = new WebSocket(`${wsBase}/ws?stream=lobbies`);

    socket.addEventListener("open", () => {
      retryCount = 0;
      setConnectionState("connected");
    });

    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as LobbyWsMessage;
        if (msg.type === "lobby_update" || msg.type === "lobby_list_update") {
          onUpdate();
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    socket.addEventListener("close", () => {
      if (!active) {
        setConnectionState("disconnected");
        return;
      }

      if (!reconnect) {
        setConnectionState("disconnected");
        return;
      }

      retryCount += 1;
      const delay = Math.min(maxDelayMs, 400 * (2 ** Math.min(retryCount, 5)));
      setConnectionState("reconnecting");
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(connect, delay);
    });

    socket.addEventListener("error", () => {
      // Let close handle reconnect behavior.
    });
  };

  connect();

  return () => {
    active = false;
    clearReconnectTimer();
    setConnectionState("disconnected");
    socket?.close();
  };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendChatMessage(matchId: string, accessToken: string, text: string): Promise<ChatMessage> {
  const data = await apiFetch<{ message: ChatMessage }>(`/api/match/${encodeURIComponent(matchId)}/chat`, accessToken, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return data.message;
}

export async function fetchChatHistory(matchId: string, accessToken: string): Promise<ChatMessage[]> {
  const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/match/${encodeURIComponent(matchId)}/chat`, accessToken);
  return data.messages;
}

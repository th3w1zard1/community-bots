/**
 * Embedded HTTP + WebSocket API server that runs inside the pazaak-bot
 * process and exposes match state to external interfaces (Discord Activities,
 * standalone browser).
 *
 * Architecture:
 *   - The bot's PazaakCoordinator is the single source of truth.
 *   - The HTTP server exposes REST endpoints for all game actions.
 *   - The WebSocket hub pushes match-state snapshots to connected clients
 *     whenever the coordinator mutates a match.
 *   - Discord token verification: clients pass their Discord OAuth2 access
 *     token (obtained by the Activity SDK or the OAuth2 code flow) in the
 *     Authorization header.  The server calls https://discord.com/api/users/@me
 *     to verify the token and extract the caller's user ID before acting.
 */

import type http from "node:http";
import { randomUUID } from "node:crypto";
import type { AiDifficulty, PazaakCoordinator, PazaakMatch, SideDeckChoice } from "@openkotor/pazaak-engine";
import { MAIN_MENU_PRESET, SIDE_DECK_SIZE, assertCustomSideDeckTokenLimits, getDefaultPazaakOpponentForAdvisorDifficulty, normalizeSideDeckToken, pickWinStreakBonusToken, pazaakOpponents, playerAt, rollCrateContents, serializeMatch } from "@openkotor/pazaak-engine";
import {
  buildBrowserCorsAllowedOrigins,
  buildSocialAuthAuthorizeUrl,
  createNodeApiHost,
  createObjectEnvLookup,
  DISCORD_API_V10,
  PAZAAK_SOCIAL_AUTH_PROVIDER_ENV_MAP,
  SOCIAL_AUTH_PROVIDERS,
  fetchDiscordSocialAuthProfile,
  fetchGithubSocialAuthProfile,
  fetchGoogleSocialAuthProfile,
  isLocalhostUrl,
  listSocialAuthProviders,
  requireBearerToken,
  resolveCorsHeaders,
  resolveSocialAuthProviderConfig,
  trimTrailingSlashes,
  type CardGameType,
  type CardWorldConfig,
  type SocialAuthProvider,
} from "@openkotor/platform";
import {
  createOptionalAuthHandler,
  createRequiredAuthHandler,
  createDevBearerAuthResolver,
  createHeaderProfileAuthResolver,
  createSessionAuthResolver,
  resolveOptionalWithAuthResolvers,
  type AuthResolver,
  type BearerAuthContext,
  type NormalizedAuthHandlerError,
} from "@openkotor/platform/auth";
import { InMemoryTopicMessageStore, JsonWebSocketHub } from "@openkotor/platform/node-ws";
import { hashPazaakPassword, verifyPazaakPassword } from "@openkotor/persistence";
import type { SearchProvider } from "@openkotor/retrieval";
import { createTraskHttpRouter } from "@openkotor/trask-http";
import type { ResearchWizardClient } from "@openkotor/trask";
import type {
  PazaakLobbyRecord,
  PazaakAccountRepositoryContract,
  JsonPazaakLobbyRepository,
  JsonPazaakMatchHistoryRepository,
  JsonPazaakMatchmakingQueueRepository,
  JsonPazaakSideboardRepository,
  JsonTraskQueryRepository,
  JsonWalletRepository,
  PazaakAccountRecord,
  PazaakAccountSessionRecord,
  PazaakLinkedIdentityRecord,
  PazaakCardBackStyle,
  PazaakChatAudience,
  PazaakSoundTheme,
  PazaakTableAmbience,
  PazaakTableSettings,
  PazaakTableTheme,
  PazaakLobbySideboardMode,
  PazaakUserSettings,
} from "@openkotor/persistence";
import express, { type Request, type Response, type NextFunction } from "express";
import { cloneDefaultPolicy, toPublicConfig, type PazaakOpsPolicy } from "@openkotor/pazaak-policy";

import { buildMatchMilestoneUpdates } from "./milestone-grants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  discriminator: string;
}

interface GoogleUser {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  picture?: string;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

interface AuthenticatedPazaakUser {
  /** The identity currently used by game/wallet records during migration. */
  id: string;
  accountId: string;
  username: string;
  displayName: string;
  source: "session" | "discord" | "dev";
  discordUserId?: string | undefined;
  sessionId?: string | undefined;
}

interface SerializedAccountSession {
  account: PazaakAccountRecord;
  session: Omit<PazaakAccountSessionRecord, "tokenHash">;
  linkedIdentities: readonly PazaakLinkedIdentityRecord[];
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue | undefined };
type ScalarOrObject = JsonValue | object;

// ---------------------------------------------------------------------------
// Discord token verification
// ---------------------------------------------------------------------------

const DISCORD_API = DISCORD_API_V10;
const APP_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_PUBLIC_WEB_URL = "https://openkotor.github.io/bots/pazaakworld";
const envLookup = createObjectEnvLookup(process.env);
const oauthConfigOptions = {
  envMap: PAZAAK_SOCIAL_AUTH_PROVIDER_ENV_MAP,
  fallbackEnvKeys: {
    discord: {
      clientId: "PAZAAK_DISCORD_APP_ID",
      clientSecret: "PAZAAK_DISCORD_CLIENT_SECRET",
    },
  },
} as const;

const normalizePublicWebUrl = (value: string | undefined): string => {
  const trimmed = value?.trim();
  return trimTrailingSlashes(trimmed && trimmed.length > 0 ? trimmed : DEFAULT_PUBLIC_WEB_URL);
};

const resolveOauthConfig = (provider: SocialAuthProvider) => {
  return resolveSocialAuthProviderConfig(provider, envLookup, oauthConfigOptions);
};

const getSessionExpiresAt = (): string => new Date(Date.now() + APP_SESSION_TTL_MS).toISOString();
const resolveGameUserId = (account: PazaakAccountRecord): string => account.legacyGameUserId ?? account.accountId;

const serializeSession = async (
  accountRepository: PazaakAccountRepositoryContract,
  account: PazaakAccountRecord,
  session: PazaakAccountSessionRecord,
): Promise<SerializedAccountSession> => {
  const { tokenHash: _tokenHash, ...safeSession } = session;
  return {
    account,
    session: safeSession,
    linkedIdentities: await accountRepository.listLinkedIdentities(account.accountId),
  };
};

/** Verify Bearer token → Discord user. Throws on bad/missing token. */
async function resolveDiscordUser(authHeader: string | undefined): Promise<DiscordUser> {
  const token = requireBearerToken(authHeader);

  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw Object.assign(new Error("Invalid Discord access token."), { status: 401 });
  }

  return res.json() as Promise<DiscordUser>;
}

// ---------------------------------------------------------------------------
// JSON serialization helpers  (Set<string> → string[] before sending)
// ---------------------------------------------------------------------------

const safeSerialize = (match: PazaakMatch) => serializeMatch(match);

// ---------------------------------------------------------------------------
// Chat message type
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  displayName: string;
  text: string;
  at: number;
}

// ---------------------------------------------------------------------------
// WebSocket hub — broadcast match updates to all subscribed clients
// ---------------------------------------------------------------------------

type WsStream = "match" | "lobbies";

class WsHub {
  private readonly hub: JsonWebSocketHub<WsStream>;
  private readonly chatHistory = new InMemoryTopicMessageStore<ChatMessage>(100);

  public constructor(server: http.Server) {
    this.hub = new JsonWebSocketHub<WsStream>({
      server,
      path: "/ws",
      resolveSubscription: (url) => {
        const stream = url.searchParams.get("stream") === "lobbies" ? "lobbies" : "match";
        const matchId = url.searchParams.get("matchId") ?? "";
        return { stream, topicId: matchId };
      },
    });
  }

  /** Push a serialized match snapshot to all subscribers of that match. */
  public broadcast(match: PazaakMatch): void {
    this.hub.broadcastToTopic("match", match.id, "match_update", safeSerialize(match));
  }

  /** Push a single lobby snapshot to all lobby stream subscribers. */
  public broadcastLobby(lobby: PazaakLobbyRecord): void {
    this.hub.broadcastToStream("lobbies", "lobby_update", lobby);
  }

  /** Persist a chat message and push it to all match subscribers. */
  public broadcastChatMessage(matchId: string, msg: ChatMessage): void {
    this.chatHistory.append(matchId, msg);
    this.hub.broadcastToTopic("match", matchId, "chat_message", msg);
  }

  /** Return stored chat history for a match. */
  public getChatHistory(matchId: string): ChatMessage[] {
    return this.chatHistory.list(matchId);
  }

  /** Push the current open lobby list to all lobby stream subscribers. */
  public broadcastLobbyList(lobbies: readonly PazaakLobbyRecord[]): void {
    this.hub.broadcastToStream("lobbies", "lobby_list_update", lobbies);
  }
}

// ---------------------------------------------------------------------------
// API Server factory
// ---------------------------------------------------------------------------

export function createApiServer(
  coordinator: PazaakCoordinator,
  opts: {
    port: number;
    discordAppId: string;
    discordClientSecret: string | undefined;
    activityOrigin: string;
    publicWebOrigin: string | undefined;
    accountRepository: PazaakAccountRepositoryContract;
    walletRepository: JsonWalletRepository;
    sideboardRepository: JsonPazaakSideboardRepository;
    matchmakingQueueRepository: JsonPazaakMatchmakingQueueRepository;
    lobbyRepository: JsonPazaakLobbyRepository;
    matchHistoryRepository: JsonPazaakMatchHistoryRepository;
    trask?: {
      searchProvider: SearchProvider;
      researchWizard: ResearchWizardClient;
      queryRepository: JsonTraskQueryRepository;
    } | undefined;
    botGameType?: CardGameType | undefined;
    pazaakRequiresOwnershipProof?: boolean | undefined;
    matchmakingTickMs?: number | undefined;
    allowDevAuth?: boolean | undefined;
    /** When set, served at `GET /api/config/public` (defaults to baked policy). */
    opsPolicy?: PazaakOpsPolicy | undefined;
  },
): { server: http.Server; hub: WsHub; listen: () => void } {
  const app = express();
  const cardWorldConfig: CardWorldConfig = {
    botGameType: opts.botGameType ?? "pazaak",
    defaultPublicGameType: (opts.botGameType ?? "pazaak") === "pazaak" && (opts.pazaakRequiresOwnershipProof ?? true)
      ? "blackjack"
      : (opts.botGameType ?? "pazaak"),
    pazaakRequiresOwnershipProof: opts.pazaakRequiresOwnershipProof ?? true,
    acceptedOwnershipProofFilenames: ["chitin.key"],
  };
  const allowedCorsOrigins = buildBrowserCorsAllowedOrigins({
    discordAppId: opts.discordAppId,
    activityOrigin: opts.activityOrigin,
    publicWebOrigin: opts.publicWebOrigin,
  });

  app.use(express.json());

  // Allow the Discord Activity iframe and localhost browser origins.
  app.use((req, res, next) => {
    const cors = resolveCorsHeaders({ method: req.method, origin: req.headers.origin }, allowedCorsOrigins);
    for (const [name, value] of Object.entries(cors.headers)) {
      res.setHeader(name, value);
    }

    if (cors.isPreflight) {
      res.sendStatus(204);
      return;
    }

    next();
  });

  // withAuth — wraps a handler that needs a verified Pazaak account.
  type AuthedHandler = (req: Request, res: Response, user: AuthenticatedPazaakUser) => void | Promise<void>;
  type OptionalAuthHandler = (req: Request, res: Response, user: AuthenticatedPazaakUser | null) => void | Promise<void>;

  const resolveDiscordDisplayName = (user: DiscordUser): string => user.global_name?.trim() || user.username;
  const resolveDisplayName = (user: AuthenticatedPazaakUser): string => user.displayName;

  const mapResolvedAccountUser = (
    account: PazaakAccountRecord,
    resolved: {
      username: string;
      displayName: string;
      source: AuthenticatedPazaakUser["source"];
      discordUserId?: string | undefined;
      sessionId?: string | undefined;
    },
  ): AuthenticatedPazaakUser => ({
    id: resolveGameUserId(account),
    accountId: account.accountId,
    username: resolved.username,
    displayName: resolved.displayName,
    source: resolved.source,
    ...(resolved.discordUserId ? { discordUserId: resolved.discordUserId } : {}),
    ...(resolved.sessionId ? { sessionId: resolved.sessionId } : {}),
  });

  const authResolvers = [
    createSessionAuthResolver({
      resolveSessionToken: (token) => opts.accountRepository.resolveSessionToken(token),
      mapResolvedSession: ({ account, session }) => mapResolvedAccountUser(account, {
        username: account.username,
        displayName: account.displayName,
        source: "session",
        sessionId: session.sessionId,
      }),
    }),
    createDevBearerAuthResolver<PazaakAccountRecord, AuthenticatedPazaakUser>({
      enabled: opts.allowDevAuth ?? false,
      ensureAccount: ({ providerUserId, username, displayName }) => opts.accountRepository.ensureDiscordAccount({
        discordUserId: providerUserId,
        username,
        displayName,
      }),
      mapResolvedAccount: ({ account, providerUserId, username, displayName }) => mapResolvedAccountUser(account, {
        username,
        displayName,
        source: "dev",
        discordUserId: providerUserId,
      }),
    }),
    createHeaderProfileAuthResolver<DiscordUser, PazaakAccountRecord, AuthenticatedPazaakUser>({
      name: "discord",
      resolveProfile: (authHeader) => resolveDiscordUser(authHeader),
      ensureAccount: ({ providerUserId, username, displayName }) => opts.accountRepository.ensureDiscordAccount({
        discordUserId: providerUserId,
        username,
        displayName,
      }),
      getProviderUserId: (discordUser) => discordUser.id,
      getUsername: (discordUser) => discordUser.username,
      getDisplayName: resolveDiscordDisplayName,
      mapResolvedAccount: ({ account, profile, displayName }) => mapResolvedAccountUser(account, {
        username: account.username,
        displayName,
        source: "discord",
        discordUserId: profile.id,
      }),
    }),
  ] as const satisfies readonly AuthResolver<BearerAuthContext, AuthenticatedPazaakUser>[];

  const sendAuthError = (res: Response, err: NormalizedAuthHandlerError): void => {
    res.status(err.status).json({ error: err.message });
  };

  const authHandlerOptions = {
    resolvers: authResolvers,
    invalidMessage: "Invalid Discord access token.",
    getAuthHeader: (req: Request) => req.headers.authorization,
    sendError: sendAuthError,
  };

  const withAuth = (handler: AuthedHandler) => {
    const wrapped = createRequiredAuthHandler(authHandlerOptions, handler);
    return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      await wrapped(req, res);
    };
  };

  const withOptionalAuth = (handler: OptionalAuthHandler) => {
    const wrapped = createOptionalAuthHandler(authHandlerOptions, handler);
    return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      await wrapped(req, res);
    };
  };

  // Helper: extract a string path param (Express 5 params can be string | string[]).
  const param = (req: Request, name: string): string => String(req.params[name] ?? "");

  app.use(
    "/api/trask",
    createTraskHttpRouter({
      runtime: opts.trask,
      auth: { requireAuth: withAuth },
    }),
  );

  const normalizeSideboardTokens = (value: JsonValue | undefined): string[] => {
    if (!Array.isArray(value) || value.length !== SIDE_DECK_SIZE) {
      throw Object.assign(new Error(`Body must include exactly ${SIDE_DECK_SIZE} sideboard tokens.`), { status: 422 });
    }

    const tokens = value.map((token, index) => {
      if (typeof token !== "string") {
        throw Object.assign(new Error(`Token ${index + 1} must be a string.`), { status: 422 });
      }

      const normalized = normalizeSideDeckToken(token);

      if (!normalized) {
        throw Object.assign(new Error(`Unsupported sideboard token: ${token}`), { status: 422 });
      }

      return normalized;
    });

    try {
      assertCustomSideDeckTokenLimits(tokens);
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { status: 422 });
    }

    return tokens;
  };

  const normalizeOwnedSideDeckTokens = (tokens: readonly string[] | undefined): string[] => {
    return (tokens ?? []).flatMap((token) => {
      if (typeof token !== "string") {
        return [];
      }

      const normalized = normalizeSideDeckToken(token);
      return normalized ? [normalized] : [];
    });
  };

  const countSideDeckTokens = (tokens: readonly string[]): Map<string, number> => {
    const counts = new Map<string, number>();

    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    return counts;
  };

  const buildMissingOwnedTokenMessage = (tokens: readonly string[], ownedTokens: readonly string[]): string => {
    const requestedCounts = countSideDeckTokens(tokens);
    const ownedCounts = countSideDeckTokens(ownedTokens);
    const missing: string[] = [];

    for (const [token, requestedCount] of requestedCounts.entries()) {
      const ownedCount = ownedCounts.get(token) ?? 0;

      if (ownedCount < requestedCount) {
        missing.push(`${token} x${requestedCount - ownedCount}`);
      }
    }

    return missing.length > 0
      ? `This sideboard uses locked cards. Missing unlocks: ${missing.join(", ")}.`
      : "This sideboard uses cards that are not unlocked on this account.";
  };

  const assertSideboardTokensUnlocked = async (userId: string, displayName: string, tokens: readonly string[]): Promise<string[]> => {
    const wallet = await opts.walletRepository.getWallet(userId, displayName);
    const ownedTokens = normalizeOwnedSideDeckTokens(wallet.ownedSideDeckTokens);
    const requestedCounts = countSideDeckTokens(tokens);
    const ownedCounts = countSideDeckTokens(ownedTokens);

    for (const [token, requestedCount] of requestedCounts.entries()) {
      if ((ownedCounts.get(token) ?? 0) < requestedCount) {
        throw Object.assign(new Error(buildMissingOwnedTokenMessage(tokens, ownedTokens)), { status: 409 });
      }
    }

    return ownedTokens;
  };

  const withOwnedSideDeckTokens = async <T extends { sideboards: object }>(payload: T, userId: string, displayName: string): Promise<T & { sideboards: T["sideboards"] & { ownedSideDeckTokens: string[] } }> => {
    const wallet = await opts.walletRepository.getWallet(userId, displayName);
    return {
      ...payload,
      sideboards: {
        ...payload.sideboards,
        ownedSideDeckTokens: normalizeOwnedSideDeckTokens(wallet.ownedSideDeckTokens),
      },
    };
  };

  const parseAiDifficulty = (value: JsonValue | undefined): AiDifficulty => {
    if (value === "easy" || value === "hard" || value === "professional") {
      return value;
    }

    throw Object.assign(new Error("AI difficulty must be easy, hard, or professional."), { status: 422 });
  };

  const parseLobbySideboardMode = (value: JsonValue | undefined): PazaakLobbySideboardMode => {
    if (value === "player_active_custom" || value === "host_mirror_custom") {
      return value;
    }
    return "runtime_random";
  };

  const PAZAAK_TABLE_THEMES = [
    "ebon-hawk",
    "coruscant",
    "tatooine",
    "manaan",
    "dantooine",
    "malachor",
  ] as const satisfies readonly PazaakTableTheme[];

  const PAZAAK_CARD_BACK_STYLES = ["classic", "holographic", "mandalorian", "republic", "sith"] as const satisfies readonly PazaakCardBackStyle[];

  const PAZAAK_TABLE_AMBIENCES = ["cantina", "ebon-hawk", "jedi-archives", "outer-rim", "sith-sanctum"] as const satisfies readonly PazaakTableAmbience[];

  const PAZAAK_SOUND_THEMES = ["default", "cantina", "droid", "force"] as const satisfies readonly PazaakSoundTheme[];

  const PAZAAK_CHAT_AUDIENCES = ["everyone", "guild", "silent"] as const satisfies readonly PazaakChatAudience[];

  const parseLiteral = <T extends string>(allowed: readonly T[], value: JsonValue | undefined): T | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }

    return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
  };

  const parseUserSettingsPartial = (body: Record<string, JsonValue>): Partial<PazaakUserSettings> => {
    const settings: Partial<PazaakUserSettings> = {};

    const tableTheme =
      parseLiteral(PAZAAK_TABLE_THEMES, body.tableTheme)
      ?? parseLiteral(PAZAAK_TABLE_THEMES, body.theme); // legacy alias used by older clients/tests
    if (tableTheme !== undefined) {
      settings.tableTheme = tableTheme;
    }

    const cardBack = parseLiteral(PAZAAK_CARD_BACK_STYLES, body.cardBackStyle);
    if (cardBack !== undefined) {
      settings.cardBackStyle = cardBack;
    }

    const ambience = parseLiteral(PAZAAK_TABLE_AMBIENCES, body.tableAmbience);
    if (ambience !== undefined) {
      settings.tableAmbience = ambience;
    }

    const soundTheme = parseLiteral(PAZAAK_SOUND_THEMES, body.soundTheme);
    if (soundTheme !== undefined) {
      settings.soundTheme = soundTheme;
    }

    const chatAudience = parseLiteral(PAZAAK_CHAT_AUDIENCES, body.chatAudience);
    if (chatAudience !== undefined) {
      settings.chatAudience = chatAudience;
    }

    if (typeof body.soundEnabled === "boolean") {
      settings.soundEnabled = body.soundEnabled;
    }

    if (typeof body.reducedMotionEnabled === "boolean") {
      settings.reducedMotionEnabled = body.reducedMotionEnabled;
    }

    if (typeof body.turnTimerSeconds === "number") {
      settings.turnTimerSeconds = Math.max(10, Math.min(300, Math.trunc(body.turnTimerSeconds)));
    }

    if (body.preferredAiDifficulty !== undefined) {
      settings.preferredAiDifficulty = parseAiDifficulty(body.preferredAiDifficulty);
    }

    if (typeof body.confirmForfeit === "boolean") {
      settings.confirmForfeit = body.confirmForfeit;
    }

    if (typeof body.highlightValidPlays === "boolean") {
      settings.highlightValidPlays = body.highlightValidPlays;
    }

    if (typeof body.focusMode === "boolean") {
      settings.focusMode = body.focusMode;
    }

    if (typeof body.showRatingsInGame === "boolean") {
      settings.showRatingsInGame = body.showRatingsInGame;
    }

    if (typeof body.showGuildEmblems === "boolean") {
      settings.showGuildEmblems = body.showGuildEmblems;
    }

    if (typeof body.showHolocronStreaks === "boolean") {
      settings.showHolocronStreaks = body.showHolocronStreaks;
    }

    if (typeof body.showPostMatchDebrief === "boolean") {
      settings.showPostMatchDebrief = body.showPostMatchDebrief;
    }

    return settings;
  };

  const createSavedSideboardDeckChoice = (tokens: readonly string[], label: string): SideDeckChoice => ({
    tokens: [...tokens],
    label,
    enforceTokenLimits: true,
  });

  const resolveLobbyDeckChoices = async (
    lobby: PazaakLobbyRecord,
    challenger: PazaakLobbyRecord["players"][number],
    opponent: PazaakLobbyRecord["players"][number],
  ): Promise<{ challengerDeck: SideDeckChoice | undefined; opponentDeck: SideDeckChoice | undefined }> => {
    const mode = lobby.tableSettings.sideboardMode;

    if (mode === "runtime_random") {
      return { challengerDeck: undefined, opponentDeck: undefined };
    }

    if (mode === "host_mirror_custom") {
      const hostSideboard = await opts.sideboardRepository.getSideboard(lobby.hostUserId);
      if (!hostSideboard) {
        throw Object.assign(new Error("Host must set an active custom sideboard before starting host-mirrored custom mode."), { status: 409 });
      }

      const label = `Host mirror: ${hostSideboard.name}`;
      return {
        challengerDeck: createSavedSideboardDeckChoice(hostSideboard.tokens, label),
        opponentDeck: createSavedSideboardDeckChoice(hostSideboard.tokens, label),
      };
    }

    const resolveSeatDeck = async (player: PazaakLobbyRecord["players"][number]): Promise<SideDeckChoice | undefined> => {
      if (player.isAi) {
        return undefined;
      }

      const sideboard = await opts.sideboardRepository.getSideboard(player.userId);
      if (!sideboard) {
        throw Object.assign(new Error(`${player.displayName} must set an active custom sideboard before starting this lobby mode.`), { status: 409 });
      }

      return createSavedSideboardDeckChoice(sideboard.tokens, `${player.displayName}: ${sideboard.name}`);
    };

    return {
      challengerDeck: await resolveSeatDeck(challenger),
      opponentDeck: await resolveSeatDeck(opponent),
    };
  };

  type PendingOauthState = {
    provider: SocialAuthProvider;
    expiresAt: number;
    accountId?: string;
    pendingMatchId?: string;
  };

  const oauthStateStore = new Map<string, PendingOauthState>();
  const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;
  const oauthLandingBase = normalizePublicWebUrl(opts.publicWebOrigin);

  const cleanupOauthState = (): void => {
    const now = Date.now();
    for (const [key, entry] of oauthStateStore.entries()) {
      if (entry.expiresAt <= now) {
        oauthStateStore.delete(key);
      }
    }
  };

  const createOauthState = (provider: SocialAuthProvider, accountId?: string, pendingMatchId?: string): string => {
    cleanupOauthState();
    const state = randomUUID().replace(/-/g, "");
    oauthStateStore.set(state, {
      provider,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      ...(accountId ? { accountId } : {}),
      ...(pendingMatchId ? { pendingMatchId } : {}),
    });
    return state;
  };

  const consumeOauthState = (state: string, provider: SocialAuthProvider): PendingOauthState => {
    cleanupOauthState();
    const entry = oauthStateStore.get(state);
    oauthStateStore.delete(state);

    if (!entry || entry.expiresAt <= Date.now() || entry.provider !== provider) {
      throw Object.assign(new Error("OAuth state is invalid or expired."), { status: 401 });
    }

    return entry;
  };

  const resolveCallbackUrl = (provider: SocialAuthProvider, configured: string): string => {
    const configuredCallbackUrl = configured.trim();
    if (configuredCallbackUrl && (!isLocalhostUrl(configuredCallbackUrl) || isLocalhostUrl(oauthLandingBase))) {
      return configuredCallbackUrl;
    }
    return `${oauthLandingBase}/api/auth/oauth/${provider}/callback`;
  };

  const fetchGoogleProfile = async (code: string): Promise<{ providerUserId: string; username: string; displayName: string; email: string | null }> => {
    const config = resolveOauthConfig("google");
    return fetchGoogleSocialAuthProfile(code, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: resolveCallbackUrl("google", config.callbackUrl),
    });
  };

  const fetchDiscordProfile = async (code: string): Promise<{ providerUserId: string; username: string; displayName: string; email: string | null }> => {
    const config = resolveOauthConfig("discord");
    return fetchDiscordSocialAuthProfile(code, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: resolveCallbackUrl("discord", config.callbackUrl),
    }, {
      discordApiBase: DISCORD_API,
      resolveDisplayName: ({ username, global_name }) => resolveDiscordDisplayName({
        id: "",
        username,
        global_name,
        discriminator: "0",
      }),
    });
  };

  const fetchGithubProfile = async (code: string): Promise<{ providerUserId: string; username: string; displayName: string; email: string | null }> => {
    const config = resolveOauthConfig("github");
    return fetchGithubSocialAuthProfile(code, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: resolveCallbackUrl("github", config.callbackUrl),
    }, {
      userAgent: "PazaakWorld/1.0",
    });
  };

  const settleCompletedMatch = async (match: PazaakMatch): Promise<void> => {
    if (match.phase !== "completed" || match.settled || !match.winnerId || !match.winnerName || !match.loserId || !match.loserName) {
      return;
    }

    const preWinner = await opts.walletRepository.getWallet(match.winnerId, match.winnerName);
    const preLoser = await opts.walletRepository.getWallet(match.loserId, match.loserName);

    const { winner } = await opts.walletRepository.recordMatch({
      winnerId: match.winnerId,
      winnerName: match.winnerName,
      loserId: match.loserId,
      loserName: match.loserName,
      wager: match.wager,
    });

    const loserWallet = await opts.walletRepository.getWallet(match.loserId, match.loserName);
    const milestoneUpdates = buildMatchMilestoneUpdates(preWinner, preLoser, winner, loserWallet);
    await opts.walletRepository.applyMatchProgressionDeltas(milestoneUpdates);

    const streakBonus = pickWinStreakBonusToken(winner.streak);
    if (streakBonus) {
      await opts.walletRepository.addOwnedSideDeckTokens(match.winnerId, match.winnerName, [streakBonus]);
    }
    await opts.matchHistoryRepository.append({
      matchId: match.id,
      channelId: match.channelId,
      winnerId: match.winnerId,
      winnerName: match.winnerName,
      loserId: match.loserId,
      loserName: match.loserName,
      wager: match.wager,
      completedAt: new Date(match.updatedAt).toISOString(),
      summary: match.statusLine,
    });
    coordinator.markSettled(match.id);
  };

  const broadcastLobbyState = async (lobby?: PazaakLobbyRecord | null): Promise<void> => {
    if (lobby) {
      hub.broadcastLobby(lobby);
    }
    const openLobbies = await opts.lobbyRepository.listOpen();
    hub.broadcastLobbyList(openLobbies);
  };

  let backgroundTickRunning = false;
  const aiMoveDueAtByStateKey = new Map<string, number>();

  const getAiMoveStateKey = (match: PazaakMatch): string | null => {
    if (match.phase === "completed") {
      return null;
    }

    const activePlayer = playerAt(match, match.activePlayerIndex);
    const difficulty = match.aiSeats?.[activePlayer.userId];
    if (!difficulty) {
      return null;
    }

    return [
      match.id,
      activePlayer.userId,
      difficulty,
      match.phase,
      match.turnStartedAt,
      activePlayer.total,
      activePlayer.board.length,
      activePlayer.sideCardsPlayed.length,
    ].join(":");
  };

  const clearAiMoveSchedulesForMatch = (matchId: string): void => {
    for (const key of aiMoveDueAtByStateKey.keys()) {
      if (key.startsWith(`${matchId}:`)) {
        aiMoveDueAtByStateKey.delete(key);
      }
    }
  };

  const tickAiSeats = (now: number): PazaakMatch[] => {
    const updates: PazaakMatch[] = [];

    for (const match of coordinator.getActiveMatches()) {
      const activePlayer = playerAt(match, match.activePlayerIndex);
      const difficulty = match.aiSeats?.[activePlayer.userId];
      if (!difficulty || match.phase === "completed") {
        continue;
      }

      const stateKey = getAiMoveStateKey(match);
      if (!stateKey) {
        continue;
      }

      let dueAt = aiMoveDueAtByStateKey.get(stateKey);
      if (dueAt === undefined) {
        try {
          dueAt = now + coordinator.recommendAiMove(match.id, activePlayer.userId, difficulty).delayMs;
          aiMoveDueAtByStateKey.set(stateKey, dueAt);
        } catch {
          aiMoveDueAtByStateKey.delete(stateKey);
        }
        continue;
      }

      if (dueAt > now) {
        continue;
      }

      try {
        const update = coordinator.executeAiMove(match.id, activePlayer.userId, difficulty);
        clearAiMoveSchedulesForMatch(match.id);
        updates.push(update);
      } catch {
        aiMoveDueAtByStateKey.delete(stateKey);
      }
    }

    return updates;
  };

  const runBackgroundTick = async (): Promise<void> => {
    if (backgroundTickRunning) {
      return;
    }

    backgroundTickRunning = true;

    try {
      const now = Date.now();
      const aiUpdates = tickAiSeats(now);
      const timerUpdates = coordinator.tickTurnTimers(now);
      const disconnectUpdates = coordinator.tickDisconnectForfeits(now);
      const updatesByMatchId = new Map<string, PazaakMatch>();

      for (const update of [...aiUpdates, ...timerUpdates, ...disconnectUpdates]) {
        updatesByMatchId.set(update.id, update);
      }

      for (const update of updatesByMatchId.values()) {
        await settleCompletedMatch(update);
        if (update.phase === "completed") {
          clearAiMoveSchedulesForMatch(update.id);
        }
        hub.broadcast(update);
      }

      const queue = await opts.matchmakingQueueRepository.list();
      const available = [...queue].sort((left, right) => left.enqueuedAt.localeCompare(right.enqueuedAt));

      const mmrTolerance = (mmr: number): number => {
        if (mmr < 1000) return 200;
        if (mmr < 1500) return 150;
        return 300;
      };

      for (let index = 0; index + 1 < available.length; index += 2) {
        const first = available[index]!;
        const second = available[index + 1]!;

        if (first.userId === second.userId) {
          await opts.matchmakingQueueRepository.remove(second.userId);
          continue;
        }

        const mmrDiff = Math.abs(first.mmr - second.mmr);
        const tolerance = Math.max(mmrTolerance(first.mmr), mmrTolerance(second.mmr));
        if (mmrDiff > tolerance) {
          // Players are too far apart in skill — skip this pair.
          continue;
        }

        if (coordinator.getActiveMatchForUser(first.userId) || coordinator.getActiveMatchForUser(second.userId)) {
          await opts.matchmakingQueueRepository.remove(first.userId);
          await opts.matchmakingQueueRepository.remove(second.userId);
          continue;
        }

        try {
          const match = coordinator.createDirectMatch({
            channelId: `matchmaking:${first.userId}:${second.userId}`,
            challengerId: first.userId,
            challengerName: first.displayName,
            opponentId: second.userId,
            opponentName: second.displayName,
          });
          await opts.matchmakingQueueRepository.remove(first.userId);
          await opts.matchmakingQueueRepository.remove(second.userId);
          hub.broadcast(match);
        } catch {
          // Skip pairing errors for this tick and try again on the next tick.
        }
      }
    } finally {
      backgroundTickRunning = false;
    }
  };

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /**
   * POST /api/auth/token
   * Exchanges a Discord OAuth2 authorization code for an access token.
   * Required by the Discord Embedded App SDK auth flow.
   * Body: { code: string }
   */
  app.post("/api/auth/token", async (req, res): Promise<void> => {
    const { code } = req.body as { code?: string };

    if (typeof code !== "string" || !code) {
      res.status(422).json({ error: "Body must include a code string." });
      return;
    }

    if (!opts.discordClientSecret) {
      res.status(501).json({ error: "OAuth2 token exchange is not configured on this server." });
      return;
    }

    const params = new URLSearchParams({
      client_id: opts.discordAppId,
      client_secret: opts.discordClientSecret,
      grant_type: "authorization_code",
      code,
    });

    const discordRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!discordRes.ok) {
      const text = await discordRes.text();
      res.status(401).json({ error: `Token exchange failed: ${text}` });
      return;
    }

    const data = await discordRes.json() as { access_token: string };
    const discordUser = await resolveDiscordUser(`Bearer ${data.access_token}`);
    const { account } = await opts.accountRepository.ensureDiscordAccount({
      discordUserId: discordUser.id,
      username: discordUser.username,
      displayName: resolveDiscordDisplayName(discordUser),
    });
    const { token: appToken, session } = await opts.accountRepository.createSession(account.accountId, {
      expiresAt: getSessionExpiresAt(),
      label: "Discord Activity",
    });

    res.json({
      access_token: data.access_token,
      app_token: appToken,
      token_type: "Bearer",
      ...(await serializeSession(opts.accountRepository, account, session)),
    });
  });

  app.post("/api/auth/register", async (req, res): Promise<void> => {
    const body = req.body as JsonObject & { username?: JsonValue; displayName?: JsonValue; email?: JsonValue; password?: JsonValue };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const password = typeof body.password === "string" ? body.password : "";

    if (username.length < 3 || username.length > 32) {
      res.status(422).json({ error: "Username must be between 3 and 32 characters." });
      return;
    }

    if (password.length < 10) {
      res.status(422).json({ error: "Password must be at least 10 characters." });
      return;
    }

    try {
      const account = await opts.accountRepository.createPasswordAccount({
        username,
        displayName,
        email,
        passwordHash: await hashPazaakPassword(password),
      });
      const { token: appToken, session } = await opts.accountRepository.createSession(account.accountId, {
        expiresAt: getSessionExpiresAt(),
        label: "Password Login",
      });
      res.status(201).json({ app_token: appToken, token_type: "Bearer", ...(await serializeSession(opts.accountRepository, account, session)) });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/auth/login", async (req, res): Promise<void> => {
    const body = req.body as JsonObject & { identifier?: JsonValue; username?: JsonValue; password?: JsonValue };
    const identifier = typeof body.identifier === "string"
      ? body.identifier.trim()
      : typeof body.username === "string"
        ? body.username.trim()
        : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!identifier || !password) {
      res.status(422).json({ error: "Identifier and password are required." });
      return;
    }

    const record = await opts.accountRepository.findPasswordAccount(identifier);

    if (!record || !(await verifyPazaakPassword(password, record.credential.passwordHash))) {
      res.status(401).json({ error: "Invalid username/email or password." });
      return;
    }

    const { token: appToken, session } = await opts.accountRepository.createSession(record.account.accountId, {
      expiresAt: getSessionExpiresAt(),
      label: "Password Login",
    });
    res.json({ app_token: appToken, token_type: "Bearer", ...(await serializeSession(opts.accountRepository, record.account, session)) });
  });

  app.get("/api/auth/session", withAuth(async (_req, res, user) => {
    const account = await opts.accountRepository.getAccount(user.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    res.json({ account, linkedIdentities: await opts.accountRepository.listLinkedIdentities(account.accountId), user });
  }));

  app.post("/api/auth/logout", withAuth(async (_req, res, user) => {
    if (user.sessionId) {
      await opts.accountRepository.deleteSession(user.sessionId);
    }

    res.json({ ok: true });
  }));

  app.get("/api/auth/linked-identities", withAuth(async (_req, res, user) => {
    res.json({ linkedIdentities: await opts.accountRepository.listLinkedIdentities(user.accountId) });
  }));

  app.post("/api/auth/discord/link", withAuth(async (req, res, user) => {
    const { access_token: accessToken } = req.body as { access_token?: JsonValue };

    if (typeof accessToken !== "string" || !accessToken) {
      res.status(422).json({ error: "Body must include a Discord access_token." });
      return;
    }

    try {
      const discordUser = await resolveDiscordUser(`Bearer ${accessToken}`);
      const identity = await opts.accountRepository.linkDiscordAccount(user.accountId, {
        discordUserId: discordUser.id,
        username: discordUser.username,
        displayName: resolveDiscordDisplayName(discordUser),
      });
      res.json({ identity, linkedIdentities: await opts.accountRepository.listLinkedIdentities(user.accountId) });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 409;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /** GET /api/health  —  basic liveness check */
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** HEAD/GET /api/ping  —  lightweight latency probe for Activity connection status. */
  app.head("/api/ping", (_req, res) => {
    res.status(204).end();
  });

  app.get("/api/ping", (_req, res) => {
    res.status(204).end();
  });

  app.get("/api/config/public", (_req, res) => {
    res.json(toPublicConfig(opts.opsPolicy ?? cloneDefaultPolicy()));
  });

  app.get("/api/cardworld/config", (_req, res) => {
    res.json(cardWorldConfig);
  });

  app.get("/api/ui/main-menu", (_req, res) => {
    res.json({
      preset: MAIN_MENU_PRESET,
      serverTime: new Date().toISOString(),
    });
  });

  app.get("/api/pazaak/opponents", (_req, res) => {
    res.json({
      opponents: pazaakOpponents,
      serverTime: new Date().toISOString(),
    });
  });

  app.get("/api/auth/oauth/providers", (_req, res) => {
    res.json({
      providers: listSocialAuthProviders(envLookup, oauthConfigOptions),
    });
  });

  const buildProviderAuthorizeUrl = (provider: SocialAuthProvider, state: string): string => {
    const config = resolveOauthConfig(provider);
    return buildSocialAuthAuthorizeUrl(provider, {
      clientId: config.clientId,
      redirectUri: resolveCallbackUrl(provider, config.callbackUrl),
      state,
      ...(config.startUrl ? { startUrl: config.startUrl } : {}),
    }, {
      discordApiBase: DISCORD_API,
      ...(provider === "google" ? { googlePrompt: "select_account" } : {}),
      ...(provider === "discord" ? { discordPrompt: "consent" } : {}),
    });
  };

  app.post("/api/auth/oauth/:provider/start", async (req, res) => {
    const providerParam = (req.params.provider ?? "").toLowerCase();
    if (!SOCIAL_AUTH_PROVIDERS.includes(providerParam as SocialAuthProvider)) {
      res.status(404).json({ error: "Unsupported OAuth provider." });
      return;
    }

    const provider = providerParam as SocialAuthProvider;
    const config = resolveOauthConfig(provider);
    if (!config.enabled) {
      res.status(501).json({
        error: `OAuth provider ${provider} is not configured on this server.`,
      });
      return;
    }

    let accountId: string | undefined;
    try {
      const user = await resolveOptionalWithAuthResolvers(
        req.headers.authorization,
        authResolvers,
        "Invalid Discord access token.",
      );
      accountId = user?.accountId;
    } catch {
      // Continue as login flow for anonymous users.
    }

    const body = req.body as { matchId?: JsonValue };
    const pendingMatchId = typeof body.matchId === "string" && body.matchId.trim() ? body.matchId.trim() : undefined;

    const state = createOauthState(provider, accountId, pendingMatchId);
    const redirectUrl = buildProviderAuthorizeUrl(provider, state);

    res.json({ provider, redirectUrl });
  });

  app.get("/api/auth/oauth/:provider/callback", async (req, res) => {
    const providerParam = (req.params.provider ?? "").toLowerCase();
    if (!SOCIAL_AUTH_PROVIDERS.includes(providerParam as SocialAuthProvider)) {
      res.status(404).send("Unsupported OAuth provider.");
      return;
    }

    const provider = providerParam as SocialAuthProvider;
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";

    const redirect = new URL("/", oauthLandingBase);

    if (error) {
      redirect.searchParams.set("oauth_error", error);
      if (typeof req.query.error_description === "string") {
        redirect.searchParams.set("oauth_error_description", req.query.error_description);
      }
      res.redirect(302, redirect.toString());
      return;
    }

    if (!code || !state) {
      redirect.searchParams.set("oauth_error", "missing_code_or_state");
      res.redirect(302, redirect.toString());
      return;
    }

    try {
      const pending = consumeOauthState(state, provider);
      const profile = provider === "google"
        ? await fetchGoogleProfile(code)
        : provider === "discord"
          ? await fetchDiscordProfile(code)
          : await fetchGithubProfile(code);

      if (pending.accountId) {
        await opts.accountRepository.linkExternalIdentity(pending.accountId, {
          provider,
          providerUserId: profile.providerUserId,
          username: profile.username,
          displayName: profile.displayName,
        });
        const account = await opts.accountRepository.getAccount(pending.accountId);
        if (!account) {
          throw Object.assign(new Error("Account not found after linking OAuth identity."), { status: 404 });
        }
        const { token: appToken } = await opts.accountRepository.createSession(account.accountId, {
          expiresAt: getSessionExpiresAt(),
          label: `${provider} OAuth`,
        });
        redirect.searchParams.set("oauth_provider", provider);
        redirect.searchParams.set("oauth_app_token", appToken);
        redirect.searchParams.set("oauth_username", account.displayName);
        redirect.searchParams.set("oauth_user_id", resolveGameUserId(account));
        if (pending.pendingMatchId) redirect.searchParams.set("matchId", pending.pendingMatchId);
        res.redirect(302, redirect.toString());
        return;
      }

      const ensured = await opts.accountRepository.ensureExternalAccount({
        provider,
        providerUserId: profile.providerUserId,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        legacyGameUserId: provider === "discord" ? profile.providerUserId : null,
      });
      const { token: appToken } = await opts.accountRepository.createSession(ensured.account.accountId, {
        expiresAt: getSessionExpiresAt(),
        label: `${provider} OAuth`,
      });

      redirect.searchParams.set("oauth_provider", provider);
      redirect.searchParams.set("oauth_app_token", appToken);
      redirect.searchParams.set("oauth_username", ensured.account.displayName);
      redirect.searchParams.set("oauth_user_id", resolveGameUserId(ensured.account));
      if (pending.pendingMatchId) redirect.searchParams.set("matchId", pending.pendingMatchId);
      res.redirect(302, redirect.toString());
    } catch (err) {
      redirect.searchParams.set("oauth_error", err instanceof Error ? err.message : String(err));
      res.redirect(302, redirect.toString());
    }
  });

  app.get("/api/me", withAuth(async (_req, res, user) => {
    const wallet = await opts.walletRepository.getWallet(user.id, resolveDisplayName(user));
    const queue = await opts.matchmakingQueueRepository.get(user.id);
    const match = coordinator.getActiveMatchForUser(user.id);
    res.json({ user: { id: user.id, username: user.username, displayName: resolveDisplayName(user) }, wallet, queue, match: match ? safeSerialize(match) : null });
  }));

  app.get("/api/settings", withAuth(async (_req, res, user) => {
    const settings = await opts.walletRepository.getUserSettings(user.id, resolveDisplayName(user));
    res.json({ settings });
  }));

  app.put("/api/settings", withAuth(async (req, res, user) => {
    try {
      const body = req.body as Record<string, JsonValue>;
      const settings = parseUserSettingsPartial(body);

      const wallet = await opts.walletRepository.updateUserSettings(user.id, resolveDisplayName(user), settings);
      res.json({ settings: wallet.userSettings, wallet });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.post("/api/crates/open", withAuth(async (req, res, user) => {
    try {
      const kindRaw = (req.body as { kind?: JsonValue }).kind;
      const kind = kindRaw === "premium" ? "premium" : "standard";
      const rolled = rollCrateContents(kind);
      const wallet = await opts.walletRepository.consumeCrateAndApplyDrops(user.id, resolveDisplayName(user), kind, rolled);
      res.json({ wallet, opened: rolled, kind });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.get("/api/leaderboard", withAuth(async (_req, res) => {
    const wallets = await opts.walletRepository.listWallets();
    const leaders = [...wallets]
      .sort((left, right) => right.mmr - left.mmr || right.gamesWon - left.gamesWon || right.balance - left.balance)
      .slice(0, 50)
      .map((wallet, index) => ({
        rank: index + 1,
        userId: wallet.userId,
        displayName: wallet.displayName,
        mmr: wallet.mmr,
        gamesPlayed: wallet.gamesPlayed,
        gamesWon: wallet.gamesWon,
        wins: wallet.wins,
        losses: wallet.losses,
        balance: wallet.balance,
      }));
    res.json({ leaders });
  }));

  app.get("/api/me/history", withAuth(async (req, res, user) => {
    const limitRaw = Number(req.query.limit ?? 25);
    const history = await opts.matchHistoryRepository.listForUser(user.id, Number.isFinite(limitRaw) ? limitRaw : 25);
    res.json({ history });
  }));

  app.post("/api/matchmaking/enqueue", withAuth(async (req, res, user) => {
    const wallet = await opts.walletRepository.getWallet(user.id, resolveDisplayName(user));
    const preferredMaxPlayers = Number((req.body as { preferredMaxPlayers?: JsonValue }).preferredMaxPlayers ?? 2);
    const queue = await opts.matchmakingQueueRepository.enqueue({
      userId: user.id,
      displayName: resolveDisplayName(user),
      mmr: wallet.mmr,
      preferredMaxPlayers: Number.isFinite(preferredMaxPlayers) ? preferredMaxPlayers : 2,
    });
    await broadcastLobbyState();
    res.json({ queue });
  }));

  app.post("/api/matchmaking/leave", withAuth(async (_req, res, user) => {
    const removed = await opts.matchmakingQueueRepository.remove(user.id);
    await broadcastLobbyState();
    res.json({ removed });
  }));

  app.get("/api/matchmaking/status", withAuth(async (_req, res, user) => {
    const queue = await opts.matchmakingQueueRepository.get(user.id);
    res.json({ queue: queue ?? null });
  }));

  app.get("/api/matchmaking/stats", withAuth(async (_req, res) => {
    const queue = await opts.matchmakingQueueRepository.list();
    const lobbies = await opts.lobbyRepository.listOpen();
    const activeMatches = coordinator.getActiveMatches();
    const now = Date.now();
    const averageWaitSeconds = queue.length === 0
      ? 0
      : Math.round(queue.reduce((sum, entry) => sum + Math.max(0, now - new Date(entry.enqueuedAt).getTime()), 0) / queue.length / 1000);
    const averageWaitTime = averageWaitSeconds >= 120
      ? `~${Math.max(1, Math.round(averageWaitSeconds / 60))}m`
      : `~${Math.max(0, averageWaitSeconds)}s`;

    res.json({
      playersInQueue: queue.length,
      openLobbies: lobbies.length,
      activeGames: activeMatches.length,
      averageWaitSeconds,
      averageWaitTime,
      queueUpdatedAt: new Date(now).toISOString(),
    });
  }));

  app.get("/api/lobbies", withAuth(async (_req, res) => {
    const lobbies = await opts.lobbyRepository.listOpen();
    res.json({ lobbies });
  }));

  app.post("/api/lobbies", withAuth(async (req, res, user) => {
    const body = req.body as {
      name?: JsonValue;
      maxPlayers?: JsonValue;
      password?: JsonValue;
      variant?: JsonValue;
      tableSettings?: Partial<PazaakTableSettings> | undefined;
      maxRounds?: JsonValue;
      turnTimerSeconds?: JsonValue;
      ranked?: JsonValue;
      allowAiFill?: JsonValue;
      sideboardMode?: JsonValue;
      gameMode?: JsonValue;
    };

    const maxPlayers = Number(body.maxPlayers ?? 2);
    const maxRounds = Number(body.maxRounds ?? 3);
    const turnTimerSeconds = Number(body.turnTimerSeconds ?? 120);
    const variant = body.variant === "multi_seat" ? "multi_seat" : "canonical";

    const tableSettings: Partial<PazaakTableSettings> = {
      ...(body.tableSettings ?? {}),
      variant,
      maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : 2,
      maxRounds: Number.isFinite(maxRounds) ? maxRounds : 3,
      turnTimerSeconds: Number.isFinite(turnTimerSeconds) ? turnTimerSeconds : 120,
    };
    if (typeof body.ranked === "boolean") {
      tableSettings.ranked = body.ranked;
    }
    if (typeof body.allowAiFill === "boolean") {
      tableSettings.allowAiFill = body.allowAiFill;
    }
    tableSettings.sideboardMode = parseLobbySideboardMode(body.sideboardMode ?? body.tableSettings?.sideboardMode);
    const requestedGameMode = body.gameMode ?? body.tableSettings?.gameMode;
    const rankedGuard = tableSettings.ranked === true;
    tableSettings.gameMode = rankedGuard ? "canonical" : (requestedGameMode === "wacky" ? "wacky" : "canonical");

    const lobby = await opts.lobbyRepository.create({
      name: typeof body.name === "string" ? body.name : `${resolveDisplayName(user)}'s Table`,
      hostUserId: user.id,
      hostName: resolveDisplayName(user),
      maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : 2,
      password: typeof body.password === "string" ? body.password : undefined,
      tableSettings,
    });
    await broadcastLobbyState(lobby);
    res.json({ lobby });
  }));

  app.post("/api/lobbies/join-by-code", withAuth(async (req, res, user) => {
    try {
      const { lobbyCode, password } = req.body as { lobbyCode?: string; password?: string };

      if (!lobbyCode || !lobbyCode.trim()) {
        res.status(422).json({ error: "Lobby code is required." });
        return;
      }

      const lobby = await opts.lobbyRepository.getByCode(lobbyCode);
      if (!lobby) {
        res.status(404).json({ error: "Lobby not found for that code." });
        return;
      }

      const joinedLobby = await opts.lobbyRepository.join(lobby.id, { userId: user.id, displayName: resolveDisplayName(user), password });
      await broadcastLobbyState(joinedLobby);
      res.json({ lobby: joinedLobby });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.post("/api/lobbies/:lobbyId/join", withAuth(async (req, res, user) => {
    try {
      const { password } = req.body as { password?: string };
      const lobby = await opts.lobbyRepository.join(param(req, "lobbyId"), { userId: user.id, displayName: resolveDisplayName(user), password });
      await broadcastLobbyState(lobby);
      res.json({ lobby });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.post("/api/lobbies/:lobbyId/ready", withAuth(async (req, res, user) => {
    const ready = (req.body as { ready?: JsonValue }).ready !== false;
    const lobby = await opts.lobbyRepository.setReady(param(req, "lobbyId"), user.id, ready);
    await broadcastLobbyState(lobby);
    res.json({ lobby });
  }));

  app.post("/api/lobbies/:lobbyId/status", withAuth(async (req, res, user) => {
    try {
      const statusRaw = (req.body as { status?: JsonValue }).status;
      const status = statusRaw === "matchmaking" ? "matchmaking" : "waiting";
      const lobby = await opts.lobbyRepository.setStatus(param(req, "lobbyId"), user.id, status);
      await broadcastLobbyState(lobby);
      res.json({ lobby });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.post("/api/lobbies/:lobbyId/addAi", withAuth(async (req, res, user) => {
    try {
      const difficulty = parseAiDifficulty((req.body as { difficulty?: JsonValue }).difficulty ?? "professional");
      const lobby = await opts.lobbyRepository.addAi(param(req, "lobbyId"), user.id, difficulty);
      await broadcastLobbyState(lobby);
      res.json({ lobby });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.post("/api/lobbies/:lobbyId/ai/:aiUserId/difficulty", withAuth(async (req, res, user) => {
    try {
      const difficulty = parseAiDifficulty((req.body as { difficulty?: JsonValue }).difficulty ?? "professional");
      const lobby = await opts.lobbyRepository.updateAiDifficulty(
        param(req, "lobbyId"),
        user.id,
        decodeURIComponent(param(req, "aiUserId")),
        difficulty,
      );
      await broadcastLobbyState(lobby);
      res.json({ lobby });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  app.post("/api/lobbies/:lobbyId/leave", withAuth(async (req, res, user) => {
    const lobby = await opts.lobbyRepository.leave(param(req, "lobbyId"), user.id);
    await broadcastLobbyState(lobby);
    res.json({ lobby: lobby ?? null });
  }));

  app.post("/api/lobbies/:lobbyId/start", withAuth(async (req, res, user) => {
    try {
      const lobby = await opts.lobbyRepository.get(param(req, "lobbyId"));

      if (!lobby) {
        res.status(404).json({ error: "Lobby not found." });
        return;
      }

      if (lobby.hostUserId !== user.id) {
        res.status(403).json({ error: "Only the lobby host can start the match." });
        return;
      }

      const readyPlayers = lobby.players.filter((player) => player.ready);

      if (lobby.tableSettings.variant === "canonical" && lobby.players.length !== 2) {
        res.status(409).json({ error: "Canonical tables start once exactly two seats are occupied and ready." });
        return;
      }

      if (readyPlayers.length !== 2) {
        res.status(409).json({ error: "Select exactly two ready seats before starting. Multi-seat lobbies can keep additional non-ready seats waiting." });
        return;
      }

      const [challenger, opponent] = readyPlayers;
      const deckChoices = await resolveLobbyDeckChoices(lobby, challenger!, opponent!);
      const aiOpponent = opponent!.aiDifficulty ? getDefaultPazaakOpponentForAdvisorDifficulty(opponent!.aiDifficulty) : undefined;
      const lobbyGameMode = lobby.tableSettings.gameMode === "wacky" && lobby.tableSettings.ranked !== true ? "wacky" : "canonical";
      const match = coordinator.createDirectMatch({
        channelId: `lobby:${lobby.id}`,
        challengerId: challenger!.userId,
        challengerName: challenger!.displayName,
        challengerDeck: deckChoices.challengerDeck,
        opponentId: opponent!.userId,
        opponentName: aiOpponent?.name ?? opponent!.displayName,
        opponentDeck: aiOpponent
          ? { tokens: [...aiOpponent.sideDeckTokens], label: `${aiOpponent.name} Deck`, enforceTokenLimits: true }
          : deckChoices.opponentDeck,
        opponentAiDifficulty: opponent!.aiDifficulty,
        setsToWin: lobby.tableSettings.maxRounds,
        gameMode: lobbyGameMode,
      });
      const updatedLobby = await opts.lobbyRepository.markInGame(lobby.id, match.id);
      hub.broadcast(match);
      await broadcastLobbyState(updatedLobby);
      res.json({ lobby: updatedLobby, match: safeSerialize(match) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * GET /api/match/me
   * Returns the caller's active match (or 404 if none).
   */
  app.get("/api/match/me", withAuth((req, res, user) => {
    const match = coordinator.getActiveMatchForUser(user.id);

    if (!match) {
      res.status(404).json({ error: "No active match." });
      return;
    }

    res.json({ match: safeSerialize(match) });
  }));

  /**
   * GET /api/match/:matchId
   * Returns a single match by ID. Accessible to unauthenticated spectators (read-only).
   */
  app.get("/api/match/:matchId", withOptionalAuth((req, res) => {
    const match = coordinator.getMatch(param(req, "matchId"));

    if (!match) {
      res.status(404).json({ error: "Match not found." });
      return;
    }

    res.json({ match: safeSerialize(match) });
  }));

  /**
   * GET /api/sideboards
   * Returns the caller's saved named custom sideboards.
   */
  app.get("/api/sideboards", withAuth(async (_req, res, user) => {
    const sideboards = await opts.sideboardRepository.listSideboards(user.id, resolveDisplayName(user));
    res.json(await withOwnedSideDeckTokens({ sideboards }, user.id, resolveDisplayName(user)));
  }));

  /**
   * PUT /api/sideboards/:name
   * Creates or updates one named saved sideboard.
   * Body: { tokens: string[]; makeActive?: boolean }
   */
  app.put("/api/sideboards/:name", withAuth(async (req, res, user) => {
    const sideboardName = param(req, "name").trim();

    if (!sideboardName) {
      res.status(422).json({ error: "Sideboard name is required." });
      return;
    }

    try {
      const { makeActive } = req.body as { makeActive?: boolean };
      const tokens = normalizeSideboardTokens((req.body as { tokens?: JsonValue }).tokens);
      await assertSideboardTokensUnlocked(user.id, resolveDisplayName(user), tokens);
      const sideboard = await opts.sideboardRepository.saveSideboard(
        user.id,
        resolveDisplayName(user),
        tokens,
        sideboardName,
        makeActive ?? true,
      );
      const sideboards = await opts.sideboardRepository.listSideboards(user.id, resolveDisplayName(user));
      res.json(await withOwnedSideDeckTokens({ sideboard, sideboards }, user.id, resolveDisplayName(user)));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * POST /api/sideboards/active
   * Sets the active named sideboard.
   * Body: { name: string }
   */
  app.post("/api/sideboards/active", withAuth(async (req, res, user) => {
    const { name } = req.body as { name?: string };

    if (typeof name !== "string" || !name.trim()) {
      res.status(422).json({ error: "Body must include a sideboard name." });
      return;
    }

    try {
      const sideboard = await opts.sideboardRepository.setActiveSideboard(user.id, resolveDisplayName(user), name);
      const sideboards = await opts.sideboardRepository.listSideboards(user.id, resolveDisplayName(user));
      res.json(await withOwnedSideDeckTokens({ sideboard, sideboards }, user.id, resolveDisplayName(user)));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * DELETE /api/sideboards/:name
   * Deletes one named saved sideboard.
   */
  app.delete("/api/sideboards/:name", withAuth(async (req, res, user) => {
    const sideboardName = param(req, "name").trim();

    if (!sideboardName) {
      res.status(422).json({ error: "Sideboard name is required." });
      return;
    }

    const removed = await opts.sideboardRepository.clearSideboard(user.id, sideboardName);

    if (!removed) {
      res.status(404).json({ error: `No saved sideboard named \"${sideboardName}\" exists.` });
      return;
    }

    const sideboards = await opts.sideboardRepository.listSideboards(user.id, resolveDisplayName(user));
    res.json(await withOwnedSideDeckTokens({ sideboards }, user.id, resolveDisplayName(user)));
  }));

  /**
   * POST /api/match/:matchId/draw
   * Draw the next card from the main deck.
   */
  app.post("/api/match/:matchId/draw", withAuth(async (req, res, user) => {
    try {
      const match = coordinator.draw(param(req, "matchId"), user.id);
      await settleCompletedMatch(match);
      hub.broadcast(match);
      res.json({ match: safeSerialize(match) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * POST /api/match/:matchId/stand
   * Stand on the current total.
   */
  app.post("/api/match/:matchId/stand", withAuth(async (req, res, user) => {
    try {
      const match = coordinator.stand(param(req, "matchId"), user.id);
      await settleCompletedMatch(match);
      hub.broadcast(match);
      res.json({ match: safeSerialize(match) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * POST /api/match/:matchId/endturn
   * End the turn without standing.
   */
  app.post("/api/match/:matchId/endturn", withAuth(async (req, res, user) => {
    try {
      const match = coordinator.endTurn(param(req, "matchId"), user.id);
      await settleCompletedMatch(match);
      hub.broadcast(match);
      res.json({ match: safeSerialize(match) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * POST /api/match/:matchId/play
   * Play a side card from the hand.
   * Body: { cardId: string; appliedValue: number }
   */
  app.post("/api/match/:matchId/play", withAuth(async (req, res, user) => {
    const { cardId, appliedValue } = req.body as { cardId?: string; appliedValue?: number };

    if (typeof cardId !== "string" || typeof appliedValue !== "number") {
      res.status(422).json({ error: "Body must include cardId (string) and appliedValue (number)." });
      return;
    }

    try {
      const match = coordinator.playSideCard(param(req, "matchId"), user.id, cardId, appliedValue);
      await settleCompletedMatch(match);
      hub.broadcast(match);
      res.json({ match: safeSerialize(match) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }));

  /**
   * POST /api/match/:matchId/forfeit
   * Forfeit the match.
   */
  const forfeitHandler = withAuth(async (req, res, user) => {
    try {
      const match = coordinator.forfeit(param(req, "matchId"), user.id);
      await settleCompletedMatch(match);
      hub.broadcast(match);
      res.json({ match: safeSerialize(match) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/match/:matchId/forfeit", forfeitHandler);
  app.post("/api/match/:matchId/concede", forfeitHandler);

  /**
   * GET /api/match/:matchId/chat
   * Fetch chat message history for a match.
   */
  app.get("/api/match/:matchId/chat", withAuth((req, res) => {
    const matchId = param(req, "matchId");
    res.json({ messages: hub.getChatHistory(matchId) });
  }));

  /**
   * POST /api/match/:matchId/chat
   * Send a chat message to all match participants.
   */
  app.post("/api/match/:matchId/chat", withAuth((req, res, user) => {
    const matchId = param(req, "matchId");
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 300) : "";
    if (!text) {
      res.status(422).json({ error: "Message text is required." });
      return;
    }
    const msg: ChatMessage = {
      id: randomUUID(),
      matchId,
      userId: user.id,
      displayName: resolveDisplayName(user),
      text,
      at: Date.now(),
    };
    hub.broadcastChatMessage(matchId, msg);
    res.status(201).json({ message: msg });
  }));

  // Catch-all 404.
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  const host = createNodeApiHost({
    requestListener: app,
    createHub: (server) => new WsHub(server),
  });
  const { server, hub } = host;
  let backgroundInterval: NodeJS.Timeout | undefined;

  server.on("close", () => {
    if (backgroundInterval) {
      clearInterval(backgroundInterval);
      backgroundInterval = undefined;
    }
  });

  return {
    server,
    hub,
    listen: () => {
      host.listen(opts.port, () => {
        console.info(`[pazaak-api] Listening on http://localhost:${opts.port}`);
      });

      if (!backgroundInterval) {
        const tickMs = Math.max(250, opts.matchmakingTickMs ?? 5_000);
        backgroundInterval = setInterval(() => {
          void runBackgroundTick();
        }, tickMs);
      }
    },
  };
}

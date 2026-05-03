import {
  PazaakCoordinator,
  type MatchPersistence,
  type PazaakGameMode,
  type PazaakMatch,
  type SerializedMatch,
  serializeMatch,
  deserializeMatch,
} from "@openkotor/pazaak-engine";
import { PAZAAK_POLICY_DEFAULTS, toPublicConfig } from "@openkotor/pazaak-policy";
import {
  PAZAAK_DEFAULT_MMR,
  PAZAAK_DEFAULT_RD,
  updateRatingAfterGame,
  type RatingSnapshot,
} from "@openkotor/pazaak-rating";
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

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const MATCH_HANDLER = "pazaak_authoritative";
const LEADERBOARD_ID = "pazaak_ranked_mmr";
const TOURNAMENT_COLLECTION = "pazaak_tournaments";
const TOURNAMENT_IDS_KEY = "tournament_ids";

const enum Opcode {
  Snapshot = 1,
  Command = 2,
  Chat = 3,
  Error = 4,
}

type JsonObject = Record<string, unknown>;

interface RuntimeWallet extends RatingSnapshot {
  userId: string;
  displayName: string;
  preferredRuntimeDeckId: number | null;
  ownedSideDeckTokens: string[];
  balance: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  gamesWon: number;
  lastMatchAt: string | null;
  streak: number;
  bestStreak: number;
  lastDailyAt: string | null;
  progressClaims: string[];
  unopenedCratesStandard: number;
  unopenedCratesPremium: number;
  updatedAt: string;
}

interface RuntimeSettings {
  tableTheme: string;
  cardBackStyle: string;
  tableAmbience: string;
  soundEnabled: boolean;
  soundTheme: string;
  reducedMotionEnabled: boolean;
  turnTimerSeconds: number;
  preferredAiDifficulty: "easy" | "hard" | "professional";
  confirmForfeit: boolean;
  highlightValidPlays: boolean;
  focusMode: boolean;
  showRatingsInGame: boolean;
  showGuildEmblems: boolean;
  showHolocronStreaks: boolean;
  showPostMatchDebrief: boolean;
  chatAudience: "everyone" | "guild" | "silent";
}

interface RuntimeSideboards {
  userId: string;
  displayName: string;
  activeName: string | null;
  sideboards: Array<{ name: string; tokens: string[]; updatedAt: string; isActive: boolean }>;
  ownedSideDeckTokens: string[];
  updatedAt: string;
}

interface RuntimeQueueRecord {
  userId: string;
  displayName: string;
  mmr: number;
  preferredMaxPlayers: number;
  preferredRegions?: string[];
  enqueuedAt: string;
}

interface RuntimeLobby {
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
    gameMode?: PazaakGameMode;
  };
  players: Array<{
    userId: string;
    displayName: string;
    ready: boolean;
    isHost: boolean;
    isAi: boolean;
    aiDifficulty?: "easy" | "hard" | "professional";
    joinedAt: string;
  }>;
  passwordHash: string | null;
  status: "waiting" | "matchmaking" | "in_game" | "closed";
  matchId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeMatchIndex {
  matchId: string;
  nakamaMatchId: string;
  playerIds: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeHistoryRecord {
  matchId: string;
  opponentName: string;
  result: "win" | "loss";
  mmrDelta: number;
  playedAt: string;
}

interface MatchState {
  matchId: string;
  coordinator: PazaakCoordinator;
  snapshot: SerializedMatch;
  presences: Record<string, nkruntime.Presence>;
  idempotency: Record<string, SerializedMatch>;
  settled: boolean;
}

function ensureCrypto(): void {
  const g = globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return;
  Object.defineProperty(g, "crypto", {
    configurable: true,
    value: {
      randomUUID: () => {
        const part = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${part()}${part()}-${part()}-${part()}-${part()}-${part()}${part()}${part()}`;
      },
    },
  });
}

ensureCrypto();

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  return ((globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto).randomUUID();
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function parsePayload(payload: string): JsonObject {
  if (!payload) return {};
  try {
    return asObject(JSON.parse(payload));
  } catch {
    throw new Error("Payload must be valid JSON.");
  }
}

function json(data: unknown): string {
  return JSON.stringify(data);
}

function textData(data: string | Uint8Array): string {
  return typeof data === "string" ? data : String.fromCharCode(...data);
}

function requireUser(ctx: nkruntime.Context): string {
  if (!ctx.userId) throw new Error("Nakama session required.");
  return ctx.userId;
}

function displayNameFor(nk: nkruntime.Nakama, ctx: nkruntime.Context, userId: string): string {
  try {
    const account = nk.accountGetId(ctx, userId);
    return account.user.displayName || account.user.username || `Player ${userId.slice(0, 6)}`;
  } catch {
    return `Player ${userId.slice(0, 6)}`;
  }
}

function readStorage<T extends JsonObject>(
  nk: nkruntime.Nakama,
  ctx: nkruntime.Context,
  collection: string,
  key: string,
  userId: string,
): T | null {
  const [obj] = nk.storageRead(ctx, [{ collection, key, userId }]);
  return obj ? obj.value as T : null;
}

function writeStorage(
  nk: nkruntime.Nakama,
  ctx: nkruntime.Context,
  collection: string,
  key: string,
  userId: string,
  value: JsonObject,
): void {
  nk.storageWrite(ctx, [{ collection, key, userId, value, permissionRead: 1, permissionWrite: 0 }]);
}

function deleteStorage(
  nk: nkruntime.Nakama,
  ctx: nkruntime.Context,
  collection: string,
  key: string,
  userId: string,
): void {
  nk.storageDelete(ctx, [{ collection, key, userId }]);
}

function defaultSettings(): RuntimeSettings {
  return {
    tableTheme: "ebon-hawk",
    cardBackStyle: "classic",
    tableAmbience: "cantina",
    soundEnabled: true,
    soundTheme: "default",
    reducedMotionEnabled: false,
    turnTimerSeconds: PAZAAK_POLICY_DEFAULTS.timers.turnTimerSeconds,
    preferredAiDifficulty: "hard",
    confirmForfeit: true,
    highlightValidPlays: true,
    focusMode: false,
    showRatingsInGame: true,
    showGuildEmblems: true,
    showHolocronStreaks: true,
    showPostMatchDebrief: true,
    chatAudience: "everyone",
  };
}

function getSettings(nk: nkruntime.Nakama, ctx: nkruntime.Context, userId: string): RuntimeSettings {
  return {
    ...defaultSettings(),
    ...(readStorage<RuntimeSettings & JsonObject>(nk, ctx, "pazaak_settings", "settings", userId) ?? {}),
  };
}

function saveSettings(nk: nkruntime.Nakama, ctx: nkruntime.Context, userId: string, settings: RuntimeSettings): RuntimeSettings {
  writeStorage(nk, ctx, "pazaak_settings", "settings", userId, settings as unknown as JsonObject);
  return settings;
}

function getWallet(nk: nkruntime.Nakama, ctx: nkruntime.Context, userId: string): RuntimeWallet {
  const displayName = displayNameFor(nk, ctx, userId);
  const current = readStorage<RuntimeWallet & JsonObject>(nk, ctx, "pazaak_wallets", "wallet", userId);
  if (current) {
    return {
      ...current,
      userId,
      displayName: String(current.displayName ?? displayName),
      mmr: Number(current.mmr ?? PAZAAK_DEFAULT_MMR),
      rd: Number(current.rd ?? current.mmrRd ?? PAZAAK_DEFAULT_RD),
      updatedAt: String(current.updatedAt ?? nowIso()),
    };
  }
  const wallet: RuntimeWallet = {
    userId,
    displayName,
    preferredRuntimeDeckId: null,
    ownedSideDeckTokens: [],
    balance: 100,
    wins: 0,
    losses: 0,
    mmr: PAZAAK_DEFAULT_MMR,
    rd: PAZAAK_DEFAULT_RD,
    gamesPlayed: 0,
    gamesWon: 0,
    lastMatchAt: null,
    streak: 0,
    bestStreak: 0,
    lastDailyAt: null,
    progressClaims: [],
    unopenedCratesStandard: 0,
    unopenedCratesPremium: 0,
    updatedAt: nowIso(),
  };
  writeStorage(nk, ctx, "pazaak_wallets", "wallet", userId, wallet as unknown as JsonObject);
  return wallet;
}

function saveWallet(nk: nkruntime.Nakama, ctx: nkruntime.Context, wallet: RuntimeWallet): RuntimeWallet {
  const next = { ...wallet, updatedAt: nowIso() };
  writeStorage(nk, ctx, "pazaak_wallets", "wallet", wallet.userId, next as unknown as JsonObject);
  return next;
}

function getSideboards(nk: nkruntime.Nakama, ctx: nkruntime.Context, userId: string): RuntimeSideboards {
  const displayName = displayNameFor(nk, ctx, userId);
  const current = readStorage<RuntimeSideboards & JsonObject>(nk, ctx, "pazaak_sideboards", "sideboards", userId);
  if (current) {
    return {
      userId,
      displayName,
      activeName: typeof current.activeName === "string" ? current.activeName : null,
      sideboards: Array.isArray(current.sideboards) ? current.sideboards as RuntimeSideboards["sideboards"] : [],
      ownedSideDeckTokens: Array.isArray(current.ownedSideDeckTokens) ? current.ownedSideDeckTokens as string[] : [],
      updatedAt: String(current.updatedAt ?? nowIso()),
    };
  }
  const sideboards: RuntimeSideboards = {
    userId,
    displayName,
    activeName: null,
    sideboards: [],
    ownedSideDeckTokens: [],
    updatedAt: nowIso(),
  };
  writeStorage(nk, ctx, "pazaak_sideboards", "sideboards", userId, sideboards as unknown as JsonObject);
  return sideboards;
}

function saveSideboards(nk: nkruntime.Nakama, ctx: nkruntime.Context, sideboards: RuntimeSideboards): RuntimeSideboards {
  const next = { ...sideboards, updatedAt: nowIso() };
  writeStorage(nk, ctx, "pazaak_sideboards", "sideboards", sideboards.userId, next as unknown as JsonObject);
  return next;
}

function getGlobalList<T>(nk: nkruntime.Nakama, ctx: nkruntime.Context, key: string): T[] {
  const current = readStorage<{ items?: unknown[] }>(nk, ctx, "pazaak_global", key, SYSTEM_USER_ID);
  return Array.isArray(current?.items) ? current.items as T[] : [];
}

function saveGlobalList<T>(nk: nkruntime.Nakama, ctx: nkruntime.Context, key: string, items: T[]): void {
  writeStorage(nk, ctx, "pazaak_global", key, SYSTEM_USER_ID, { items });
}

function readTournamentIdList(nk: nkruntime.Nakama, ctx: nkruntime.Context): string[] {
  const cur = readStorage<{ ids?: unknown[] }>(nk, ctx, "pazaak_global", TOURNAMENT_IDS_KEY, SYSTEM_USER_ID);
  return Array.isArray(cur?.ids) ? cur.ids.filter((x): x is string => typeof x === "string") : [];
}

function writeTournamentIdList(nk: nkruntime.Nakama, ctx: nkruntime.Context, ids: string[]): void {
  writeStorage(nk, ctx, "pazaak_global", TOURNAMENT_IDS_KEY, SYSTEM_USER_ID, { ids });
}

function appendTournamentId(nk: nkruntime.Nakama, ctx: nkruntime.Context, id: string): void {
  const ids = readTournamentIdList(nk, ctx);
  if (!ids.includes(id)) {
    ids.unshift(id);
    writeTournamentIdList(nk, ctx, ids);
  }
}

function loadTournament(nk: nkruntime.Nakama, ctx: nkruntime.Context, id: string): TournamentState | null {
  const v = readStorage<JsonObject>(nk, ctx, TOURNAMENT_COLLECTION, id, SYSTEM_USER_ID);
  if (!v || typeof v.id !== "string") return null;
  return v as unknown as TournamentState;
}

function saveTournamentState(nk: nkruntime.Nakama, ctx: nkruntime.Context, state: TournamentState): void {
  writeStorage(nk, ctx, TOURNAMENT_COLLECTION, state.id, SYSTEM_USER_ID, state as unknown as JsonObject);
}

function summarizeTournamentState(state: TournamentState): JsonObject {
  return {
    id: state.id,
    name: state.name,
    guildId: state.guildId,
    channelId: state.channelId,
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
    })),
    championUserId: state.championUserId,
    setsPerMatch: state.setsPerMatch,
    rounds: state.rounds,
    maxParticipants: state.maxParticipants,
    organizerId: state.organizerId,
    organizerName: state.organizerName,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function getMatchIndex(nk: nkruntime.Nakama, ctx: nkruntime.Context, matchId: string): RuntimeMatchIndex | null {
  return readStorage<RuntimeMatchIndex & JsonObject>(nk, ctx, "pazaak_matches", `index:${matchId}`, SYSTEM_USER_ID);
}

function saveMatchIndex(nk: nkruntime.Nakama, ctx: nkruntime.Context, index: RuntimeMatchIndex): void {
  writeStorage(nk, ctx, "pazaak_matches", `index:${index.matchId}`, SYSTEM_USER_ID, index as unknown as JsonObject);
  for (const playerId of index.playerIds) {
    writeStorage(nk, ctx, "pazaak_matches", `active:${playerId}`, SYSTEM_USER_ID, {
      matchId: index.matchId,
      nakamaMatchId: index.nakamaMatchId,
    });
  }
}

function getSnapshot(nk: nkruntime.Nakama, ctx: nkruntime.Context, matchId: string): SerializedMatch | null {
  return readStorage<SerializedMatch & JsonObject>(nk, ctx, "pazaak_matches", `snapshot:${matchId}`, SYSTEM_USER_ID);
}

function saveSnapshot(nk: nkruntime.Nakama, ctx: nkruntime.Context, snapshot: SerializedMatch): void {
  writeStorage(nk, ctx, "pazaak_matches", `snapshot:${snapshot.id}`, SYSTEM_USER_ID, snapshot as unknown as JsonObject);
}

class RuntimePersistence implements MatchPersistence {
  public constructor(
    private readonly nk: nkruntime.Nakama,
    private readonly ctx: nkruntime.Context,
    private readonly matchId: string,
  ) {}

  public async save(match: PazaakMatch): Promise<void> {
    saveSnapshot(this.nk, this.ctx, serializeMatch(match));
  }

  public async loadActive(): Promise<PazaakMatch[]> {
    const snap = getSnapshot(this.nk, this.ctx, this.matchId);
    return snap && snap.phase !== "completed" ? [deserializeMatch(snap)] : [];
  }
}

function createCoordinator(nk: nkruntime.Nakama, ctx: nkruntime.Context, matchId: string): PazaakCoordinator {
  return new PazaakCoordinator(new RuntimePersistence(nk, ctx, matchId), {
    turnTimeoutMs: PAZAAK_POLICY_DEFAULTS.timers.turnTimeoutMs,
    disconnectForfeitMs: PAZAAK_POLICY_DEFAULTS.timers.disconnectForfeitMs,
  });
}

function createInitialMatch(
  nk: nkruntime.Nakama,
  ctx: nkruntime.Context,
  params: Record<string, string>,
): { coordinator: PazaakCoordinator; snapshot: SerializedMatch } {
  const matchId = params.matchId || randomId();
  const coordinator = createCoordinator(nk, ctx, matchId);
  const existing = getSnapshot(nk, ctx, matchId);
  if (existing) return { coordinator, snapshot: existing };

  const p1 = params.playerOneId || "player-one";
  const p2 = params.playerTwoId || "player-two";
  const match = coordinator.createDirectMatch({
    channelId: `nakama:${matchId}`,
    challengerId: p1,
    challengerName: params.playerOneName || "Player 1",
    opponentId: p2,
    opponentName: params.playerTwoName || "Player 2",
    wager: Number(params.wager ?? 0),
    setsToWin: Number(params.setsToWin ?? 3),
    gameMode: params.gameMode === "wacky" ? "wacky" : "canonical",
    matchId,
  });
  const snapshot = serializeMatch(match);
  saveSnapshot(nk, ctx, snapshot);
  return { coordinator, snapshot };
}

function createHostedMatch(
  nk: nkruntime.Nakama,
  ctx: nkruntime.Context,
  input: {
    playerOneId: string;
    playerOneName: string;
    playerTwoId: string;
    playerTwoName: string;
    gameMode?: PazaakGameMode;
    setsToWin?: number;
    wager?: number;
  },
): { match: SerializedMatch; nakamaMatchId: string } {
  const logicalMatchId = randomId();
  const params: Record<string, string> = {
    matchId: logicalMatchId,
    playerOneId: input.playerOneId,
    playerOneName: input.playerOneName,
    playerTwoId: input.playerTwoId,
    playerTwoName: input.playerTwoName,
    gameMode: input.gameMode ?? "canonical",
    setsToWin: String(input.setsToWin ?? 3),
    wager: String(input.wager ?? 0),
  };
  const nakamaMatchId = nk.matchCreate(ctx, MATCH_HANDLER, params);
  const { snapshot } = createInitialMatch(nk, ctx, params);
  saveMatchIndex(nk, ctx, {
    matchId: logicalMatchId,
    nakamaMatchId,
    playerIds: [input.playerOneId, input.playerTwoId],
    completed: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { match: snapshot, nakamaMatchId };
}

function matchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[],
): string {
  if (matches.length < 2) {
    logger.warn("matchmakerMatched: expected at least 2 players, got %d", matches.length);
    throw new Error("Invalid matchmaker group size.");
  }
  const sorted = [...matches].sort((a, b) => String(a.presence.userId).localeCompare(String(b.presence.userId)));
  const first = sorted[0]!;
  const second = sorted[1]!;
  const p1Id = String(first.presence.userId);
  const p2Id = String(second.presence.userId);
  const logicalMatchId = randomId();
  const params: Record<string, string> = {
    matchId: logicalMatchId,
    playerOneId: p1Id,
    playerOneName: displayNameFor(nk, ctx, p1Id),
    playerTwoId: p2Id,
    playerTwoName: displayNameFor(nk, ctx, p2Id),
    gameMode: "canonical",
    setsToWin: "3",
    wager: "0",
  };
  const nakamaMatchId = nk.matchCreate(ctx, MATCH_HANDLER, params);
  saveMatchIndex(nk, ctx, {
    matchId: logicalMatchId,
    nakamaMatchId,
    playerIds: [p1Id, p2Id],
    completed: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  logger.info("matchmakerMatched created match %s nakama=%s", logicalMatchId, nakamaMatchId);
  return nakamaMatchId;
}

function settleIfNeeded(
  nk: nkruntime.Nakama,
  ctx: nkruntime.Context,
  state: MatchState,
): void {
  if (state.settled || state.snapshot.phase !== "completed" || !state.snapshot.winnerId || !state.snapshot.loserId) return;

  const winner = getWallet(nk, ctx, state.snapshot.winnerId);
  const loser = getWallet(nk, ctx, state.snapshot.loserId);
  const winnerRating = updateRatingAfterGame(winner, loser, 1);
  const loserRating = updateRatingAfterGame(loser, winner, 0);
  const at = nowIso();

  const nextWinner = saveWallet(nk, ctx, {
    ...winner,
    mmr: winnerRating.mmr,
    rd: winnerRating.rd,
    wins: winner.wins + 1,
    gamesWon: winner.gamesWon + 1,
    gamesPlayed: winner.gamesPlayed + 1,
    streak: winner.streak + 1,
    bestStreak: Math.max(winner.bestStreak, winner.streak + 1),
    lastMatchAt: at,
  });
  const nextLoser = saveWallet(nk, ctx, {
    ...loser,
    mmr: loserRating.mmr,
    rd: loserRating.rd,
    losses: loser.losses + 1,
    gamesPlayed: loser.gamesPlayed + 1,
    streak: 0,
    lastMatchAt: at,
  });

  nk.leaderboardRecordWrite(ctx, LEADERBOARD_ID, nextWinner.userId, nextWinner.displayName, nextWinner.mmr, Math.round(nextWinner.rd), { gamesPlayed: nextWinner.gamesPlayed }, "set");
  nk.leaderboardRecordWrite(ctx, LEADERBOARD_ID, nextLoser.userId, nextLoser.displayName, nextLoser.mmr, Math.round(nextLoser.rd), { gamesPlayed: nextLoser.gamesPlayed }, "set");

  appendHistory(nk, ctx, state.snapshot.winnerId, {
    matchId: state.matchId,
    opponentName: state.snapshot.loserName ?? "Opponent",
    result: "win",
    mmrDelta: winnerRating.deltaMmr,
    playedAt: at,
  });
  appendHistory(nk, ctx, state.snapshot.loserId, {
    matchId: state.matchId,
    opponentName: state.snapshot.winnerName ?? "Opponent",
    result: "loss",
    mmrDelta: loserRating.deltaMmr,
    playedAt: at,
  });

  const index = getMatchIndex(nk, ctx, state.matchId);
  if (index) saveMatchIndex(nk, ctx, { ...index, completed: true, updatedAt: at });
  state.settled = true;
}

function appendHistory(nk: nkruntime.Nakama, ctx: nkruntime.Context, userId: string, entry: RuntimeHistoryRecord): void {
  const current = readStorage<{ history?: RuntimeHistoryRecord[] }>(nk, ctx, "pazaak_history", "history", userId);
  const history = Array.isArray(current?.history) ? current.history : [];
  writeStorage(nk, ctx, "pazaak_history", "history", userId, { history: [entry, ...history].slice(0, 50) });
}

function broadcastSnapshot(dispatcher: nkruntime.MatchDispatcher, snapshot: SerializedMatch, presences?: nkruntime.Presence[]): void {
  dispatcher.broadcastMessage(Opcode.Snapshot, json({ type: "match_update", data: snapshot }), presences ?? null);
}

const matchHandler: nkruntime.MatchHandler<MatchState> = {
  matchInit(ctx, logger, nk, params) {
    const { coordinator, snapshot } = createInitialMatch(nk, ctx, params);
    logger.info("Pazaak match %s initialized", snapshot.id);
    return {
      state: {
        matchId: snapshot.id,
        coordinator,
        snapshot,
        presences: {},
        idempotency: {},
        settled: snapshot.settled,
      },
      tickRate: 1,
      label: json({ game: "pazaak", matchId: snapshot.id }),
    };
  },
  matchJoinAttempt(_ctx, _logger, _nk, _dispatcher, _tick, state, presence) {
    const allowed = state.snapshot.players.some((player) => player.userId === presence.userId);
    return allowed
      ? { state, accept: true }
      : { state, accept: false, rejectMessage: "Only match participants can join this match." };
  },
  matchJoin(_ctx, _logger, _nk, dispatcher, _tick, state, presences) {
    for (const presence of presences) state.presences[presence.userId] = presence;
    broadcastSnapshot(dispatcher, state.snapshot, presences);
    return { state };
  },
  matchLeave(_ctx, _logger, _nk, _dispatcher, _tick, state, presences) {
    for (const presence of presences) {
      delete state.presences[presence.userId];
      const updated = state.coordinator.markDisconnected(presence.userId);
      if (updated) state.snapshot = serializeMatch(updated);
    }
    return { state };
  },
  matchLoop(ctx, logger, nk, dispatcher, _tick, state, messages) {
    let changed = false;
    const timerUpdates = [
      ...state.coordinator.tickTurnTimers(),
      ...state.coordinator.tickDisconnectForfeits(),
    ];
    if (timerUpdates.length > 0) {
      state.snapshot = serializeMatch(timerUpdates.at(-1)!);
      changed = true;
    }

    for (const message of messages) {
      if (message.opCode === Opcode.Chat) {
        dispatcher.broadcastMessage(Opcode.Chat, textData(message.data), null, message.sender);
        continue;
      }

      if (message.opCode !== Opcode.Command) continue;
      try {
        const payload = parsePayload(textData(message.data));
        const clientMoveId = typeof payload.clientMoveId === "string" ? payload.clientMoveId : "";
        if (clientMoveId && state.idempotency[clientMoveId]) {
          broadcastSnapshot(dispatcher, state.idempotency[clientMoveId], [message.sender]);
          continue;
        }

        const kind = String(payload.type ?? "");
        let updated: PazaakMatch;
        switch (kind) {
          case "draw":
            updated = state.coordinator.draw(state.matchId, message.sender.userId);
            break;
          case "stand":
            updated = state.coordinator.stand(state.matchId, message.sender.userId);
            break;
          case "end_turn":
            updated = state.coordinator.endTurn(state.matchId, message.sender.userId);
            break;
          case "forfeit":
            updated = state.coordinator.forfeit(state.matchId, message.sender.userId);
            break;
          case "play_side":
            updated = state.coordinator.playSideCard(
              state.matchId,
              message.sender.userId,
              String(payload.cardId ?? ""),
              Number(payload.appliedValue ?? 0),
            );
            break;
          default:
            throw new Error(`Unknown Pazaak command: ${kind}`);
        }

        state.snapshot = serializeMatch(updated);
        if (clientMoveId) state.idempotency[clientMoveId] = state.snapshot;
        changed = true;
      } catch (err) {
        logger.warn("Rejected Pazaak command from %s: %s", message.sender.userId, err instanceof Error ? err.message : String(err));
        dispatcher.broadcastMessage(Opcode.Error, json({ error: err instanceof Error ? err.message : String(err) }), [message.sender]);
      }
    }

    if (changed) {
      saveSnapshot(nk, ctx, state.snapshot);
      settleIfNeeded(nk, ctx, state);
      broadcastSnapshot(dispatcher, state.snapshot);
    }

    return { state };
  },
  matchTerminate(ctx, _logger, nk, _dispatcher, _tick, state) {
    saveSnapshot(nk, ctx, state.snapshot);
    settleIfNeeded(nk, ctx, state);
    return { state };
  },
  matchSignal(_ctx, _logger, _nk, dispatcher, _tick, state, data) {
    try {
      const relay = parsePayload(data).chatRelay as Record<string, unknown> | undefined;
      if (relay && typeof relay === "object") {
        dispatcher.broadcastMessage(Opcode.Chat, json(relay), null);
      }
    } catch {
      // Ignore malformed signals.
    }
    return { state, data };
  },
};

function rpcConfigPublic(_ctx: nkruntime.Context, _logger: nkruntime.Logger, _nk: nkruntime.Nakama, _payload: string): string {
  return json(toPublicConfig(PAZAAK_POLICY_DEFAULTS));
}

function rpcMe(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  const userId = requireUser(ctx);
  const wallet = getWallet(nk, ctx, userId);
  const active = readStorage<{ matchId?: string; nakamaMatchId?: string }>(nk, ctx, "pazaak_matches", `active:${userId}`, SYSTEM_USER_ID);
  const snapshot = active?.matchId ? getSnapshot(nk, ctx, String(active.matchId)) : null;
  return json({
    user: { id: userId, username: ctx.username ?? userId, displayName: wallet.displayName },
    wallet: { ...wallet, mmrRd: wallet.rd, userSettings: getSettings(nk, ctx, userId) },
    queue: getGlobalList<RuntimeQueueRecord & JsonObject>(nk, ctx, "queue").find((q) => q.userId === userId) ?? null,
    match: snapshot && snapshot.phase !== "completed" ? { ...snapshot, nakamaMatchId: active?.nakamaMatchId } : null,
  });
}

function rpcSettingsGet(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  const userId = requireUser(ctx);
  return json({ settings: getSettings(nk, ctx, userId), wallet: getWallet(nk, ctx, userId) });
}

function rpcSettingsUpdate(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const next = { ...getSettings(nk, ctx, userId), ...parsePayload(payload) };
  return json({ settings: saveSettings(nk, ctx, userId, next), wallet: getWallet(nk, ctx, userId) });
}

function rpcSideboardsGet(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama): string {
  return json({ sideboards: getSideboards(nk, ctx, requireUser(ctx)) });
}

function rpcSideboardSave(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const name = String(body.name ?? "Default").trim().slice(0, 48);
  const tokens = Array.isArray(body.tokens) ? body.tokens.map(String).slice(0, 10) : [];
  const makeActive = body.makeActive !== false;
  const current = getSideboards(nk, ctx, userId);
  const updatedAt = nowIso();
  const sideboards = current.sideboards.filter((item) => item.name !== name);
  sideboards.push({ name, tokens, updatedAt, isActive: makeActive });
  const activeName = makeActive ? name : current.activeName;
  const next = saveSideboards(nk, ctx, {
    ...current,
    activeName,
    sideboards: sideboards.map((item) => ({ ...item, isActive: item.name === activeName })),
  });
  return json({ sideboards: next });
}

function rpcSideboardActive(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const name = String(parsePayload(payload).name ?? "").trim();
  const current = getSideboards(nk, ctx, userId);
  const next = saveSideboards(nk, ctx, {
    ...current,
    activeName: name,
    sideboards: current.sideboards.map((item) => ({ ...item, isActive: item.name === name })),
  });
  return json({ sideboards: next });
}

function rpcSideboardDelete(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const name = String(parsePayload(payload).name ?? "").trim();
  const current = getSideboards(nk, ctx, userId);
  const sideboards = current.sideboards.filter((item) => item.name !== name);
  const activeName = current.activeName === name ? null : current.activeName;
  return json({ sideboards: saveSideboards(nk, ctx, { ...current, activeName, sideboards }) });
}

function rpcLeaderboard(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama): string {
  const records = nk.leaderboardRecordsList(ctx, LEADERBOARD_ID, null, 50).records ?? [];
  return json({
    leaders: records.map((record) => ({
      userId: record.ownerId,
      displayName: record.username ?? record.ownerId,
      mmr: record.score,
      mmrRd: record.subscore ?? PAZAAK_DEFAULT_RD,
      wins: Number(record.metadata?.wins ?? 0),
      losses: Number(record.metadata?.losses ?? 0),
      rank: record.rank ?? 0,
    })),
  });
}

function rpcHistory(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const limit = Number(parsePayload(payload).limit ?? 25);
  const current = readStorage<{ history?: RuntimeHistoryRecord[] }>(nk, ctx, "pazaak_history", "history", userId);
  return json({ history: (current?.history ?? []).slice(0, Math.max(1, Math.min(100, limit))) });
}

function rpcQueueEnqueue(ctx: nkruntime.Context, _logger: nkruntime.Logger, _nk: nkruntime.Nakama, payload: string): string {
  requireUser(ctx);
  void parsePayload(payload);
  return json({
    queue: null,
    match: null,
    nakamaMatchmaker: true,
    message: "Ranked queue uses the Nakama realtime matchmaker (socket.addMatchmaker); this RPC is unused.",
  });
}

function rpcQueueLeave(ctx: nkruntime.Context, _logger: nkruntime.Logger, _nk: nkruntime.Nakama): string {
  requireUser(ctx);
  return json({ removed: false, nakamaMatchmaker: true });
}

function rpcQueueStatus(ctx: nkruntime.Context, _logger: nkruntime.Logger, _nk: nkruntime.Nakama): string {
  requireUser(ctx);
  return json({ queue: null });
}

function rpcQueueStats(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama): string {
  const lobbies = getGlobalList<RuntimeLobby>(nk, ctx, "lobbies").filter((lobby) => lobby.status !== "closed");
  return json({
    playersInQueue: 0,
    openLobbies: lobbies.length,
    activeGames: 0,
    averageWaitSeconds: 0,
    averageWaitTime: "0s",
    queueUpdatedAt: nowIso(),
  });
}

function createLobbyRecord(ctx: nkruntime.Context, nk: nkruntime.Nakama, body: JsonObject): RuntimeLobby {
  const userId = requireUser(ctx);
  const wallet = getWallet(nk, ctx, userId);
  const id = randomId();
  const maxPlayers = Math.max(2, Math.min(8, Number(body.maxPlayers ?? 2)));
  const at = nowIso();
  return {
    id,
    lobbyCode: id.slice(0, 6).toUpperCase(),
    name: String(body.name ?? `${wallet.displayName}'s table`).slice(0, 80),
    hostUserId: userId,
    maxPlayers,
    tableSettings: {
      variant: body.variant === "multi_seat" ? "multi_seat" : "canonical",
      maxPlayers,
      maxRounds: Number(body.maxRounds ?? 3),
      turnTimerSeconds: Number(body.turnTimerSeconds ?? PAZAAK_POLICY_DEFAULTS.timers.turnTimerSeconds),
      ranked: body.ranked !== false,
      allowAiFill: body.allowAiFill !== false,
      sideboardMode: body.sideboardMode === "player_active_custom" || body.sideboardMode === "host_mirror_custom" ? body.sideboardMode : "runtime_random",
      gameMode: body.gameMode === "wacky" ? "wacky" : "canonical",
    },
    players: [{ userId, displayName: wallet.displayName, ready: true, isHost: true, isAi: false, joinedAt: at }],
    passwordHash: null,
    status: "waiting",
    matchId: null,
    createdAt: at,
    updatedAt: at,
  };
}

function rpcLobbiesList(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama): string {
  return json({ lobbies: getGlobalList<RuntimeLobby>(nk, ctx, "lobbies").filter((lobby) => lobby.status !== "closed") });
}

function rpcLobbyCreate(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const lobbies = getGlobalList<RuntimeLobby>(nk, ctx, "lobbies");
  const lobby = createLobbyRecord(ctx, nk, parsePayload(payload));
  saveGlobalList(nk, ctx, "lobbies", [lobby, ...lobbies]);
  return json({ lobby });
}

function mutateLobby(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  lobbyId: string,
  fn: (lobby: RuntimeLobby) => RuntimeLobby,
): RuntimeLobby | null {
  const lobbies = getGlobalList<RuntimeLobby>(nk, ctx, "lobbies");
  const idx = lobbies.findIndex((lobby) => lobby.id === lobbyId || lobby.lobbyCode.toLowerCase() === lobbyId.toLowerCase());
  if (idx === -1) return null;
  const next = fn(lobbies[idx]!);
  lobbies[idx] = { ...next, updatedAt: nowIso() };
  saveGlobalList(nk, ctx, "lobbies", lobbies);
  return lobbies[idx]!;
}

function rpcLobbyJoin(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const wallet = getWallet(nk, ctx, userId);
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? body.lobbyCode ?? ""), (current) => {
    if (current.players.some((player) => player.userId === userId)) return current;
    if (current.players.length >= current.maxPlayers) throw new Error("Lobby is full.");
    return {
      ...current,
      players: [...current.players, { userId, displayName: wallet.displayName, ready: false, isHost: false, isAi: false, joinedAt: nowIso() }],
    };
  });
  return json({ lobby });
}

function rpcLobbyReady(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
    ...current,
    players: current.players.map((player) => player.userId === userId ? { ...player, ready: body.ready !== false } : player),
  }));
  return json({ lobby });
}

function rpcLobbyStatus(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const body = parsePayload(payload);
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
    ...current,
    status: body.status === "matchmaking" ? "matchmaking" : "waiting",
  }));
  return json({ lobby });
}

function rpcLobbyLeave(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
    ...current,
    players: current.players.filter((player) => player.userId !== userId),
    status: current.hostUserId === userId ? "closed" : current.status,
  }));
  return json({ lobby: lobby?.status === "closed" ? null : lobby });
}

function rpcLobbyStart(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  let hosted: { match: SerializedMatch; nakamaMatchId: string } | null = null;
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => {
    if (current.hostUserId !== userId) throw new Error("Only the host can start this lobby.");
    const humans = current.players.filter((player) => !player.isAi);
    if (humans.length < 2) throw new Error("At least two human players are required.");
    const input: {
      playerOneId: string;
      playerOneName: string;
      playerTwoId: string;
      playerTwoName: string;
      gameMode?: PazaakGameMode;
      setsToWin: number;
    } = {
      playerOneId: humans[0]!.userId,
      playerOneName: humans[0]!.displayName,
      playerTwoId: humans[1]!.userId,
      playerTwoName: humans[1]!.displayName,
      setsToWin: current.tableSettings.maxRounds,
      ...(current.tableSettings.gameMode ? { gameMode: current.tableSettings.gameMode } : {}),
    };
    const created = createHostedMatch(nk, ctx, input);
    hosted = created;
    return { ...current, status: "in_game", matchId: created.match.id };
  });
  const hostedResult = hosted as { match: SerializedMatch; nakamaMatchId: string } | null;
  return json({ lobby, match: hostedResult ? { ...hostedResult.match, nakamaMatchId: hostedResult.nakamaMatchId } : null });
}

function rpcLobbyAddAi(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const body = parsePayload(payload);
  const difficultyRaw = String(body.difficulty ?? "hard");
  const aiDifficulty = difficultyRaw === "easy" || difficultyRaw === "professional" ? difficultyRaw : "hard";
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => {
    if (current.players.length >= current.maxPlayers) throw new Error("Lobby is full.");
    const id = `ai:${randomId()}`;
    return {
      ...current,
      players: [...current.players, {
        userId: id,
        displayName: "Pazaak Droid",
        ready: true,
        isHost: false,
        isAi: true,
        aiDifficulty,
        joinedAt: nowIso(),
      }],
    };
  });
  return json({ lobby });
}

function rpcLobbyAiDifficulty(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const body = parsePayload(payload);
  const aiUserId = String(body.aiUserId ?? "");
  const difficultyRaw = String(body.difficulty ?? "hard");
  const aiDifficulty = difficultyRaw === "easy" || difficultyRaw === "professional" ? difficultyRaw : "hard";
  const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
    ...current,
    players: current.players.map((player) => player.userId === aiUserId && player.isAi
      ? { ...player, aiDifficulty }
      : player),
  }));
  return json({ lobby });
}

function rpcMatchResolve(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const matchId = String(parsePayload(payload).matchId ?? "");
  return json({ index: matchId ? getMatchIndex(nk, ctx, matchId) : null });
}

function rpcMatchGet(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const body = parsePayload(payload);
  const matchId = typeof body.matchId === "string"
    ? body.matchId
    : String(readStorage<{ matchId?: string }>(nk, ctx, "pazaak_matches", `active:${requireUser(ctx)}`, SYSTEM_USER_ID)?.matchId ?? "");
  const snapshot = matchId ? getSnapshot(nk, ctx, matchId) : null;
  const index = matchId ? getMatchIndex(nk, ctx, matchId) : null;
  return json({ match: snapshot ? { ...snapshot, nakamaMatchId: index?.nakamaMatchId } : null });
}

function rpcTournamentsList(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  const ids = readTournamentIdList(nk, ctx);
  const tournaments: JsonObject[] = [];
  for (const id of ids) {
    const t = loadTournament(nk, ctx, id);
    if (t) tournaments.push(summarizeTournamentState(t));
  }
  tournaments.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  return json({ tournaments });
}

function rpcTournamentDetail(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const id = String(parsePayload(payload).tournamentId ?? "");
  const tournament = id ? loadTournament(nk, ctx, id) : null;
  if (!tournament) {
    return json({ tournament: null, bracket: { columns: [] }, standings: null });
  }
  return json({
    tournament: tournament as unknown as JsonObject,
    bracket: buildBracketView(tournament),
    standings: tournament.format === "swiss" ? computeSwissStandings(tournament) : null,
  });
}

function rpcTournamentCreate(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const formatRaw = String(body.format ?? "single_elim");
  const format: TournamentFormat =
    formatRaw === "double_elim" || formatRaw === "swiss" ? formatRaw : "single_elim";
  const modeRaw = String(body.gameMode ?? body.mode ?? "canonical");
  const gameMode = modeRaw === "wacky" ? "wacky" : "canonical";
  const organizerName = displayNameFor(nk, ctx, userId);
  const tournament = createTournament({
    name: String(body.name ?? "Unnamed Tournament").slice(0, 64),
    organizerId: userId,
    organizerName,
    format,
    gameMode,
    setsPerMatch: Math.max(1, Math.min(9, Number(body.setsPerMatch ?? 3) || 3)),
    rounds: Math.max(2, Math.min(12, Number(body.rounds ?? 5) || 5)),
    maxParticipants: typeof body.maxParticipants === "number" ? body.maxParticipants : null,
    guildId: null,
    channelId: null,
  });
  appendTournamentId(nk, ctx, tournament.id);
  saveTournamentState(nk, ctx, tournament);
  return json({ tournament: tournament as unknown as JsonObject });
}

function rpcTournamentJoin(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const id = String(parsePayload(payload).tournamentId ?? "");
  const tournament = id ? loadTournament(nk, ctx, id) : null;
  if (!tournament) throw new Error("Tournament not found.");
  const wallet = getWallet(nk, ctx, userId);
  let next: TournamentState;
  try {
    next = registerParticipant(tournament, {
      userId,
      displayName: wallet.displayName,
      mmr: wallet.mmr,
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Registration failed.");
  }
  saveTournamentState(nk, ctx, next);
  return json({ tournament: next as unknown as JsonObject });
}

function rpcTournamentLeave(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const id = String(parsePayload(payload).tournamentId ?? "");
  const tournament = id ? loadTournament(nk, ctx, id) : null;
  if (!tournament) throw new Error("Tournament not found.");
  const next = withdrawParticipant(tournament, userId);
  saveTournamentState(nk, ctx, next);
  return json({ tournament: next as unknown as JsonObject });
}

function rpcTournamentStart(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const id = String(parsePayload(payload).tournamentId ?? "");
  const tournament = id ? loadTournament(nk, ctx, id) : null;
  if (!tournament) throw new Error("Tournament not found.");
  if (tournament.organizerId !== userId) {
    throw new Error("Only the organizer can start this tournament.");
  }
  let started: TournamentState;
  try {
    started = startTournament(tournament);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Unable to start.");
  }
  saveTournamentState(nk, ctx, started);
  return json({ tournament: started as unknown as JsonObject });
}

function rpcTournamentReport(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const id = String(body.tournamentId ?? "");
  const tournament = id ? loadTournament(nk, ctx, id) : null;
  if (!tournament) throw new Error("Tournament not found.");
  const matchId = String(body.matchId ?? "");
  const winnerRaw = body.winnerUserId;
  const winnerUserId = winnerRaw === null || winnerRaw === undefined ? null : String(winnerRaw);
  const match = tournament.matches.find((entry) => entry.id === matchId);
  if (!match) throw new Error("Match not found.");
  const isParticipant = userId === match.participantAId || userId === match.participantBId;
  const isOrganizer = userId === tournament.organizerId;
  if (!isParticipant && !isOrganizer) {
    throw new Error("Only the match participants or the organizer can report this match.");
  }
  let result;
  try {
    result = advanceTournament(tournament, { matchId, winnerUserId });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Advance failed.");
  }
  saveTournamentState(nk, ctx, result.state);
  return json({
    tournament: result.state as unknown as JsonObject,
    tournamentCompleted: result.tournamentCompleted,
  });
}

function rpcTournamentCancel(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const id = String(parsePayload(payload).tournamentId ?? "");
  const tournament = id ? loadTournament(nk, ctx, id) : null;
  if (!tournament) throw new Error("Tournament not found.");
  if (tournament.organizerId !== userId) {
    throw new Error("Only the organizer can cancel this tournament.");
  }
  const cancelled: TournamentState = { ...tournament, status: "cancelled", updatedAt: Date.now() };
  saveTournamentState(nk, ctx, cancelled);
  return json({ tournament: cancelled as unknown as JsonObject });
}

function rpcChatSend(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = requireUser(ctx);
  const body = parsePayload(payload);
  const matchId = String(body.matchId ?? "");
  const msg = {
    id: randomId(),
    matchId,
    userId,
    displayName: displayNameFor(nk, ctx, userId),
    text: String(body.text ?? "").slice(0, 500),
    at: Date.now(),
  };
  const current = readStorage<{ messages?: unknown[] }>(nk, ctx, "pazaak_chat", matchId, SYSTEM_USER_ID);
  const messages = Array.isArray(current?.messages) ? current.messages : [];
  writeStorage(nk, ctx, "pazaak_chat", matchId, SYSTEM_USER_ID, { messages: [...messages, msg].slice(-100) });
  const index = matchId ? getMatchIndex(nk, ctx, matchId) : null;
  if (index?.nakamaMatchId) {
    try {
      nk.matchSignal(ctx, index.nakamaMatchId, json({ chatRelay: msg }));
    } catch (err) {
      logger.warn("Chat relay matchSignal failed: %s", err instanceof Error ? err.message : String(err));
    }
  }
  return json({ message: msg });
}

function rpcChatHistory(ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const matchId = String(parsePayload(payload).matchId ?? "");
  const current = readStorage<{ messages?: unknown[] }>(nk, ctx, "pazaak_chat", matchId, SYSTEM_USER_ID);
  return json({ messages: Array.isArray(current?.messages) ? current.messages : [] });
}

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer): void {
  initializer.registerMatch(MATCH_HANDLER, matchHandler);
  initializer.registerMatchmakerMatched(matchmakerMatched);
  initializer.registerRpc("pazaak.config_public", rpcConfigPublic);
  initializer.registerRpc("pazaak.me", rpcMe);
  initializer.registerRpc("pazaak.settings_get", rpcSettingsGet);
  initializer.registerRpc("pazaak.settings_update", rpcSettingsUpdate);
  initializer.registerRpc("pazaak.sideboards_get", rpcSideboardsGet);
  initializer.registerRpc("pazaak.sideboard_save", rpcSideboardSave);
  initializer.registerRpc("pazaak.sideboard_active", rpcSideboardActive);
  initializer.registerRpc("pazaak.sideboard_delete", rpcSideboardDelete);
  initializer.registerRpc("pazaak.leaderboard", rpcLeaderboard);
  initializer.registerRpc("pazaak.history", rpcHistory);
  initializer.registerRpc("pazaak.matchmaking_enqueue", rpcQueueEnqueue);
  initializer.registerRpc("pazaak.matchmaking_leave", rpcQueueLeave);
  initializer.registerRpc("pazaak.matchmaking_status", rpcQueueStatus);
  initializer.registerRpc("pazaak.matchmaking_stats", rpcQueueStats);
  initializer.registerRpc("pazaak.lobbies_list", rpcLobbiesList);
  initializer.registerRpc("pazaak.lobby_create", rpcLobbyCreate);
  initializer.registerRpc("pazaak.lobby_join", rpcLobbyJoin);
  initializer.registerRpc("pazaak.lobby_ready", rpcLobbyReady);
  initializer.registerRpc("pazaak.lobby_status", rpcLobbyStatus);
  initializer.registerRpc("pazaak.lobby_leave", rpcLobbyLeave);
  initializer.registerRpc("pazaak.lobby_start", rpcLobbyStart);
  initializer.registerRpc("pazaak.lobby_add_ai", rpcLobbyAddAi);
  initializer.registerRpc("pazaak.lobby_ai_difficulty", rpcLobbyAiDifficulty);
  initializer.registerRpc("pazaak.match_get", rpcMatchGet);
  initializer.registerRpc("pazaak.match_resolve", rpcMatchResolve);
  initializer.registerRpc("pazaak.tournaments_list", rpcTournamentsList);
  initializer.registerRpc("pazaak.tournament_detail", rpcTournamentDetail);
  initializer.registerRpc("pazaak.tournament_create", rpcTournamentCreate);
  initializer.registerRpc("pazaak.tournament_join", rpcTournamentJoin);
  initializer.registerRpc("pazaak.tournament_leave", rpcTournamentLeave);
  initializer.registerRpc("pazaak.tournament_start", rpcTournamentStart);
  initializer.registerRpc("pazaak.tournament_report", rpcTournamentReport);
  initializer.registerRpc("pazaak.tournament_cancel", rpcTournamentCancel);
  initializer.registerRpc("pazaak.chat_send", rpcChatSend);
  initializer.registerRpc("pazaak.chat_history", rpcChatHistory);

  try {
    nk.leaderboardCreate(ctx, LEADERBOARD_ID, true, "desc", "set", undefined, { description: "Pazaak ranked MMR" });
  } catch {
    // Already exists on warm restarts.
  }

  logger.info("PazaakWorld Nakama runtime initialized.");
}

(globalThis as typeof globalThis & { InitModule: typeof InitModule }).InitModule = InitModule;

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { normalizeRatingDeviation, updateRatingAfterGame, PAZAAK_DEFAULT_RD } from "@openkotor/pazaak-rating";

export * from "./pazaak-account-schema.js";
export * from "./pazaak-platform-schema.js";
export { PAZAAK_DEFAULT_MMR, PAZAAK_DEFAULT_RD, PAZAAK_RD_MAX, PAZAAK_RD_MIN, expectedScore } from "@openkotor/pazaak-rating";

const scrypt = promisify(scryptCallback);

const PASSWORD_HASH_PREFIX = "scrypt-v1";
const PASSWORD_KEY_LENGTH = 64;

export interface RivalryRecord {
  opponentId: string;
  opponentName: string;
  wins: number;
  losses: number;
}

export type PazaakTableTheme = "ebon-hawk" | "coruscant" | "tatooine" | "manaan" | "dantooine" | "malachor";

export type PazaakCardBackStyle = "classic" | "holographic" | "mandalorian" | "republic" | "sith";

export type PazaakTableAmbience = "cantina" | "ebon-hawk" | "jedi-archives" | "outer-rim" | "sith-sanctum";

export type PazaakSoundTheme = "default" | "cantina" | "droid" | "force";

export type PazaakChatAudience = "everyone" | "guild" | "silent";

export interface PazaakUserSettings {
  tableTheme: PazaakTableTheme;
  cardBackStyle: PazaakCardBackStyle;
  tableAmbience: PazaakTableAmbience;
  soundEnabled: boolean;
  soundTheme: PazaakSoundTheme;
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
  chatAudience: PazaakChatAudience;
}

export interface WalletRecord {
  userId: string;
  displayName: string;
  preferredRuntimeDeckId: number | null;
  ownedSideDeckTokens: string[];
  balance: number;
  wins: number;
  losses: number;
  mmr: number;
  /**
   * Rating deviation (Glicko-style “confidence”): high = provisional / uncertain, low = stable.
   * New wallets start at {@link PAZAAK_DEFAULT_RD} (350), matching Chess.com’s public description of new accounts.
   */
  mmrRd: number;
  gamesPlayed: number;
  gamesWon: number;
  lastMatchAt: string | null;
  userSettings: PazaakUserSettings;
  streak: number;
  bestStreak: number;
  lastDailyAt: string | null;
  /** Idempotent keys for per-win / per-loss milestone grants (`win:42`, `loss:10`). */
  progressClaims: string[];
  unopenedCratesStandard: number;
  unopenedCratesPremium: number;
  rivalries: Record<string, RivalryRecord>;
  updatedAt: string;
}

interface WalletFileShape {
  version: 1;
  wallets: Record<string, WalletRecord>;
}

const defaultPazaakUserSettings = (): PazaakUserSettings => ({
  tableTheme: "ebon-hawk",
  cardBackStyle: "classic",
  tableAmbience: "cantina",
  soundEnabled: false,
  soundTheme: "default",
  reducedMotionEnabled: false,
  turnTimerSeconds: 45,
  preferredAiDifficulty: "professional",
  confirmForfeit: true,
  highlightValidPlays: true,
  focusMode: false,
  showRatingsInGame: true,
  showGuildEmblems: true,
  showHolocronStreaks: true,
  showPostMatchDebrief: true,
  chatAudience: "everyone",
});

const normalizeWalletRecord = (wallet: WalletRecord): WalletRecord => ({
  ...wallet,
  preferredRuntimeDeckId: wallet.preferredRuntimeDeckId ?? null,
  ownedSideDeckTokens: Array.isArray(wallet.ownedSideDeckTokens)
    ? wallet.ownedSideDeckTokens.filter((token): token is string => typeof token === "string")
    : [],
  progressClaims: Array.isArray(wallet.progressClaims)
    ? wallet.progressClaims.filter((key): key is string => typeof key === "string")
    : [],
  unopenedCratesStandard: typeof wallet.unopenedCratesStandard === "number" ? Math.max(0, wallet.unopenedCratesStandard) : 0,
  unopenedCratesPremium: typeof wallet.unopenedCratesPremium === "number" ? Math.max(0, wallet.unopenedCratesPremium) : 0,
  mmr: wallet.mmr ?? 1000,
  mmrRd: normalizeRatingDeviation(
    typeof (wallet as { mmrRd?: number }).mmrRd === "number" ? (wallet as { mmrRd?: number }).mmrRd : undefined,
  ),
  gamesPlayed: wallet.gamesPlayed ?? wallet.wins + wallet.losses,
  gamesWon: wallet.gamesWon ?? wallet.wins,
  lastMatchAt: wallet.lastMatchAt ?? null,
  userSettings: {
    ...defaultPazaakUserSettings(),
    ...(wallet.userSettings ?? {}),
  },
});

const cloneWallet = (wallet: WalletRecord): WalletRecord => {
  const normalized = normalizeWalletRecord(wallet);
  return {
    ...normalized,
    ownedSideDeckTokens: [...normalized.ownedSideDeckTokens],
    progressClaims: [...normalized.progressClaims],
    userSettings: { ...normalized.userSettings },
  };
};

const createWallet = (userId: string, displayName: string, startingBalance: number): WalletRecord => {
  return {
    userId,
    displayName,
    preferredRuntimeDeckId: null,
    ownedSideDeckTokens: [],
    balance: startingBalance,
    wins: 0,
    losses: 0,
    mmr: 1000,
    mmrRd: PAZAAK_DEFAULT_RD,
    gamesPlayed: 0,
    gamesWon: 0,
    lastMatchAt: null,
    userSettings: defaultPazaakUserSettings(),
    streak: 0,
    bestStreak: 0,
    lastDailyAt: null,
    progressClaims: [],
    unopenedCratesStandard: 0,
    unopenedCratesPremium: 0,
    rivalries: {},
    updatedAt: new Date().toISOString(),
  };
};

export const resolveDataFile = (rootDir: string, fileName: string): string => {
  return path.resolve(rootDir, fileName);
};

export const hashPazaakPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return `${PASSWORD_HASH_PREFIX}:${salt}:${derived.toString("base64url")}`;
};

export const verifyPazaakPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [version, salt, hash] = storedHash.split(":");

  if (version !== PASSWORD_HASH_PREFIX || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export type PazaakIdentityProvider = "discord" | "google" | "github";

export type PazaakTableVariant = "canonical" | "multi_seat";

export type PazaakLobbySideboardMode = "runtime_random" | "player_active_custom" | "host_mirror_custom";

export type PazaakLobbyGameMode = "canonical" | "wacky";

export interface PazaakTableSettings {
  variant: PazaakTableVariant;
  maxPlayers: number;
  maxRounds: number;
  turnTimerSeconds: number;
  ranked: boolean;
  allowAiFill: boolean;
  sideboardMode: PazaakLobbySideboardMode;
  gameMode: PazaakLobbyGameMode;
}

export interface PazaakAccountRecord {
  accountId: string;
  username: string;
  displayName: string;
  email: string | null;
  legacyGameUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PazaakPasswordCredentialRecord {
  accountId: string;
  passwordHash: string;
  updatedAt: string;
}

export interface PazaakLinkedIdentityRecord {
  provider: PazaakIdentityProvider;
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
  tokenHash: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface PazaakResolvedSessionRecord {
  account: PazaakAccountRecord;
  session: PazaakAccountSessionRecord;
}

export interface PazaakAccountRepositoryContract {
  createPasswordAccount(input: {
    username: string;
    displayName?: string | undefined;
    email?: string | null | undefined;
    passwordHash: string;
  }): Promise<PazaakAccountRecord>;
  ensureDiscordAccount(input: {
    discordUserId: string;
    username: string;
    displayName: string;
  }): Promise<{ account: PazaakAccountRecord; identity: PazaakLinkedIdentityRecord }>;
  ensureExternalAccount(input: {
    provider: PazaakIdentityProvider;
    providerUserId: string;
    username: string;
    displayName: string;
    email?: string | null | undefined;
    legacyGameUserId?: string | null | undefined;
  }): Promise<{ account: PazaakAccountRecord; identity: PazaakLinkedIdentityRecord }>;
  linkDiscordAccount(accountId: string, input: {
    discordUserId: string;
    username: string;
    displayName: string;
  }): Promise<PazaakLinkedIdentityRecord>;
  linkExternalIdentity(accountId: string, input: {
    provider: PazaakIdentityProvider;
    providerUserId: string;
    username: string;
    displayName: string;
  }): Promise<PazaakLinkedIdentityRecord>;
  getAccount(accountId: string): Promise<PazaakAccountRecord | undefined>;
  findPasswordAccount(identifier: string): Promise<{ account: PazaakAccountRecord; credential: PazaakPasswordCredentialRecord } | undefined>;
  listLinkedIdentities(accountId: string): Promise<readonly PazaakLinkedIdentityRecord[]>;
  createSession(accountId: string, input: { expiresAt: string; label?: string | null | undefined }): Promise<{ token: string; session: PazaakAccountSessionRecord }>;
  resolveSessionToken(token: string): Promise<PazaakResolvedSessionRecord | undefined>;
  deleteSession(sessionId: string): Promise<boolean>;
}

interface PazaakAccountFileShape {
  version: 1;
  accounts: Record<string, PazaakAccountRecord>;
  passwordCredentials: Record<string, PazaakPasswordCredentialRecord>;
  linkedIdentities: Record<string, PazaakLinkedIdentityRecord>;
  sessions: Record<string, PazaakAccountSessionRecord>;
}

const PAZAAK_SESSION_TOKEN_PREFIX = "paz_session_";

const normalizeAccountLookup = (value: string): string => value.trim().toLowerCase();
const linkedIdentityKey = (provider: PazaakIdentityProvider, providerUserId: string): string => `${provider}:${providerUserId}`;
const hashAccountSessionToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const cloneAccount = (account: PazaakAccountRecord): PazaakAccountRecord => ({ ...account });
const cloneLinkedIdentity = (identity: PazaakLinkedIdentityRecord): PazaakLinkedIdentityRecord => ({ ...identity });
const cloneAccountSession = (session: PazaakAccountSessionRecord): PazaakAccountSessionRecord => ({ ...session });

const createUniqueAccountUsername = (state: PazaakAccountFileShape, requestedUsername: string): string => {
  const fallback = "pazaak-player";
  const base = requestedUsername
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 28) || fallback;
  const usedNames = new Set(Object.values(state.accounts).map((account) => normalizeAccountLookup(account.username)));

  if (!usedNames.has(normalizeAccountLookup(base))) {
    return base;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base.slice(0, 25)}-${suffix}`;
    if (!usedNames.has(normalizeAccountLookup(candidate))) {
      return candidate;
    }
  }

  return `${fallback}-${randomUUID().slice(0, 8)}`;
};

export class JsonPazaakAccountRepository implements PazaakAccountRepositoryContract {
  private state?: PazaakAccountFileShape;

  public constructor(private readonly filePath: string) {}

  public async createPasswordAccount(input: {
    username: string;
    displayName?: string | undefined;
    email?: string | null | undefined;
    passwordHash: string;
  }): Promise<PazaakAccountRecord> {
    const state = await this.ensureState();
    const username = input.username.trim();
    const email = input.email?.trim() ? normalizeAccountLookup(input.email) : null;

    if (!username) {
      throw new Error("Username is required.");
    }

    this.assertUsernameAvailable(state, username);
    if (email) this.assertEmailAvailable(state, email);

    const now = new Date().toISOString();
    const account: PazaakAccountRecord = {
      accountId: randomUUID(),
      username,
      displayName: input.displayName?.trim() || username,
      email,
      legacyGameUserId: null,
      createdAt: now,
      updatedAt: now,
    };

    state.accounts[account.accountId] = account;
    state.passwordCredentials[account.accountId] = {
      accountId: account.accountId,
      passwordHash: input.passwordHash,
      updatedAt: now,
    };
    await this.persist(state);

    return cloneAccount(account);
  }

  public async ensureDiscordAccount(input: {
    discordUserId: string;
    username: string;
    displayName: string;
  }): Promise<{ account: PazaakAccountRecord; identity: PazaakLinkedIdentityRecord }> {
    return this.ensureExternalAccount({
      provider: "discord",
      providerUserId: input.discordUserId,
      username: input.username,
      displayName: input.displayName,
      legacyGameUserId: input.discordUserId,
    });
  }

  public async ensureExternalAccount(input: {
    provider: PazaakIdentityProvider;
    providerUserId: string;
    username: string;
    displayName: string;
    email?: string | null | undefined;
    legacyGameUserId?: string | null | undefined;
  }): Promise<{ account: PazaakAccountRecord; identity: PazaakLinkedIdentityRecord }> {
    const state = await this.ensureState();
    const key = linkedIdentityKey(input.provider, input.providerUserId);
    const now = new Date().toISOString();
    const existingIdentity = state.linkedIdentities[key];

    if (existingIdentity) {
      const account = state.accounts[existingIdentity.accountId];
      if (!account) {
        throw new Error("Linked account points to a missing account.");
      }

      const normalizedEmail = input.email?.trim() ? normalizeAccountLookup(input.email) : null;
      account.displayName = input.displayName;
      if (normalizedEmail && !account.email) {
        account.email = normalizedEmail;
      }
      account.updatedAt = now;
      existingIdentity.username = input.username;
      existingIdentity.displayName = input.displayName;
      existingIdentity.updatedAt = now;
      await this.persist(state);
      return { account: cloneAccount(account), identity: cloneLinkedIdentity(existingIdentity) };
    }

    const username = createUniqueAccountUsername(state, input.username || input.displayName);
    const account: PazaakAccountRecord = {
      accountId: randomUUID(),
      username,
      displayName: input.displayName || username,
      email: input.email?.trim() ? normalizeAccountLookup(input.email) : null,
      legacyGameUserId: input.legacyGameUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const identity: PazaakLinkedIdentityRecord = {
      provider: input.provider,
      providerUserId: input.providerUserId,
      accountId: account.accountId,
      username: input.username,
      displayName: input.displayName,
      linkedAt: now,
      updatedAt: now,
    };

    state.accounts[account.accountId] = account;
    state.linkedIdentities[key] = identity;
    await this.persist(state);

    return { account: cloneAccount(account), identity: cloneLinkedIdentity(identity) };
  }

  public async linkDiscordAccount(accountId: string, input: {
    discordUserId: string;
    username: string;
    displayName: string;
  }): Promise<PazaakLinkedIdentityRecord> {
    return this.linkExternalIdentity(accountId, {
      provider: "discord",
      providerUserId: input.discordUserId,
      username: input.username,
      displayName: input.displayName,
    });
  }

  public async linkExternalIdentity(accountId: string, input: {
    provider: PazaakIdentityProvider;
    providerUserId: string;
    username: string;
    displayName: string;
  }): Promise<PazaakLinkedIdentityRecord> {
    const state = await this.ensureState();
    const account = state.accounts[accountId];

    if (!account) {
      throw new Error("Account not found.");
    }

    const key = linkedIdentityKey(input.provider, input.providerUserId);
    const existingIdentity = state.linkedIdentities[key];

    if (existingIdentity && existingIdentity.accountId !== accountId) {
      throw new Error("That account is already linked to another profile.");
    }

    const now = new Date().toISOString();
    const identity: PazaakLinkedIdentityRecord = {
      provider: input.provider,
      providerUserId: input.providerUserId,
      accountId,
      username: input.username,
      displayName: input.displayName,
      linkedAt: existingIdentity?.linkedAt ?? now,
      updatedAt: now,
    };

    state.linkedIdentities[key] = identity;
    account.updatedAt = now;
    await this.persist(state);

    return cloneLinkedIdentity(identity);
  }

  public async unlinkDiscordAccount(accountId: string, discordUserId: string): Promise<boolean> {
    return this.unlinkExternalIdentity(accountId, "discord", discordUserId);
  }

  public async unlinkExternalIdentity(accountId: string, provider: PazaakIdentityProvider, providerUserId: string): Promise<boolean> {
    const state = await this.ensureState();
    const key = linkedIdentityKey(provider, providerUserId);
    const identity = state.linkedIdentities[key];

    if (!identity || identity.accountId !== accountId) {
      return false;
    }

    delete state.linkedIdentities[key];
    const account = state.accounts[accountId];
    if (account) account.updatedAt = new Date().toISOString();
    await this.persist(state);
    return true;
  }

  public async getAccount(accountId: string): Promise<PazaakAccountRecord | undefined> {
    const state = await this.ensureState();
    const account = state.accounts[accountId];
    return account ? cloneAccount(account) : undefined;
  }

  public async findPasswordAccount(identifier: string): Promise<{ account: PazaakAccountRecord; credential: PazaakPasswordCredentialRecord } | undefined> {
    const state = await this.ensureState();
    const normalized = normalizeAccountLookup(identifier);
    const account = Object.values(state.accounts).find((candidate) => (
      normalizeAccountLookup(candidate.username) === normalized || candidate.email === normalized
    ));

    if (!account) {
      return undefined;
    }

    const credential = state.passwordCredentials[account.accountId];
    return credential ? { account: cloneAccount(account), credential: { ...credential } } : undefined;
  }

  public async listLinkedIdentities(accountId: string): Promise<readonly PazaakLinkedIdentityRecord[]> {
    const state = await this.ensureState();
    return Object.values(state.linkedIdentities)
      .filter((identity) => identity.accountId === accountId)
      .map(cloneLinkedIdentity)
      .sort((left, right) => left.provider.localeCompare(right.provider));
  }

  public async createSession(accountId: string, input: { expiresAt: string; label?: string | null | undefined }): Promise<{ token: string; session: PazaakAccountSessionRecord }> {
    const state = await this.ensureState();

    if (!state.accounts[accountId]) {
      throw new Error("Account not found.");
    }

    const sessionId = randomUUID();
    const token = `${PAZAAK_SESSION_TOKEN_PREFIX}${sessionId}.${randomUUID().replace(/-/gu, "")}`;
    const now = new Date().toISOString();
    const session: PazaakAccountSessionRecord = {
      sessionId,
      accountId,
      tokenHash: hashAccountSessionToken(token),
      label: input.label ?? null,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: input.expiresAt,
    };

    state.sessions[sessionId] = session;
    await this.persist(state);

    return { token, session: cloneAccountSession(session) };
  }

  public async resolveSessionToken(token: string): Promise<PazaakResolvedSessionRecord | undefined> {
    if (!token.startsWith(PAZAAK_SESSION_TOKEN_PREFIX)) {
      return undefined;
    }

    const state = await this.ensureState();
    const tokenHash = hashAccountSessionToken(token);
    const session = Object.values(state.sessions).find((candidate) => candidate.tokenHash === tokenHash);

    if (!session) {
      return undefined;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      delete state.sessions[session.sessionId];
      await this.persist(state);
      return undefined;
    }

    const account = state.accounts[session.accountId];
    if (!account) {
      delete state.sessions[session.sessionId];
      await this.persist(state);
      return undefined;
    }

    session.lastUsedAt = new Date().toISOString();
    await this.persist(state);
    return { account: cloneAccount(account), session: cloneAccountSession(session) };
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const state = await this.ensureState();

    if (!state.sessions[sessionId]) {
      return false;
    }

    delete state.sessions[sessionId];
    await this.persist(state);
    return true;
  }

  private async ensureState(): Promise<PazaakAccountFileShape> {
    if (this.state) return this.state;
    await mkdir(path.dirname(this.filePath), { recursive: true });

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

      if (code !== "ENOENT") {
        throw error;
      }

      this.state = {
        version: 1,
        accounts: {},
        passwordCredentials: {},
        linkedIdentities: {},
        sessions: {},
      };
      await this.persist(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PazaakAccountFileShape>;
      if (
        parsed.version === 1
        && parsed.accounts
        && typeof parsed.accounts === "object"
        && parsed.passwordCredentials
        && typeof parsed.passwordCredentials === "object"
        && parsed.linkedIdentities
        && typeof parsed.linkedIdentities === "object"
        && parsed.sessions
        && typeof parsed.sessions === "object"
      ) {
        this.state = {
          version: 1,
          accounts: parsed.accounts,
          passwordCredentials: parsed.passwordCredentials,
          linkedIdentities: parsed.linkedIdentities,
          sessions: parsed.sessions,
        };
        return this.state;
      }
    } catch {
      // Fall through to quarantine + reset for malformed persisted state.
    }

    const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
    await rename(this.filePath, quarantinePath).catch(() => {
      // Ignore quarantine failures and continue with reset state.
    });

    this.state = {
      version: 1,
      accounts: {},
      passwordCredentials: {},
      linkedIdentities: {},
      sessions: {},
    };
    await this.persist(this.state);

    return this.state;
  }

  private assertUsernameAvailable(state: PazaakAccountFileShape, username: string): void {
    const normalized = normalizeAccountLookup(username);
    const existing = Object.values(state.accounts).find((account) => normalizeAccountLookup(account.username) === normalized);
    if (existing) {
      throw new Error("That username is already taken.");
    }
  }

  private assertEmailAvailable(state: PazaakAccountFileShape, email: string): void {
    const existing = Object.values(state.accounts).find((account) => account.email === email);
    if (existing) {
      throw new Error("That email is already in use.");
    }
  }

  private async persist(state: PazaakAccountFileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export class JsonWalletRepository {
  private state?: WalletFileShape;

  public constructor(
    private readonly filePath: string,
    private readonly startingBalance: number,
    private readonly starterOwnedTokens: readonly string[] = [],
  ) {}

  public async getWallet(userId: string, displayName: string): Promise<WalletRecord> {
    const state = await this.ensureState();
    const wallet = state.wallets[userId] ?? this.upsertWallet(state, userId, displayName);
    if (this.starterOwnedTokens.length > 0 && wallet.ownedSideDeckTokens.length === 0) {
      wallet.ownedSideDeckTokens = [...this.starterOwnedTokens];
      wallet.updatedAt = new Date().toISOString();
      await this.persist(state);
    }
    return cloneWallet(wallet);
  }

  /**
   * Append additional unlocked side-deck tokens (drops, tournament prizes). Does not dedupe —
   * callers enforce economy rules.
   */
  public async addOwnedSideDeckTokens(userId: string, displayName: string, tokens: readonly string[]): Promise<WalletRecord> {
    if (tokens.length === 0) {
      return this.getWallet(userId, displayName);
    }

    const state = await this.ensureState();
    const wallet = this.upsertWallet(state, userId, displayName);
    wallet.ownedSideDeckTokens = [...wallet.ownedSideDeckTokens, ...tokens];
    wallet.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneWallet(wallet);
  }

  /**
   * Applies win/loss milestone crate and card grants in one persist (match settlement).
   */
  public async applyMatchProgressionDeltas(
    updates: ReadonlyArray<{
      userId: string;
      displayName: string;
      addStandardCrates?: number;
      addPremiumCrates?: number;
      newProgressKeys?: readonly string[];
      addTokens?: readonly string[];
    }>,
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const state = await this.ensureState();
    const now = new Date().toISOString();

    for (const entry of updates) {
      const wallet = this.upsertWallet(state, entry.userId, entry.displayName);
      wallet.unopenedCratesStandard = Math.max(0, wallet.unopenedCratesStandard + (entry.addStandardCrates ?? 0));
      wallet.unopenedCratesPremium = Math.max(0, wallet.unopenedCratesPremium + (entry.addPremiumCrates ?? 0));

      for (const key of entry.newProgressKeys ?? []) {
        if (!wallet.progressClaims.includes(key)) {
          wallet.progressClaims.push(key);
        }
      }

      const extra = entry.addTokens ?? [];
      if (extra.length > 0) {
        wallet.ownedSideDeckTokens = [...wallet.ownedSideDeckTokens, ...extra];
      }

      wallet.updatedAt = now;
    }

    await this.persist(state);
  }

  /**
   * Consumes one unopened crate of `crateKind` and applies engine-rolled drops (tokens + bonus credits).
   */
  public async consumeCrateAndApplyDrops(
    userId: string,
    displayName: string,
    crateKind: "standard" | "premium",
    drops: { tokens: readonly string[]; bonusCredits: number },
  ): Promise<WalletRecord> {
    const state = await this.ensureState();
    const wallet = this.upsertWallet(state, userId, displayName);
    const field = crateKind === "standard" ? "unopenedCratesStandard" : "unopenedCratesPremium";

    if (wallet[field] < 1) {
      throw Object.assign(new Error(`No ${crateKind} crates to open.`), { status: 400 });
    }

    wallet[field] -= 1;
    wallet.ownedSideDeckTokens = [...wallet.ownedSideDeckTokens, ...drops.tokens];
    wallet.balance = Math.max(0, wallet.balance + drops.bonusCredits);
    wallet.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneWallet(wallet);
  }

  public async canCover(userId: string, displayName: string, amount: number): Promise<boolean> {
    const wallet = await this.getWallet(userId, displayName);
    return wallet.balance >= amount;
  }

  public async listWallets(): Promise<readonly WalletRecord[]> {
    const state = await this.ensureState();
    return Object.values(state.wallets)
      .map(cloneWallet)
      .sort((left, right) => right.balance - left.balance || right.wins - left.wins || left.losses - right.losses);
  }

  public async setPreferredRuntimeDeckId(userId: string, displayName: string, deckId: number | null): Promise<WalletRecord> {
    const state = await this.ensureState();
    const wallet = this.upsertWallet(state, userId, displayName);
    wallet.preferredRuntimeDeckId = deckId;
    wallet.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneWallet(wallet);
  }

  public async getUserSettings(userId: string, displayName: string): Promise<PazaakUserSettings> {
    const wallet = await this.getWallet(userId, displayName);
    return { ...wallet.userSettings };
  }

  public async updateUserSettings(
    userId: string,
    displayName: string,
    settings: Partial<PazaakUserSettings>,
  ): Promise<WalletRecord> {
    const state = await this.ensureState();
    const wallet = this.upsertWallet(state, userId, displayName);
    wallet.userSettings = {
      ...wallet.userSettings,
      ...settings,
    };
    wallet.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneWallet(wallet);
  }

  public async claimDailyBonus(
    userId: string,
    displayName: string,
    bonusAmount: number,
    cooldownMs: number,
  ): Promise<{ credited: boolean; amount: number; nextEligibleAt: number }> {
    const state = await this.ensureState();
    const wallet = this.upsertWallet(state, userId, displayName);
    const now = Date.now();
    const lastDaily = wallet.lastDailyAt ? new Date(wallet.lastDailyAt).getTime() : 0;

    if (now - lastDaily < cooldownMs) {
      return { credited: false, amount: 0, nextEligibleAt: lastDaily + cooldownMs };
    }

    wallet.balance += bonusAmount;
    wallet.lastDailyAt = new Date().toISOString();
    wallet.updatedAt = new Date().toISOString();
    await this.persist(state);
    return { credited: true, amount: bonusAmount, nextEligibleAt: now + cooldownMs };
  }

  public async recordMatch(options: {
    winnerId: string;
    winnerName: string;
    loserId: string;
    loserName: string;
    wager: number;
  }): Promise<{ winner: WalletRecord; loser: WalletRecord }> {
    const state = await this.ensureState();
    const winner = this.upsertWallet(state, options.winnerId, options.winnerName);
    const loser = this.upsertWallet(state, options.loserId, options.loserName);
    const matchedAt = new Date().toISOString();
    const winnerBefore = { mmr: winner.mmr, rd: winner.mmrRd };
    const loserBefore = { mmr: loser.mmr, rd: loser.mmrRd };

    loser.balance = Math.max(0, loser.balance - options.wager);
    loser.losses += 1;
    loser.gamesPlayed += 1;
    loser.lastMatchAt = matchedAt;
    const loserRating = updateRatingAfterGame(loserBefore, winnerBefore, 0);
    loser.mmr = loserRating.mmr;
    loser.mmrRd = loserRating.rd;
    loser.streak = 0;
    loser.updatedAt = matchedAt;

    winner.balance += options.wager;
    winner.wins += 1;
    winner.gamesPlayed += 1;
    winner.gamesWon += 1;
    winner.lastMatchAt = matchedAt;
    const winnerRating = updateRatingAfterGame(winnerBefore, loserBefore, 1);
    winner.mmr = winnerRating.mmr;
    winner.mmrRd = winnerRating.rd;
    winner.streak += 1;
    winner.bestStreak = Math.max(winner.bestStreak, winner.streak);
    winner.updatedAt = matchedAt;

    this.upsertRivalry(winner, options.loserId, options.loserName, "win");
    this.upsertRivalry(loser, options.winnerId, options.winnerName, "loss");

    await this.persist(state);

    return {
      winner: cloneWallet(winner),
      loser: cloneWallet(loser),
    };
  }

  public topRivalry(wallet: WalletRecord): RivalryRecord | undefined {
    const entries = Object.values(wallet.rivalries);
    if (entries.length === 0) return undefined;
    return entries.reduce((best, entry) => {
      const bestTotal = best.wins + best.losses;
      const entryTotal = entry.wins + entry.losses;
      return entryTotal > bestTotal ? entry : best;
    });
  }

  public allRivalries(wallet: WalletRecord): readonly RivalryRecord[] {
    return Object.values(wallet.rivalries).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  }

  /**
   * Directly adjust a wallet balance by a signed delta (positive = add, negative = subtract).
   * Balance is floored at 0. Returns the updated wallet record.
   */
  public async adjustBalance(userId: string, displayName: string, delta: number): Promise<WalletRecord> {
    const state = await this.ensureState();
    const wallet = this.upsertWallet(state, userId, displayName);
    wallet.balance = Math.max(0, wallet.balance + delta);
    wallet.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneWallet(wallet);
  }

  private async ensureState(): Promise<WalletFileShape> {
    if (this.state) {
      return this.state;
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

      if (code !== "ENOENT") {
        throw error;
      }

      this.state = {
        version: 1,
        wallets: {},
      };

      await this.persist(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<WalletFileShape>;
      if (parsed.version === 1 && parsed.wallets && typeof parsed.wallets === "object") {
        this.state = {
          version: 1,
          wallets: parsed.wallets,
        };
        return this.state;
      }
    } catch {
      // Fall through to quarantine + reset for malformed persisted state.
    }

    const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
    await rename(this.filePath, quarantinePath).catch(() => {
      // Ignore quarantine failures and continue with reset state.
    });

    this.state = {
      version: 1,
      wallets: {},
    };
    await this.persist(this.state);

    return this.state;
  }

  private upsertWallet(state: WalletFileShape, userId: string, displayName: string): WalletRecord {
    const existing = state.wallets[userId];

    if (existing) {
      existing.displayName = displayName;
      Object.assign(existing, normalizeWalletRecord(existing));
      return existing;
    }

    const created = createWallet(userId, displayName, this.startingBalance);
    state.wallets[userId] = created;
    return created;
  }

  private upsertRivalry(wallet: WalletRecord, opponentId: string, opponentName: string, outcome: "win" | "loss"): void {
    const existing = wallet.rivalries[opponentId];

    if (existing) {
      existing.opponentName = opponentName;
      if (outcome === "win") existing.wins += 1;
      else existing.losses += 1;
      return;
    }

    wallet.rivalries[opponentId] = {
      opponentId,
      opponentName,
      wins: outcome === "win" ? 1 : 0,
      losses: outcome === "loss" ? 1 : 0,
    };
  }

  private async persist(state: WalletFileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export const DEFAULT_PAZAAK_SIDEBOARD_NAME = "default";

export interface NamedPazaakSideboardRecord {
  name: string;
  tokens: readonly string[];
  updatedAt: string;
}

export interface SavedPazaakSideboardRecord {
  userId: string;
  displayName: string;
  name: string;
  tokens: readonly string[];
  updatedAt: string;
  isActive: boolean;
}

export interface SavedPazaakSideboardCollectionRecord {
  userId: string;
  displayName: string;
  activeName: string | null;
  sideboards: readonly SavedPazaakSideboardRecord[];
  updatedAt: string;
}

interface LegacySavedPazaakSideboardRecord {
  userId: string;
  displayName: string;
  tokens: readonly string[];
  updatedAt: string;
}

interface StoredPazaakSideboardCollectionRecord {
  userId: string;
  displayName: string;
  activeName: string | null;
  sideboards: Record<string, NamedPazaakSideboardRecord>;
  updatedAt: string;
}

interface LegacySavedPazaakSideboardFileShape {
  version: 1;
  sideboards: Record<string, LegacySavedPazaakSideboardRecord>;
}

interface SavedPazaakSideboardFileShape {
  version: 2;
  sideboards: Record<string, StoredPazaakSideboardCollectionRecord>;
}

const normalizePazaakSideboardName = (name: string): string => name.trim().replace(/\s+/gu, " ").toLowerCase();

const cloneNamedSideboard = (sideboard: NamedPazaakSideboardRecord): NamedPazaakSideboardRecord => ({
  ...sideboard,
  tokens: [...sideboard.tokens],
});

const cloneSideboard = (
  user: StoredPazaakSideboardCollectionRecord,
  sideboard: NamedPazaakSideboardRecord,
  sideboardKey: string,
): SavedPazaakSideboardRecord => ({
  userId: user.userId,
  displayName: user.displayName,
  name: sideboard.name,
  tokens: [...sideboard.tokens],
  updatedAt: sideboard.updatedAt,
  isActive: user.activeName === sideboardKey,
});

const cloneSideboardCollection = (
  user: StoredPazaakSideboardCollectionRecord,
): SavedPazaakSideboardCollectionRecord => ({
  userId: user.userId,
  displayName: user.displayName,
  activeName: user.activeName,
  sideboards: Object.entries(user.sideboards)
    .map(([key, sideboard]) => cloneSideboard(user, sideboard, key))
    .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.name.localeCompare(right.name)),
  updatedAt: user.updatedAt,
});

const createSideboardCollection = (userId: string, displayName: string): StoredPazaakSideboardCollectionRecord => ({
  userId,
  displayName,
  activeName: null,
  sideboards: {},
  updatedAt: new Date().toISOString(),
});

const migrateLegacySideboards = (legacy: LegacySavedPazaakSideboardFileShape): SavedPazaakSideboardFileShape => {
  const sideboards: Record<string, StoredPazaakSideboardCollectionRecord> = {};

  for (const [userId, sideboard] of Object.entries(legacy.sideboards ?? {})) {
    sideboards[userId] = {
      userId: sideboard.userId,
      displayName: sideboard.displayName,
      activeName: DEFAULT_PAZAAK_SIDEBOARD_NAME,
      sideboards: {
        [DEFAULT_PAZAAK_SIDEBOARD_NAME]: {
          name: DEFAULT_PAZAAK_SIDEBOARD_NAME,
          tokens: [...sideboard.tokens],
          updatedAt: sideboard.updatedAt,
        },
      },
      updatedAt: sideboard.updatedAt,
    };
  }

  return {
    version: 2,
    sideboards,
  };
};

export class JsonPazaakSideboardRepository {
  private state?: SavedPazaakSideboardFileShape;

  public constructor(private readonly filePath: string) {}

  public async getSideboard(userId: string, name?: string): Promise<SavedPazaakSideboardRecord | undefined> {
    const state = await this.ensureState();
    const user = state.sideboards[userId];

    if (!user) {
      return undefined;
    }

    const key = name ? normalizePazaakSideboardName(name) : user.activeName;

    if (!key) {
      return undefined;
    }

    const sideboard = user.sideboards[key];
    return sideboard ? cloneSideboard(user, sideboard, key) : undefined;
  }

  public async listSideboards(userId: string, displayName?: string): Promise<SavedPazaakSideboardCollectionRecord> {
    const state = await this.ensureState();
    const user = state.sideboards[userId];

    if (!user) {
      return {
        userId,
        displayName: displayName ?? userId,
        activeName: null,
        sideboards: [],
        updatedAt: new Date(0).toISOString(),
      };
    }

    return cloneSideboardCollection(user);
  }

  public async saveSideboard(
    userId: string,
    displayName: string,
    tokens: readonly string[],
    name?: string,
    makeActive = true,
  ): Promise<SavedPazaakSideboardRecord> {
    const state = await this.ensureState();
    const user = this.upsertSideboardCollection(state, userId, displayName);
    const resolvedName = name?.trim().replace(/\s+/gu, " ") || user.activeName || DEFAULT_PAZAAK_SIDEBOARD_NAME;
    const sideboardKey = normalizePazaakSideboardName(resolvedName);
    const updatedAt = new Date().toISOString();

    user.sideboards[sideboardKey] = {
      name: resolvedName,
      tokens: [...tokens],
      updatedAt,
    };

    if (makeActive || !user.activeName) {
      user.activeName = sideboardKey;
    }

    user.updatedAt = updatedAt;
    await this.persist(state);

    return cloneSideboard(user, user.sideboards[sideboardKey]!, sideboardKey);
  }

  public async setActiveSideboard(userId: string, displayName: string, name: string): Promise<SavedPazaakSideboardRecord> {
    const state = await this.ensureState();
    const user = this.upsertSideboardCollection(state, userId, displayName);
    const sideboardKey = normalizePazaakSideboardName(name);
    const sideboard = user.sideboards[sideboardKey];

    if (!sideboard) {
      throw new Error(`No saved sideboard named "${name}" exists.`);
    }

    user.activeName = sideboardKey;
    user.updatedAt = new Date().toISOString();
    await this.persist(state);

    return cloneSideboard(user, sideboard, sideboardKey);
  }

  public async clearSideboard(userId: string, name?: string): Promise<boolean> {
    const state = await this.ensureState();
    const user = state.sideboards[userId];

    if (!user) {
      return false;
    }

    const sideboardKey = name ? normalizePazaakSideboardName(name) : user.activeName;

    if (!sideboardKey || !user.sideboards[sideboardKey]) {
      return false;
    }

    delete user.sideboards[sideboardKey];

    const remainingKeys = Object.keys(user.sideboards).sort((left, right) => user.sideboards[left]!.name.localeCompare(user.sideboards[right]!.name));

    if (remainingKeys.length === 0) {
      delete state.sideboards[userId];
    } else {
      if (user.activeName === sideboardKey) {
        user.activeName = remainingKeys[0]!;
      }

      user.updatedAt = new Date().toISOString();
    }

    await this.persist(state);
    return true;
  }

  private async ensureState(): Promise<SavedPazaakSideboardFileShape> {
    if (this.state) {
      return this.state;
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

      if (code !== "ENOENT") {
        throw error;
      }

      this.state = {
        version: 2,
        sideboards: {},
      };
      await this.persist(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(raw) as SavedPazaakSideboardFileShape | LegacySavedPazaakSideboardFileShape;

      if (parsed.version === 2 && parsed.sideboards && typeof parsed.sideboards === "object") {
        this.state = parsed;
        return this.state;
      }

      if (parsed.version === 1) {
        this.state = migrateLegacySideboards(parsed as LegacySavedPazaakSideboardFileShape);
        await this.persist(this.state);
        return this.state;
      }
    } catch {
      // Fall through to quarantine + reset for malformed persisted state.
    }

    const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
    await rename(this.filePath, quarantinePath).catch(() => {
      // Ignore quarantine failures and continue with reset state.
    });

    this.state = {
      version: 2,
      sideboards: {},
    };
    await this.persist(this.state);

    return this.state;
  }

  private upsertSideboardCollection(
    state: SavedPazaakSideboardFileShape,
    userId: string,
    displayName: string,
  ): StoredPazaakSideboardCollectionRecord {
    const existing = state.sideboards[userId];

    if (existing) {
      existing.displayName = displayName;
      return existing;
    }

    const created = createSideboardCollection(userId, displayName);
    state.sideboards[userId] = created;
    return created;
  }

  private async persist(state: SavedPazaakSideboardFileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

// ---------------------------------------------------------------------------
// Designation preset repository
// ---------------------------------------------------------------------------

export interface DesignationPresetRecord {
  userId: string;
  guildId: string;
  roleIds: readonly string[];
  updatedAt: string;
}

interface DesignationPresetFileShape {
  version: 1;
  presets: Record<string, DesignationPresetRecord>;
}

const presetKey = (guildId: string, userId: string): string => `${guildId}:${userId}`;

export class JsonDesignationPresetRepository {
  private state?: DesignationPresetFileShape;

  public constructor(private readonly filePath: string) {}

  public async getPreset(guildId: string, userId: string): Promise<readonly string[] | undefined> {
    const state = await this.ensureState();
    return state.presets[presetKey(guildId, userId)]?.roleIds;
  }

  public async savePreset(guildId: string, userId: string, roleIds: readonly string[]): Promise<void> {
    const state = await this.ensureState();
    state.presets[presetKey(guildId, userId)] = {
      userId,
      guildId,
      roleIds: [...roleIds],
      updatedAt: new Date().toISOString(),
    };
    await this.persist(state);
  }

  private async ensureState(): Promise<DesignationPresetFileShape> {
    if (this.state) {
      return this.state;
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

      if (code !== "ENOENT") {
        throw error;
      }

      this.state = { version: 1, presets: {} };
      await this.persist(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<DesignationPresetFileShape>;
      if (parsed.version === 1 && parsed.presets && typeof parsed.presets === "object") {
        this.state = {
          version: 1,
          presets: parsed.presets,
        };
        return this.state;
      }
    } catch {
      // Fall through to quarantine + reset for malformed persisted state.
    }

    const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
    await rename(this.filePath, quarantinePath).catch(() => {
      // Ignore quarantine failures and continue with reset state.
    });

    this.state = { version: 1, presets: {} };
    await this.persist(this.state);

    return this.state;
  }

  private async persist(state: DesignationPresetFileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

// ---------------------------------------------------------------------------
// Cross-platform Pazaak repositories
// ---------------------------------------------------------------------------

export interface MatchmakingQueueRecord {
  userId: string;
  displayName: string;
  mmr: number;
  preferredMaxPlayers: number;
  enqueuedAt: string;
}

interface MatchmakingQueueFileShape {
  version: 1;
  queue: Record<string, MatchmakingQueueRecord>;
}

const cloneQueueRecord = (record: MatchmakingQueueRecord): MatchmakingQueueRecord => ({ ...record });

export class JsonPazaakMatchmakingQueueRepository {
  private state?: MatchmakingQueueFileShape;

  public constructor(private readonly filePath: string) {}

  public async list(): Promise<readonly MatchmakingQueueRecord[]> {
    const state = await this.ensureState();
    return Object.values(state.queue)
      .map(cloneQueueRecord)
      .sort((left, right) => left.enqueuedAt.localeCompare(right.enqueuedAt));
  }

  public async get(userId: string): Promise<MatchmakingQueueRecord | undefined> {
    const state = await this.ensureState();
    const record = state.queue[userId];
    return record ? cloneQueueRecord(record) : undefined;
  }

  public async enqueue(record: Omit<MatchmakingQueueRecord, "enqueuedAt">): Promise<MatchmakingQueueRecord> {
    const state = await this.ensureState();
    const nextRecord: MatchmakingQueueRecord = {
      ...record,
      preferredMaxPlayers: Math.max(2, Math.min(5, record.preferredMaxPlayers)),
      enqueuedAt: state.queue[record.userId]?.enqueuedAt ?? new Date().toISOString(),
    };
    state.queue[record.userId] = nextRecord;
    await this.persist(state);
    return cloneQueueRecord(nextRecord);
  }

  public async remove(userId: string): Promise<boolean> {
    const state = await this.ensureState();

    if (!state.queue[userId]) {
      return false;
    }

    delete state.queue[userId];
    await this.persist(state);
    return true;
  }

  private async ensureState(): Promise<MatchmakingQueueFileShape> {
    if (this.state) return this.state;
    await mkdir(path.dirname(this.filePath), { recursive: true });

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

      if (code !== "ENOENT") {
        throw error;
      }

      this.state = { version: 1, queue: {} };
      await this.persist(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<MatchmakingQueueFileShape>;
      if (parsed.version === 1 && parsed.queue && typeof parsed.queue === "object") {
        this.state = {
          version: 1,
          queue: parsed.queue,
        };
        return this.state;
      }
    } catch {
      // Fall through to quarantine + reset for malformed persisted state.
    }

    const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
    await rename(this.filePath, quarantinePath).catch(() => {
      // Ignore quarantine failures and continue with reset state.
    });

    this.state = { version: 1, queue: {} };
    await this.persist(this.state);

    return this.state;
  }

  private async persist(state: MatchmakingQueueFileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export type PazaakLobbyStatus = "waiting" | "matchmaking" | "in_game" | "closed";
export type PazaakLobbyPlayerConnectionStatus = "connected" | "disconnected" | "ai_takeover";

export interface PazaakLobbyPlayerRecord {
  userId: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  isAi: boolean;
  aiDifficulty?: "easy" | "hard" | "professional" | undefined;
  connectionStatus: PazaakLobbyPlayerConnectionStatus;
  joinedAt: string;
}

export interface PazaakLobbyRecord {
  id: string;
  lobbyCode: string;
  name: string;
  hostUserId: string;
  maxPlayers: number;
  tableSettings: PazaakTableSettings;
  passwordHash: string | null;
  status: PazaakLobbyStatus;
  matchId: string | null;
  players: readonly PazaakLobbyPlayerRecord[];
  createdAt: string;
  updatedAt: string;
}

interface PazaakLobbyFileShape {
  version: 1;
  lobbies: Record<string, PazaakLobbyRecord>;
}

const hashLobbyPassword = (password: string): string => createHash("sha256").update(password).digest("hex");
const normalizeLobbyCode = (value: string): string => value.trim().toUpperCase();

const createLobbyCode = (state: PazaakLobbyFileShape): string => {
  const used = new Set(Object.values(state.lobbies).map((lobby) => normalizeLobbyCode(lobby.lobbyCode ?? "")));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]!;
    }

    if (!used.has(code)) {
      return code;
    }
  }

  return randomUUID().slice(0, 6).toUpperCase();
};

const normalizeTableSettings = (settings?: Partial<PazaakTableSettings> | undefined): PazaakTableSettings => {
  const variant = settings?.variant === "multi_seat" ? "multi_seat" : "canonical";
  const maxPlayers = Math.max(2, Math.min(5, Math.trunc(settings?.maxPlayers ?? 2)));
  const maxRounds = Math.max(1, Math.min(9, Math.trunc(settings?.maxRounds ?? 3)));
  const turnTimerSeconds = Math.max(0, Math.min(300, Math.trunc(settings?.turnTimerSeconds ?? 120)));
  const sideboardMode = settings?.sideboardMode === "player_active_custom"
    ? "player_active_custom"
    : settings?.sideboardMode === "host_mirror_custom"
      ? "host_mirror_custom"
      : "runtime_random";
  const ranked = settings?.ranked ?? variant === "canonical";
  const gameMode: PazaakLobbyGameMode = ranked ? "canonical" : (settings?.gameMode === "wacky" ? "wacky" : "canonical");

  return {
    variant,
    maxPlayers: variant === "canonical" ? 2 : maxPlayers,
    maxRounds,
    turnTimerSeconds,
    ranked,
    allowAiFill: settings?.allowAiFill ?? true,
    sideboardMode,
    gameMode,
  };
};

const cloneLobby = (lobby: PazaakLobbyRecord): PazaakLobbyRecord => ({
  ...lobby,
  tableSettings: normalizeTableSettings(lobby.tableSettings),
  players: lobby.players.map((player) => ({
    ...player,
    connectionStatus: player.connectionStatus ?? (player.isAi ? "ai_takeover" : "connected"),
  })),
});

export class JsonPazaakLobbyRepository {
  private state?: PazaakLobbyFileShape;

  public constructor(private readonly filePath: string) {}

  public async listOpen(): Promise<readonly PazaakLobbyRecord[]> {
    const state = await this.ensureState();
    return Object.values(state.lobbies)
      .filter((lobby) => lobby.status === "waiting" || lobby.status === "matchmaking")
      .map(cloneLobby)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async get(lobbyId: string): Promise<PazaakLobbyRecord | undefined> {
    const state = await this.ensureState();
    const lobby = state.lobbies[lobbyId];
    return lobby ? cloneLobby(lobby) : undefined;
  }

  public async getByCode(lobbyCode: string): Promise<PazaakLobbyRecord | undefined> {
    const state = await this.ensureState();
    const normalized = normalizeLobbyCode(lobbyCode);
    const lobby = Object.values(state.lobbies).find((candidate) => (
      (candidate.status === "waiting" || candidate.status === "matchmaking")
      && normalizeLobbyCode(candidate.lobbyCode) === normalized
    ));
    return lobby ? cloneLobby(lobby) : undefined;
  }

  public async create(input: {
    name: string;
    hostUserId: string;
    hostName: string;
    maxPlayers: number;
    password?: string | undefined;
    tableSettings?: Partial<PazaakTableSettings> | undefined;
  }): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const now = new Date().toISOString();
    const tableSettings = normalizeTableSettings({
      ...input.tableSettings,
      maxPlayers: input.tableSettings?.maxPlayers ?? input.maxPlayers,
    });
    const lobby: PazaakLobbyRecord = {
      id: randomUUID(),
      lobbyCode: createLobbyCode(state),
      name: input.name.trim() || `${input.hostName}'s Table`,
      hostUserId: input.hostUserId,
      maxPlayers: tableSettings.maxPlayers,
      tableSettings,
      passwordHash: input.password ? hashLobbyPassword(input.password) : null,
      status: "waiting",
      matchId: null,
      players: [{
        userId: input.hostUserId,
        displayName: input.hostName,
        ready: true,
        isHost: true,
        isAi: false,
        connectionStatus: "connected",
        joinedAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
    state.lobbies[lobby.id] = lobby;
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async join(lobbyId: string, input: { userId: string; displayName: string; password?: string | undefined }): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const lobby = this.getMutableLobby(state, lobbyId);
    this.assertLobbyPassword(lobby, input.password);

    if (lobby.players.some((player) => player.userId === input.userId)) {
      return cloneLobby(lobby);
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      throw new Error("That lobby is full.");
    }

    lobby.players = [...lobby.players, {
      userId: input.userId,
      displayName: input.displayName,
      ready: false,
      isHost: false,
      isAi: false,
      connectionStatus: "connected",
      joinedAt: new Date().toISOString(),
    }];
    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async setReady(lobbyId: string, userId: string, ready: boolean): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const lobby = this.getMutableLobby(state, lobbyId);
    lobby.players = lobby.players.map((player) => player.userId === userId ? { ...player, ready } : player);
    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async addAi(lobbyId: string, hostUserId: string, difficulty: "easy" | "hard" | "professional"): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const lobby = this.getMutableLobby(state, lobbyId);

    if (lobby.hostUserId !== hostUserId) {
      throw new Error("Only the lobby host can add AI seats.");
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      throw new Error("That lobby is full.");
    }

    const aiNumber = lobby.players.filter((player) => player.isAi).length + 1;
    lobby.players = [...lobby.players, {
      userId: `ai:${lobby.id}:${aiNumber}`,
      displayName: `${difficulty[0]!.toUpperCase()}${difficulty.slice(1)} AI ${aiNumber}`,
      ready: true,
      isHost: false,
      isAi: true,
      aiDifficulty: difficulty,
      connectionStatus: "ai_takeover",
      joinedAt: new Date().toISOString(),
    }];
    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async updateAiDifficulty(
    lobbyId: string,
    hostUserId: string,
    aiUserId: string,
    difficulty: "easy" | "hard" | "professional",
  ): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const lobby = this.getMutableLobby(state, lobbyId);

    if (lobby.hostUserId !== hostUserId) {
      throw new Error("Only the lobby host can update AI seat difficulty.");
    }

    const aiSeat = lobby.players.find((player) => player.userId === aiUserId);
    if (!aiSeat || !aiSeat.isAi) {
      throw new Error("AI seat not found.");
    }

    lobby.players = lobby.players.map((player) => {
      if (player.userId !== aiUserId) return player;

      return {
        ...player,
        aiDifficulty: difficulty,
        displayName: `${difficulty[0]!.toUpperCase()}${difficulty.slice(1)} AI ${player.userId.split(":").pop() ?? ""}`.trim(),
      };
    });
    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async leave(lobbyId: string, userId: string): Promise<PazaakLobbyRecord | undefined> {
    const state = await this.ensureState();
    const lobby = state.lobbies[lobbyId];

    if (!lobby) return undefined;

    const players = lobby.players.filter((player) => player.userId !== userId);

    if (players.length === 0 || lobby.hostUserId === userId) {
      lobby.status = "closed";
      lobby.players = players;
    } else {
      lobby.players = players;
    }

    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async markInGame(lobbyId: string, matchId: string): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const lobby = this.getMutableLobby(state, lobbyId);
    lobby.status = "in_game";
    lobby.matchId = matchId;
    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  public async setStatus(
    lobbyId: string,
    hostUserId: string,
    status: "waiting" | "matchmaking",
  ): Promise<PazaakLobbyRecord> {
    const state = await this.ensureState();
    const lobby = state.lobbies[lobbyId];

    if (!lobby || (lobby.status !== "waiting" && lobby.status !== "matchmaking")) {
      throw new Error("That lobby is not available.");
    }

    if (lobby.hostUserId !== hostUserId) {
      throw new Error("Only the lobby host can update lobby status.");
    }

    lobby.status = status;
    lobby.updatedAt = new Date().toISOString();
    await this.persist(state);
    return cloneLobby(lobby);
  }

  private async ensureState(): Promise<PazaakLobbyFileShape> {
    if (this.state) return this.state;
    await mkdir(path.dirname(this.filePath), { recursive: true });

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

      if (code !== "ENOENT") {
        throw error;
      }

      this.state = { version: 1, lobbies: {} };
      await this.persist(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PazaakLobbyFileShape>;
      if (parsed.version === 1 && parsed.lobbies && typeof parsed.lobbies === "object") {
        this.state = {
          version: 1,
          lobbies: parsed.lobbies,
        };
      } else {
        const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
        await rename(this.filePath, quarantinePath).catch(() => {
          // Ignore quarantine failures and continue with reset state.
        });
        this.state = { version: 1, lobbies: {} };
        await this.persist(this.state);
        return this.state;
      }
    } catch {
      const quarantinePath = `${this.filePath}.corrupt.${Date.now()}`;
      await rename(this.filePath, quarantinePath).catch(() => {
        // Ignore quarantine failures and continue with reset state.
      });
      this.state = { version: 1, lobbies: {} };
      await this.persist(this.state);
      return this.state;
    }

    try {
      for (const lobby of Object.values(this.state.lobbies)) {
        lobby.lobbyCode = lobby.lobbyCode ? normalizeLobbyCode(lobby.lobbyCode) : createLobbyCode(this.state);
        lobby.tableSettings = normalizeTableSettings(lobby.tableSettings ?? { maxPlayers: lobby.maxPlayers });
        lobby.maxPlayers = lobby.tableSettings.maxPlayers;
        lobby.players = lobby.players.map((player) => ({
          ...player,
          connectionStatus: player.connectionStatus ?? (player.isAi ? "ai_takeover" : "connected"),
        }));
      }
    } catch {
      // Ignore legacy record normalization failures.
    }

    return this.state;
  }

  private getMutableLobby(state: PazaakLobbyFileShape, lobbyId: string): PazaakLobbyRecord {
    const lobby = state.lobbies[lobbyId];

    if (!lobby || (lobby.status !== "waiting" && lobby.status !== "matchmaking")) {
      throw new Error("That lobby is not available.");
    }

    return lobby;
  }

  private assertLobbyPassword(lobby: PazaakLobbyRecord, password?: string | undefined): void {
    if (lobby.passwordHash && hashLobbyPassword(password ?? "") !== lobby.passwordHash) {
      throw new Error("Incorrect lobby password.");
    }
  }

  private async persist(state: PazaakLobbyFileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export interface PazaakMatchHistoryRecord {
  matchId: string;
  channelId: string;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
  wager: number;
  completedAt: string;
  summary: string;
}

export interface TraskSourceRecord {
  id: string;
  name: string;
  url: string;
}

/** Append-only timeline for Holocron / clients polling `GET /thread/:id`. */
export interface TraskQueryLiveEvent {
  at: string;
  phase: string;
  detail?: string;
  sources?: readonly TraskSourceRecord[];
}

export interface TraskQueryRecord {
  queryId: string;
  /** Conversation/thread id (UUID); shareable via Holocron ?thread= */
  threadId?: string;
  userId: string;
  query: string;
  status: "pending" | "complete" | "failed";
  answer: string | null;
  sources: readonly TraskSourceRecord[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Server-written progression while status is pending (and frozen at completion). */
  liveTrace?: readonly TraskQueryLiveEvent[];
}

interface PazaakMatchHistoryFileShape {
  version: 1;
  matches: Record<string, PazaakMatchHistoryRecord>;
}

interface TraskQueryFileShape {
  version: 1;
  queries: Record<string, TraskQueryRecord>;
}

const cloneHistoryRecord = (record: PazaakMatchHistoryRecord): PazaakMatchHistoryRecord => ({ ...record });
const cloneTraskSource = (source: TraskSourceRecord): TraskSourceRecord => ({ ...source });
const cloneTraskLiveEvent = (ev: TraskQueryLiveEvent): TraskQueryLiveEvent => ({
  ...ev,
  ...(ev.sources ? { sources: ev.sources.map(cloneTraskSource) } : {}),
});

const cloneTraskQueryRecord = (record: TraskQueryRecord): TraskQueryRecord => ({
  ...record,
  sources: record.sources.map(cloneTraskSource),
  ...(record.liveTrace ? { liveTrace: record.liveTrace.map(cloneTraskLiveEvent) } : {}),
});

export class JsonPazaakMatchHistoryRepository {
  private state?: PazaakMatchHistoryFileShape;

  public constructor(private readonly filePath: string) {}

  public async append(record: PazaakMatchHistoryRecord): Promise<PazaakMatchHistoryRecord> {
    const state = await this.ensureState();
    state.matches[record.matchId] = { ...record };
    await this.persist(state);
    return cloneHistoryRecord(record);
  }

  public async listForUser(userId: string, limit = 25): Promise<readonly PazaakMatchHistoryRecord[]> {
    const state = await this.ensureState();
    return Object.values(state.matches)
      .filter((match) => match.winnerId === userId || match.loserId === userId)
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map(cloneHistoryRecord);
  }

  private async ensureState(): Promise<PazaakMatchHistoryFileShape> {
    if (this.state) return this.state;
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw) as PazaakMatchHistoryFileShape;
    } catch {
      this.state = { version: 1, matches: {} };
      await this.persist(this.state);
    }

    return this.state;
  }

  private async persist(state: PazaakMatchHistoryFileShape): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }
}

export class JsonTraskQueryRepository {
  private state: TraskQueryFileShape | undefined;

  public constructor(private readonly filePath: string) {}

  public async append(record: TraskQueryRecord): Promise<TraskQueryRecord> {
    return this.upsert(record);
  }

  /** Insert or replace by `queryId` (used for pending → live updates → final). */
  public async upsert(record: TraskQueryRecord): Promise<TraskQueryRecord> {
    this.state = undefined;
    const state = await this.ensureState();
    const cloned = cloneTraskQueryRecord(record);
    state.queries[record.queryId] = cloned;
    await this.persist(state);
    this.state = undefined;
    return cloneTraskQueryRecord(cloned);
  }

  public async listForUser(userId: string, limit = 25, threadId?: string): Promise<readonly TraskQueryRecord[]> {
    this.state = undefined;
    const state = await this.ensureState();
    return Object.values(state.queries)
      .filter((record) => record.userId === userId)
      .filter((record) => !threadId || record.threadId === threadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map(cloneTraskQueryRecord);
  }

  public async listForThread(threadId: string): Promise<readonly TraskQueryRecord[]> {
    this.state = undefined;
    const state = await this.ensureState();
    return Object.values(state.queries)
      .filter((record) => record.threadId === threadId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneTraskQueryRecord);
  }

  public async getByQueryId(queryId: string): Promise<TraskQueryRecord | undefined> {
    this.state = undefined;
    const state = await this.ensureState();
    const row = state.queries[queryId];
    return row ? cloneTraskQueryRecord(row) : undefined;
  }

  private async ensureState(): Promise<TraskQueryFileShape> {
    if (this.state) return this.state;
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw) as TraskQueryFileShape;
    } catch {
      this.state = { version: 1, queries: {} };
      await this.persist(this.state);
    }

    return this.state;
  }

  private async persist(state: TraskQueryFileShape): Promise<void> {
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export class JsonPazaakLeaderboardRepository {
  public constructor(private readonly walletRepository: JsonWalletRepository) {}

  public async list(limit = 25): Promise<readonly WalletRecord[]> {
    const wallets = await this.walletRepository.listWallets();
    return [...wallets]
      .sort((left, right) => right.mmr - left.mmr || right.gamesWon - left.gamesWon || right.wins - left.wins)
      .slice(0, Math.max(1, Math.min(100, limit)));
  }
}

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  deepMergePolicy,
  loadPazaakOpsPolicy,
  type PazaakOpsPolicy,
} from "@openkotor/pazaak-policy";

export type { PazaakOpsPolicy } from "@openkotor/pazaak-policy";
import { loadPolicyFromFile } from "@openkotor/pazaak-policy/file-loader";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

function findDotEnv(): string | undefined {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const dotEnvPath = findDotEnv();

if (dotEnvPath) {
  loadDotEnv({ path: dotEnvPath });
} else {
  loadDotEnv();
}

const defaultChatModel = "gpt-5.4-mini";
const defaultEmbeddingModel = "text-embedding-3-large";
const defaultPazaakWorldUrl = "https://openkotor.github.io/bots/pazaakworld";

const integerish = z.coerce.number().int().nonnegative();

const readRequiredEnv = (name: string, env: NodeJS.ProcessEnv = process.env): string => {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
};

const readOptionalEnv = (name: string, env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const value = env[name]?.trim();
  return value ? value : undefined;
};

const readBooleanEnv = (name: string, env: NodeJS.ProcessEnv = process.env): boolean | undefined => {
  const value = readOptionalEnv(name, env);
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  throw new Error(`Invalid boolean value for environment variable ${name}: ${value}`);
};

const readListEnv = (name: string, env: NodeJS.ProcessEnv = process.env): string[] => {
  const value = readOptionalEnv(name, env);

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export interface DiscordRuntimeConfig {
  appId: string;
  clientSecret: string | undefined;
  publicKey: string;
  botToken: string;
  guildId: string | undefined;
}

export interface SharedAiConfig {
  /** OpenAI key, or OpenRouter key when using an OpenAI-compatible base URL. */
  openAiApiKey: string | undefined;
  /** When set, the OpenAI SDK talks to this host (e.g. `https://openrouter.ai/api/v1`). */
  openAiBaseUrl: string | undefined;
  /** Extra headers for providers like OpenRouter (`HTTP-Referer`, `X-Title`). */
  openAiDefaultHeaders: Record<string, string> | undefined;
  firecrawlApiKey: string | undefined;
  chatModel: string;
  /** Tried in order after `chatModel` when rewrite completions fail. */
  chatModelFallbacks: readonly string[];
  embeddingModel: string;
  databaseUrl: string | undefined;
}

export interface ResearchWizardRuntimeConfig {
  /** Absolute path to vendored `ai-researchwizard` (folder containing `gpt_researcher/`). */
  gptResearcherRoot: string | undefined;
  /** Python interpreter for `trask_headless_research.py` (default `python`). */
  pythonExecutable: string;
  /** Optional absolute path to the headless runner; default `<gptResearcherRoot>/trask_headless_research.py`. */
  headlessScriptPath: string | undefined;
  timeoutMs: number;
}

const hasGptResearcherPackage = (rootDir: string): boolean =>
  existsSync(join(rootDir, "gpt_researcher"));

/**
 * Walks upward from `startDir` looking for `vendor/ai-researchwizard` with a `gpt_researcher/` tree.
 * Covers `pnpm --filter … dev` where cwd is `apps/trask-http-server` instead of the monorepo root.
 */
const findVendorAiResearchwizard = (startDir: string, maxHops = 24): string | undefined => {
  let dir = resolve(startDir);
  for (let hop = 0; hop < maxHops; hop++) {
    const candidate = join(dir, "vendor", "ai-researchwizard");
    if (hasGptResearcherPackage(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
  return undefined;
};

const resolveGptResearcherRoot = (env: NodeJS.ProcessEnv): string | undefined => {
  const explicit = readOptionalEnv("TRASK_GPT_RESEARCHER_ROOT", env);

  if (explicit) {
    return resolve(explicit.trim());
  }

  const fromCwd = findVendorAiResearchwizard(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }

  const configModuleDir = dirname(fileURLToPath(import.meta.url));
  const fromPackage = findVendorAiResearchwizard(configModuleDir);
  if (fromPackage) {
    return fromPackage;
  }

  return undefined;
};

export const loadResearchWizardRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): ResearchWizardRuntimeConfig => {
  const scriptRaw = readOptionalEnv("TRASK_GPT_RESEARCHER_SCRIPT", env);

  return {
    gptResearcherRoot: resolveGptResearcherRoot(env),
    pythonExecutable: readOptionalEnv("TRASK_GPT_RESEARCHER_PYTHON", env)?.trim() ?? "python",
    headlessScriptPath: scriptRaw ? resolve(scriptRaw.trim()) : undefined,
    timeoutMs: integerish.parse(readOptionalEnv("TRASK_RESEARCHWIZARD_TIMEOUT_MS", env) ?? "120000"),
  };
};

export interface TraskProactiveConfig {
  /** When true, reads channel messages (privileged intents) and may reply without `/ask`. */
  enabled: boolean;
  /**
   * Channel IDs where proactive replies are allowed. When empty, falls back to `approvedChannelIds`.
   * Proactive mode requires at least one channel after resolution (otherwise it stays off).
   */
  channelIds: string[];
  debounceMs: number;
  userCooldownMs: number;
  /** Skip auto-reply if another user's message after the trigger reaches at least this length. */
  competingReplyMinLength: number;
  classifierModel: string;
  classifierMinConfidence: number;
  /** Minimum cosine similarity between embeddings of (question|answer) vs research report. */
  similarityThreshold: number;
  minMessageLength: number;
  maxMessageLength: number;
  maxReplyChars: number;
}

export interface TraskBotConfig {
  discord: DiscordRuntimeConfig;
  ai: SharedAiConfig;
  researchWizard: ResearchWizardRuntimeConfig;
  allowedGuildIds: string[];
  approvedChannelIds: string[];
  /** Guild IDs where slash commands are registered (comma list in `TRASK_SLASH_GUILD_IDS`). */
  slashCommandGuildIds: string[];
  chunkDir: string;
  /** Directory for `trask-queries.json` (shared with Holocron when using the embedded web UI). */
  queryDataDir: string;
  /**
   * When set, serves `vendor/qa-webui/dist` and `/api/trask/*` on this port (same process as the bot).
   * Use Discord OAuth + `TRASK_SESSION_SECRET` so browser sessions map to Discord user ids.
   */
  webPort: number | undefined;
  webSessionSecret: string | undefined;
  /** Full callback URL registered in the Discord app (e.g. `http://127.0.0.1:8787/api/trask/auth/discord/callback`). */
  webOAuthRedirectUri: string | undefined;
  webApiKey: string | undefined;
  webAllowAnonymous: boolean;
  webDefaultUserId: string;
  /**
   * Public Holocron base URL for Discord embed links (e.g. `https://holocron.example.com` or GitHub Pages origin).
   * Each `/ask` reply appends `?thread=<uuid>`.
   */
  holocronPublicUrl: string | undefined;
  proactive: TraskProactiveConfig;
}

export interface HkBotConfig {
  discord: DiscordRuntimeConfig;
  dataDir: string;
}

export interface PazaakBotConfig {
  discord: DiscordRuntimeConfig;
  dataDir: string;
  startingCredits: number;
  dailyBonusCredits: number;
  dailyCooldownMs: number;
  turnTimeoutMs: number;
  /** Port for the embedded HTTP/WS API used by Activities and the browser UI. */
  apiPort: number;
  /** Public URL where the pazaak-world frontend is hosted (for the "Launch Activity" button link). */
  activityUrl: string;
  /** Public standalone website URL for CORS and OAuth redirect flows. */
  publicWebOrigin: string | undefined;
  /** Per-turn decision window for cross-platform clients. */
  turnTimerSeconds: number;
  /** Grace period before disconnected participants forfeit. */
  disconnectForfeitMs: number;
  /** Matchmaking queue scan cadence. */
  matchmakingTickMs: number;
  /** Enables local synthetic Bearer tokens (dev-user-*) for browser-only testing. */
  allowDevAuth: boolean;
  /** Unified YAML/JSON/env ops policy (`PAZAAK_POLICY_PATH`, `PAZAAK_POLICY_JSON`, `PAZAAK_POLICY__*` ). */
  opsPolicy: PazaakOpsPolicy;
}

/** Resolve ops policy for Node services (declarative file + env layers + legacy `PAZAAK_*` timers when set). */
export const loadPazaakOpsPolicyForNode = (env: NodeJS.ProcessEnv = process.env): PazaakOpsPolicy => {
  const path = readOptionalEnv("PAZAAK_POLICY_PATH", env)?.trim();
  const base = path && existsSync(path) ? loadPolicyFromFile(path) : undefined;
  let policy = loadPazaakOpsPolicy(env, base ? { basePolicy: base } : {});

  const legacyTimers: Record<string, number> = {};
  const tt = readOptionalEnv("PAZAAK_TURN_TIMER_SECONDS", env);
  if (tt) legacyTimers.turnTimerSeconds = integerish.parse(tt);
  const tm = readOptionalEnv("PAZAAK_TURN_TIMEOUT_MS", env);
  if (tm) legacyTimers.turnTimeoutMs = integerish.parse(tm);
  const df = readOptionalEnv("PAZAAK_DISCONNECT_FORFEIT_MS", env);
  if (df) legacyTimers.disconnectForfeitMs = integerish.parse(df);
  if (Object.keys(legacyTimers).length > 0) {
    policy = deepMergePolicy(policy, { timers: legacyTimers });
  }
  const mt = readOptionalEnv("PAZAAK_MATCHMAKING_TICK_MS", env);
  if (mt) {
    policy = deepMergePolicy(policy, { matchmaking: { tickMs: integerish.parse(mt) } });
  }
  return policy;
};

export interface IngestWorkerConfig {
  ai: SharedAiConfig;
  stateDir: string;
}

export const loadDiscordRuntimeConfig = (
  prefix: string,
  env: NodeJS.ProcessEnv = process.env,
): DiscordRuntimeConfig => {
  return {
    appId: readRequiredEnv(`${prefix}_DISCORD_APP_ID`, env),
    clientSecret: readOptionalEnv(`${prefix}_DISCORD_CLIENT_SECRET`, env),
    publicKey: readRequiredEnv(`${prefix}_DISCORD_PUBLIC_KEY`, env),
    botToken: readRequiredEnv(`${prefix}_DISCORD_BOT_TOKEN`, env),
    guildId: readOptionalEnv(`${prefix}_DISCORD_GUILD_ID`, env) ?? readOptionalEnv("DISCORD_TARGET_GUILD_ID", env),
  };
};

const buildOpenAiProviderHeaders = (env: NodeJS.ProcessEnv): Record<string, string> | undefined => {
  const referer = readOptionalEnv("OPENROUTER_HTTP_REFERER", env);
  const title = readOptionalEnv("OPENROUTER_APP_TITLE", env);
  const headers: Record<string, string> = {};
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;
  return Object.keys(headers).length > 0 ? headers : undefined;
};

export const loadSharedAiConfig = (env: NodeJS.ProcessEnv = process.env): SharedAiConfig => {
  const openAiKey = readOptionalEnv("OPENAI_API_KEY", env) ?? readOptionalEnv("OPENROUTER_API_KEY", env);
  return {
    openAiApiKey: openAiKey,
    openAiBaseUrl: readOptionalEnv("OPENAI_BASE_URL", env),
    openAiDefaultHeaders: buildOpenAiProviderHeaders(env),
    firecrawlApiKey: readOptionalEnv("FIRECRAWL_API_KEY", env),
    chatModel: readOptionalEnv("OPENAI_CHAT_MODEL", env) ?? defaultChatModel,
    chatModelFallbacks: readListEnv("TRASK_REWRITE_MODEL_FALLBACKS", env),
    embeddingModel: readOptionalEnv("OPENAI_EMBEDDING_MODEL", env) ?? defaultEmbeddingModel,
    databaseUrl: readOptionalEnv("DATABASE_URL", env),
  };
};

export const loadTraskBotConfig = (env: NodeJS.ProcessEnv = process.env): TraskBotConfig => {
  const proactiveChannelIds = readListEnv("TRASK_PROACTIVE_CHANNEL_IDS", env);
  const approvedChannelIds = readListEnv("TRASK_APPROVED_CHANNEL_IDS", env);

  return {
    discord: loadDiscordRuntimeConfig("TRASK", env),
    ai: loadSharedAiConfig(env),
    researchWizard: loadResearchWizardRuntimeConfig(env),
    allowedGuildIds: readListEnv("TRASK_ALLOWED_GUILD_IDS", env),
    approvedChannelIds,
    slashCommandGuildIds: readListEnv("TRASK_SLASH_GUILD_IDS", env),
    chunkDir: readOptionalEnv("INGEST_STATE_DIR", env) ?? "data/ingest-worker",
    queryDataDir: readOptionalEnv("TRASK_QUERY_DATA_DIR", env) ?? "data/trask-bot",
    webPort: readOptionalEnv("TRASK_WEB_PORT", env)
      ? integerish.parse(readOptionalEnv("TRASK_WEB_PORT", env)!)
      : undefined,
    webSessionSecret: readOptionalEnv("TRASK_SESSION_SECRET", env),
    webOAuthRedirectUri: readOptionalEnv("TRASK_WEB_OAUTH_REDIRECT_URI", env),
    webApiKey: readOptionalEnv("TRASK_WEB_API_KEY", env),
    webAllowAnonymous: readBooleanEnv("TRASK_WEB_ALLOW_ANONYMOUS", env) ?? false,
    webDefaultUserId: readOptionalEnv("TRASK_WEB_DEFAULT_USER_ID", env) ?? "qa-webui",
    holocronPublicUrl: readOptionalEnv("TRASK_HOLOCRON_PUBLIC_URL", env),
    proactive: {
      enabled: readBooleanEnv("TRASK_PROACTIVE_ENABLED", env) ?? false,
      channelIds: proactiveChannelIds,
      debounceMs: integerish.parse(readOptionalEnv("TRASK_PROACTIVE_DEBOUNCE_MS", env) ?? "25000"),
      userCooldownMs: integerish.parse(readOptionalEnv("TRASK_PROACTIVE_USER_COOLDOWN_MS", env) ?? "120000"),
      competingReplyMinLength: integerish.parse(readOptionalEnv("TRASK_PROACTIVE_COMPETING_MIN_LENGTH", env) ?? "80"),
      classifierModel: readOptionalEnv("TRASK_PROACTIVE_CLASSIFIER_MODEL", env) ?? "gpt-4o-mini",
      classifierMinConfidence: z.coerce.number().min(0).max(1).parse(readOptionalEnv("TRASK_PROACTIVE_CLASSIFIER_MIN_CONFIDENCE", env) ?? "0.55"),
      similarityThreshold: z.coerce.number().min(0).max(1).parse(readOptionalEnv("TRASK_PROACTIVE_SIMILARITY_THRESHOLD", env) ?? "0.62"),
      minMessageLength: integerish.parse(readOptionalEnv("TRASK_PROACTIVE_MIN_MESSAGE_LENGTH", env) ?? "12"),
      maxMessageLength: integerish.parse(readOptionalEnv("TRASK_PROACTIVE_MAX_MESSAGE_LENGTH", env) ?? "400"),
      maxReplyChars: integerish.parse(readOptionalEnv("TRASK_PROACTIVE_MAX_REPLY_CHARS", env) ?? "650"),
    },
  };
};

export const loadHkBotConfig = (env: NodeJS.ProcessEnv = process.env): HkBotConfig => {
  return {
    discord: loadDiscordRuntimeConfig("HK", env),
    dataDir: readOptionalEnv("HK_DATA_DIR", env) ?? "data/hk-bot",
  };
};

export const loadPazaakBotConfig = (env: NodeJS.ProcessEnv = process.env): PazaakBotConfig => {
  const opsPolicy = loadPazaakOpsPolicyForNode(env);
  return {
    discord: loadDiscordRuntimeConfig("PAZAAK", env),
    dataDir: readOptionalEnv("PAZAAK_DATA_DIR", env) ?? "data/pazaak-bot",
    startingCredits: integerish.parse(readOptionalEnv("PAZAAK_STARTING_CREDITS", env) ?? "1000"),
    dailyBonusCredits: integerish.parse(readOptionalEnv("PAZAAK_DAILY_BONUS", env) ?? "200"),
    dailyCooldownMs: integerish.parse(readOptionalEnv("PAZAAK_DAILY_COOLDOWN_MS", env) ?? "86400000"),
    turnTimeoutMs: opsPolicy.timers.turnTimeoutMs,
    apiPort: integerish.parse(readOptionalEnv("PAZAAK_API_PORT", env) ?? "4001"),
    activityUrl: readOptionalEnv("PAZAAK_ACTIVITY_URL", env) ?? defaultPazaakWorldUrl,
    publicWebOrigin: readOptionalEnv("PAZAAK_PUBLIC_WEB_ORIGIN", env) ?? defaultPazaakWorldUrl,
    turnTimerSeconds: opsPolicy.timers.turnTimerSeconds,
    disconnectForfeitMs: opsPolicy.timers.disconnectForfeitMs,
    matchmakingTickMs: opsPolicy.matchmaking.tickMs,
    allowDevAuth: readBooleanEnv("PAZAAK_ALLOW_DEV_AUTH", env) ?? false,
    opsPolicy,
  };
};

export const loadIngestWorkerConfig = (env: NodeJS.ProcessEnv = process.env): IngestWorkerConfig => {
  return {
    ai: loadSharedAiConfig(env),
    stateDir: readOptionalEnv("INGEST_STATE_DIR", env) ?? "data/ingest-worker",
  };
};

export interface TraskHttpServerConfig {
  port: number;
  researchWizard: ResearchWizardRuntimeConfig;
  ai: SharedAiConfig;
  dataDir: string;
  /** When set, require `Authorization: Bearer <key>` or `X-Trask-Api-Key`. */
  webApiKey: string | undefined;
  /** When true and no API key is configured, accept unauthenticated requests scoped to `webDefaultUserId`. */
  webAllowAnonymous: boolean;
  /** User id bucket for anonymous or API-key sessions in `JsonTraskQueryRepository`. */
  webDefaultUserId: string;
  chunkDir: string;
  /** Browser origin for CORS (e.g. qa-webui dev server). */
  publicWebOrigin: string | undefined;
}

export const loadTraskHttpServerConfig = (env: NodeJS.ProcessEnv = process.env): TraskHttpServerConfig => {
  return {
    port: integerish.parse(readOptionalEnv("TRASK_HTTP_PORT", env) ?? "4010"),
    researchWizard: loadResearchWizardRuntimeConfig(env),
    ai: loadSharedAiConfig(env),
    dataDir: readOptionalEnv("TRASK_HTTP_DATA_DIR", env) ?? "data/trask-http-server",
    webApiKey: readOptionalEnv("TRASK_WEB_API_KEY", env),
    webAllowAnonymous: readBooleanEnv("TRASK_WEB_ALLOW_ANONYMOUS", env) ?? false,
    webDefaultUserId: readOptionalEnv("TRASK_WEB_DEFAULT_USER_ID", env) ?? "qa-webui",
    chunkDir: readOptionalEnv("INGEST_STATE_DIR", env) ?? "data/ingest-worker",
    publicWebOrigin: readOptionalEnv("TRASK_PUBLIC_WEB_ORIGIN", env),
  };
};
export {
  buildSocialAuthAuthorizeUrl,
  createObjectEnvLookup,
  DEFAULT_SOCIAL_AUTH_PROVIDER_ENV_MAP,
  fetchDiscordSocialAuthProfile,
  fetchGithubSocialAuthProfile,
  fetchGoogleSocialAuthProfile,
  listSocialAuthProviderConfigs,
  listSocialAuthProviders,
  PAZAAK_SOCIAL_AUTH_PROVIDER_ENV_MAP,
  resolveSocialAuthProviderConfig,
  SOCIAL_AUTH_PROVIDERS,
  type BuildSocialAuthAuthorizeUrlOptions,
  type EnvLookup,
  type FetchDiscordSocialAuthProfileOptions,
  type FetchGithubSocialAuthProfileOptions,
  type ResolveSocialAuthProviderConfigOptions,
  type SocialAuthAuthorizeUrlInput,
  type SocialAuthCodeExchangeConfig,
  type SocialAuthProfile,
  type SocialAuthProvider,
  type SocialAuthProviderConfig,
  type SocialAuthProviderEnvKeys,
  type SocialAuthProviderEnvMap,
  type SocialAuthProviderStatus,
} from "./oauth.js";
export {
  buildBrowserCorsAllowedOrigins,
  buildLocalWebOrigins,
  DEFAULT_LOCAL_WEB_PORTS,
  resolveCorsHeaders,
  type BuildBrowserCorsAllowedOriginsOptions,
  type CorsRequestLike,
  type CorsResolution,
  type CorsResolutionOptions,
} from "./cors.js";
export {
  CARD_GAME_TYPES,
  isCardGameType,
  normalizeCardGameType,
  type CardGameType,
  type CardWorldConfig,
  type UntrustedCardGameTypeInput,
} from "./game-mode.js";
export {
  createNodeApiHost,
  type NodeApiHost,
  type NodeApiHostOptions,
} from "./node-http.js";
export { extractBearerToken, requireBearerToken } from "./bearer-tokens.js";

export const DISCORD_API_V10 = "https://discord.com/api/v10";

export const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/u, "");

export const normalizeOrigin = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimTrailingSlashes(trimmed);
  }
};

export const isLocalhostUrl = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    const lowered = value.toLowerCase();
    return lowered.includes("localhost") || lowered.includes("127.0.0.1");
  }
};

export const nowIso = (): string => new Date().toISOString();

export const plusDaysIso = (days: number): string => new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();

export const isWebSocketUpgradeHeader = (value: string | null | undefined): boolean => value?.toLowerCase() === "websocket";
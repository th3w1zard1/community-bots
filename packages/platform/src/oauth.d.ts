export type SocialAuthProvider = "google" | "discord" | "github";
export declare const SOCIAL_AUTH_PROVIDERS: readonly ["google", "discord", "github"];
export interface SocialAuthProviderEnvKeys {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    startUrl: string;
}
export type SocialAuthProviderEnvMap = Record<SocialAuthProvider, SocialAuthProviderEnvKeys>;
export interface SocialAuthProviderConfig {
    provider: SocialAuthProvider;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    startUrl: string;
    enabled: boolean;
}
export interface SocialAuthProviderStatus {
    provider: SocialAuthProvider;
    enabled: boolean;
}
export interface SocialAuthCodeExchangeConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
export interface SocialAuthProfile {
    providerUserId: string;
    username: string;
    displayName: string;
    email: string | null;
}
export interface FetchDiscordSocialAuthProfileOptions {
    discordApiBase?: string;
    resolveDisplayName?: (profile: {
        username: string;
        global_name: string | null;
    }) => string;
}
export interface FetchGithubSocialAuthProfileOptions {
    userAgent?: string;
}
export interface BuildSocialAuthAuthorizeUrlOptions {
    discordApiBase?: string;
    googlePrompt?: string;
    discordPrompt?: string;
}
export interface SocialAuthAuthorizeUrlInput {
    clientId: string;
    redirectUri: string;
    state: string;
    startUrl?: string;
}
export type EnvLookup = (key: string) => string | undefined;
export interface ResolveSocialAuthProviderConfigOptions {
    envMap?: SocialAuthProviderEnvMap;
    fallbackEnvKeys?: Partial<Record<SocialAuthProvider, Partial<SocialAuthProviderEnvKeys>>>;
}
export declare const DEFAULT_SOCIAL_AUTH_PROVIDER_ENV_MAP: {
    readonly google: {
        readonly clientId: "GOOGLE_CLIENT_ID";
        readonly clientSecret: "GOOGLE_CLIENT_SECRET";
        readonly callbackUrl: "GOOGLE_REDIRECT_URI";
        readonly startUrl: "GOOGLE_URL";
    };
    readonly discord: {
        readonly clientId: "DISCORD_CLIENT_ID";
        readonly clientSecret: "DISCORD_CLIENT_SECRET";
        readonly callbackUrl: "DISCORD_REDIRECT_URI";
        readonly startUrl: "DISCORD_URL";
    };
    readonly github: {
        readonly clientId: "GITHUB_CLIENT_ID";
        readonly clientSecret: "GITHUB_CLIENT_SECRET";
        readonly callbackUrl: "GITHUB_REDIRECT_URI";
        readonly startUrl: "GITHUB_URL";
    };
};
export declare const PAZAAK_SOCIAL_AUTH_PROVIDER_ENV_MAP: {
    readonly google: {
        readonly clientId: "PAZAAK_OAUTH_GOOGLE_CLIENT_ID";
        readonly clientSecret: "PAZAAK_OAUTH_GOOGLE_CLIENT_SECRET";
        readonly callbackUrl: "PAZAAK_OAUTH_GOOGLE_CALLBACK_URL";
        readonly startUrl: "PAZAAK_OAUTH_GOOGLE_URL";
    };
    readonly discord: {
        readonly clientId: "PAZAAK_OAUTH_DISCORD_CLIENT_ID";
        readonly clientSecret: "PAZAAK_OAUTH_DISCORD_CLIENT_SECRET";
        readonly callbackUrl: "PAZAAK_OAUTH_DISCORD_CALLBACK_URL";
        readonly startUrl: "PAZAAK_OAUTH_DISCORD_URL";
    };
    readonly github: {
        readonly clientId: "PAZAAK_OAUTH_GITHUB_CLIENT_ID";
        readonly clientSecret: "PAZAAK_OAUTH_GITHUB_CLIENT_SECRET";
        readonly callbackUrl: "PAZAAK_OAUTH_GITHUB_CALLBACK_URL";
        readonly startUrl: "PAZAAK_OAUTH_GITHUB_URL";
    };
};
export declare const createObjectEnvLookup: (source: object) => EnvLookup;
export declare const resolveSocialAuthProviderConfig: (provider: SocialAuthProvider, lookup: EnvLookup, options?: ResolveSocialAuthProviderConfigOptions) => SocialAuthProviderConfig;
export declare const listSocialAuthProviderConfigs: (lookup: EnvLookup, options?: ResolveSocialAuthProviderConfigOptions) => SocialAuthProviderConfig[];
export declare const listSocialAuthProviders: (lookup: EnvLookup, options?: ResolveSocialAuthProviderConfigOptions) => SocialAuthProviderStatus[];
export declare const fetchGoogleSocialAuthProfile: (code: string, config: SocialAuthCodeExchangeConfig) => Promise<SocialAuthProfile>;
export declare const fetchDiscordSocialAuthProfile: (code: string, config: SocialAuthCodeExchangeConfig, options?: FetchDiscordSocialAuthProfileOptions) => Promise<SocialAuthProfile>;
export declare const fetchGithubSocialAuthProfile: (code: string, config: SocialAuthCodeExchangeConfig, options?: FetchGithubSocialAuthProfileOptions) => Promise<SocialAuthProfile>;
export declare const buildSocialAuthAuthorizeUrl: (provider: SocialAuthProvider, input: SocialAuthAuthorizeUrlInput, options?: BuildSocialAuthAuthorizeUrlOptions) => string;

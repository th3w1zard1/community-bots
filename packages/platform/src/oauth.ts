export type SocialAuthProvider = "google" | "discord" | "github";

export const SOCIAL_AUTH_PROVIDERS = ["google", "discord", "github"] as const satisfies readonly SocialAuthProvider[];

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
  resolveDisplayName?: (profile: { username: string; global_name: string | null }) => string;
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

export const DEFAULT_SOCIAL_AUTH_PROVIDER_ENV_MAP = {
  google: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
    callbackUrl: "GOOGLE_REDIRECT_URI",
    startUrl: "GOOGLE_URL",
  },
  discord: {
    clientId: "DISCORD_CLIENT_ID",
    clientSecret: "DISCORD_CLIENT_SECRET",
    callbackUrl: "DISCORD_REDIRECT_URI",
    startUrl: "DISCORD_URL",
  },
  github: {
    clientId: "GITHUB_CLIENT_ID",
    clientSecret: "GITHUB_CLIENT_SECRET",
    callbackUrl: "GITHUB_REDIRECT_URI",
    startUrl: "GITHUB_URL",
  },
} as const satisfies SocialAuthProviderEnvMap;

export const PAZAAK_SOCIAL_AUTH_PROVIDER_ENV_MAP = {
  google: {
    clientId: "PAZAAK_OAUTH_GOOGLE_CLIENT_ID",
    clientSecret: "PAZAAK_OAUTH_GOOGLE_CLIENT_SECRET",
    callbackUrl: "PAZAAK_OAUTH_GOOGLE_CALLBACK_URL",
    startUrl: "PAZAAK_OAUTH_GOOGLE_URL",
  },
  discord: {
    clientId: "PAZAAK_OAUTH_DISCORD_CLIENT_ID",
    clientSecret: "PAZAAK_OAUTH_DISCORD_CLIENT_SECRET",
    callbackUrl: "PAZAAK_OAUTH_DISCORD_CALLBACK_URL",
    startUrl: "PAZAAK_OAUTH_DISCORD_URL",
  },
  github: {
    clientId: "PAZAAK_OAUTH_GITHUB_CLIENT_ID",
    clientSecret: "PAZAAK_OAUTH_GITHUB_CLIENT_SECRET",
    callbackUrl: "PAZAAK_OAUTH_GITHUB_CALLBACK_URL",
    startUrl: "PAZAAK_OAUTH_GITHUB_URL",
  },
} as const satisfies SocialAuthProviderEnvMap;

const readTrimmed = (lookup: EnvLookup, key: string | undefined): string => {
  if (!key) {
    return "";
  }

  return lookup(key)?.trim() ?? "";
};

export const createObjectEnvLookup = (source: object): EnvLookup => {
  return (key) => {
    const value = (source as Record<string, string | number | boolean | null | object | undefined>)[key];
    return typeof value === "string" ? value : undefined;
  };
};

export const resolveSocialAuthProviderConfig = (
  provider: SocialAuthProvider,
  lookup: EnvLookup,
  options: ResolveSocialAuthProviderConfigOptions = {},
): SocialAuthProviderConfig => {
  const envMap = options.envMap ?? DEFAULT_SOCIAL_AUTH_PROVIDER_ENV_MAP;
  const envKeys = envMap[provider];
  const fallbackKeys = options.fallbackEnvKeys?.[provider];

  const clientId = readTrimmed(lookup, envKeys.clientId) || readTrimmed(lookup, fallbackKeys?.clientId);
  const clientSecret = readTrimmed(lookup, envKeys.clientSecret) || readTrimmed(lookup, fallbackKeys?.clientSecret);
  const callbackUrl = readTrimmed(lookup, envKeys.callbackUrl) || readTrimmed(lookup, fallbackKeys?.callbackUrl);
  const startUrl = readTrimmed(lookup, envKeys.startUrl) || readTrimmed(lookup, fallbackKeys?.startUrl);

  return {
    provider,
    clientId,
    clientSecret,
    callbackUrl,
    startUrl,
    enabled: Boolean(clientId && clientSecret),
  };
};

export const listSocialAuthProviderConfigs = (
  lookup: EnvLookup,
  options: ResolveSocialAuthProviderConfigOptions = {},
): SocialAuthProviderConfig[] => {
  return SOCIAL_AUTH_PROVIDERS.map((provider) => resolveSocialAuthProviderConfig(provider, lookup, options));
};

export const listSocialAuthProviders = (
  lookup: EnvLookup,
  options: ResolveSocialAuthProviderConfigOptions = {},
): SocialAuthProviderStatus[] => {
  return listSocialAuthProviderConfigs(lookup, options).map(({ provider, enabled }) => ({ provider, enabled }));
};

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const body = await response.text();
  return body.trim() || fallback;
};

const expectAccessToken = (provider: string, value: { access_token?: string }, status = 401): string => {
  if (!value.access_token) {
    throw Object.assign(new Error(`${provider} token response did not include an access token.`), { status });
  }

  return value.access_token;
};

export const fetchGoogleSocialAuthProfile = async (
  code: string,
  config: SocialAuthCodeExchangeConfig,
): Promise<SocialAuthProfile> => {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const message = await readErrorMessage(tokenRes, "Google token exchange failed.");
    throw Object.assign(new Error(`Google token exchange failed: ${message}`), { status: 401 });
  }

  const accessToken = expectAccessToken("Google", await tokenRes.json() as { access_token?: string });
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    const message = await readErrorMessage(profileRes, "Google profile fetch failed.");
    throw Object.assign(new Error(`Google profile fetch failed: ${message}`), { status: 401 });
  }

  const profile = await profileRes.json() as {
    sub?: string;
    email?: string;
    name?: string;
    given_name?: string;
  };

  if (!profile.sub) {
    throw Object.assign(new Error("Google profile response did not include a user id."), { status: 401 });
  }

  return {
    providerUserId: profile.sub,
    username: profile.email?.split("@")[0] || profile.name || "google-user",
    displayName: profile.name || profile.given_name || profile.email || "Google User",
    email: profile.email?.trim() || null,
  };
};

export const fetchDiscordSocialAuthProfile = async (
  code: string,
  config: SocialAuthCodeExchangeConfig,
  options: FetchDiscordSocialAuthProfileOptions = {},
): Promise<SocialAuthProfile> => {
  const discordApiBase = options.discordApiBase ?? "https://discord.com/api/v10";
  const resolveDisplayName = options.resolveDisplayName ?? ((profile: { username: string; global_name: string | null }) => profile.global_name?.trim() || profile.username);
  const tokenRes = await fetch(`${discordApiBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const message = await readErrorMessage(tokenRes, "Discord token exchange failed.");
    throw Object.assign(new Error(`Discord token exchange failed: ${message}`), { status: 401 });
  }

  const accessToken = expectAccessToken("Discord", await tokenRes.json() as { access_token?: string });
  const profileRes = await fetch(`${discordApiBase}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    const message = await readErrorMessage(profileRes, "Discord profile fetch failed.");
    throw Object.assign(new Error(`Discord profile fetch failed: ${message}`), { status: 401 });
  }

  const profile = await profileRes.json() as {
    id?: string;
    username?: string;
    global_name?: string | null;
    email?: string | null;
  };

  if (!profile.id || !profile.username) {
    throw Object.assign(new Error("Discord profile response did not include a user id."), { status: 401 });
  }

  return {
    providerUserId: profile.id,
    username: profile.username,
    displayName: resolveDisplayName({ username: profile.username, global_name: profile.global_name ?? null }),
    email: profile.email?.trim() || null,
  };
};

export const fetchGithubSocialAuthProfile = async (
  code: string,
  config: SocialAuthCodeExchangeConfig,
  options: FetchGithubSocialAuthProfileOptions = {},
): Promise<SocialAuthProfile> => {
  const userAgent = options.userAgent ?? "openkotor-platform";
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const message = await readErrorMessage(tokenRes, "GitHub token exchange failed.");
    throw Object.assign(new Error(`GitHub token exchange failed: ${message}`), { status: 401 });
  }

  const accessToken = expectAccessToken("GitHub", await tokenRes.json() as { access_token?: string });
  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": userAgent,
    },
  });

  if (!profileRes.ok) {
    const message = await readErrorMessage(profileRes, "GitHub profile fetch failed.");
    throw Object.assign(new Error(`GitHub profile fetch failed: ${message}`), { status: 401 });
  }

  const profile = await profileRes.json() as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
  };

  if (profile.id === undefined || !profile.login) {
    throw Object.assign(new Error("GitHub profile response did not include a user id."), { status: 401 });
  }

  let email = profile.email?.trim() || null;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": userAgent,
      },
    });

    if (emailsRes.ok) {
      const emails = await emailsRes.json() as Array<{ email: string; primary?: boolean; verified?: boolean }>;
      email = emails.find((entry) => entry.primary && entry.verified)?.email
        ?? emails.find((entry) => entry.verified)?.email
        ?? emails[0]?.email
        ?? null;
    }
  }

  return {
    providerUserId: String(profile.id),
    username: profile.login,
    displayName: profile.name || profile.login,
    email,
  };
};

export const buildSocialAuthAuthorizeUrl = (
  provider: SocialAuthProvider,
  input: SocialAuthAuthorizeUrlInput,
  options: BuildSocialAuthAuthorizeUrlOptions = {},
): string => {
  if (input.startUrl) {
    return input.startUrl
      .replaceAll("{state}", encodeURIComponent(input.state))
      .replaceAll("{callback}", encodeURIComponent(input.redirectUri))
      .replaceAll("{clientId}", encodeURIComponent(input.clientId));
  }

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("access_type", "online");
    url.searchParams.set("state", input.state);
    if (options.googlePrompt) {
      url.searchParams.set("prompt", options.googlePrompt);
    }
    return url.toString();
  }

  if (provider === "discord") {
    const url = new URL(`${options.discordApiBase ?? "https://discord.com/api/v10"}/oauth2/authorize`);
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify email");
    url.searchParams.set("state", input.state);
    if (options.discordPrompt) {
      url.searchParams.set("prompt", options.discordPrompt);
    }
    return url.toString();
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", input.state);
  return url.toString();
};
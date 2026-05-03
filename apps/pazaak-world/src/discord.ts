import { DiscordSDK, RPCCloseCodes } from "@discord/embedded-app-sdk";

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;
let discordSdk: DiscordSDK | null = null;

export interface DiscordAuth {
  userId: string;
  username: string;
  accountId?: string;
  accessToken: string;
  instanceId?: string;
  guildId?: string;
  channelId?: string;
}

interface DiscordTokenResponse {
  access_token: string;
  app_token?: string;
  account?: {
    accountId: string;
    username: string;
    displayName: string;
    legacyGameUserId: string | null;
  };
}

/** Returns true when the app is running inside a Discord Activity iframe. */
export const isDiscordActivity = (): boolean => {
  return window.location.href.includes("discordsays.com");
};

const getDiscordSdk = (): DiscordSDK => {
  if (!discordSdk) {
    discordSdk = new DiscordSDK(CLIENT_ID);
  }
  return discordSdk;
};

const parseDevAuth = (): DiscordAuth | null => {
  const url = new URL(window.location.href);
  const devUser = url.searchParams.get("devUser")?.trim();
  if (!devUser) {
    return null;
  }

  const userId = decodeURIComponent(devUser);
  if (!userId) {
    return null;
  }

  const username = (url.searchParams.get("devName")?.trim() || userId).slice(0, 64);
  const accessToken = `dev-user-${encodeURIComponent(userId)}`;

  return {
    userId,
    username,
    accessToken,
    ...withDefinedActivityContext({
      instanceId: url.searchParams.get("devInstance")?.trim() || "dev-browser",
      guildId: url.searchParams.get("devGuild")?.trim() || undefined,
      channelId: url.searchParams.get("devChannel")?.trim() || undefined,
    }),
  };
};

const configuredApiBases = String(import.meta.env.VITE_API_BASES ?? "")
  .split(",")
  .map((value: string) => value.trim())
  .filter((value: string) => value.length > 0);

function buildHostedUrl(path: string, base: string): string {
  if (!base) return path;
  return `${base.replace(/\/+$/u, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveTokenExchangeUrl(): string {
  const explicitBase = String(import.meta.env.VITE_ACTIVITY_TOKEN_BASE ?? "").trim();
  const base = explicitBase || configuredApiBases[0] || "";
  return buildHostedUrl("/api/auth/token", base);
}

function withDefinedActivityContext(context: {
  instanceId?: string | undefined;
  guildId?: string | undefined;
  channelId?: string | undefined;
}): Pick<DiscordAuth, "instanceId" | "guildId" | "channelId"> {
  const result: Pick<DiscordAuth, "instanceId" | "guildId" | "channelId"> = {};
  if (context.instanceId) result.instanceId = context.instanceId;
  if (context.guildId) result.guildId = context.guildId;
  if (context.channelId) result.channelId = context.channelId;
  return result;
}

/**
 * Full Discord Embedded App SDK auth flow:
 * 1. Wait for SDK ready
 * 2. Authorize (gets code)
 * 3. Exchange code for access_token via our bot's /api/auth/token endpoint
 * 4. Authenticate with SDK (validates token, populates SDK user)
 */
export async function initDiscordAuth(): Promise<DiscordAuth> {
  const devAuth = parseDevAuth();
  if (devAuth) {
    return devAuth;
  }

  if (!isDiscordActivity()) {
    throw new Error("This page is not running inside Discord Activity. Add ?devUser=<id>&devName=<name> for local browser testing.");
  }

  const sdk = getDiscordSdk();

  await sdk.ready();

  // Step 1: Get authorization code.
  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });

  // Step 2: Exchange the code for an access token via our API (keeps client_secret server-side).
  const tokenRes = await fetch(resolveTokenExchangeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!tokenRes.ok) {
    const err = (await tokenRes.json()) as { error?: string };
    throw new Error(`Token exchange failed: ${err.error ?? tokenRes.statusText}`);
  }

  const tokenData = (await tokenRes.json()) as DiscordTokenResponse;

  // Step 3: Authenticate the SDK with the access token.
  const auth = await sdk.commands.authenticate({ access_token: tokenData.access_token });

  return {
    userId: tokenData.account?.legacyGameUserId ?? auth.user.id,
    username: tokenData.account?.displayName ?? auth.user.username,
    accessToken: tokenData.app_token ?? tokenData.access_token,
    ...(tokenData.account?.accountId ? { accountId: tokenData.account.accountId } : {}),
    ...withDefinedActivityContext({
      instanceId: sdk.instanceId ?? undefined,
      guildId: sdk.guildId ?? undefined,
      channelId: sdk.channelId ?? undefined,
    }),
  };
}

export function closeActivity(reason = "Player exited"): void {
  if (!isDiscordActivity()) {
    return;
  }
  getDiscordSdk().close(RPCCloseCodes.CLOSE_NORMAL, reason);
}

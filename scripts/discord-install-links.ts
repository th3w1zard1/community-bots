import "dotenv/config";

const readRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
};

const readGuildId = (): string | undefined => {
  return process.env.DISCORD_TARGET_GUILD_ID?.trim() || undefined;
};

const buildInstallUrl = (appId: string, permissions: bigint, guildId?: string): string => {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", permissions.toString());

  if (guildId) {
    url.searchParams.set("guild_id", guildId);
    url.searchParams.set("disable_guild_select", "true");
  }

  return url.toString();
};

const guildId = readGuildId();

const installs = [
  {
    name: "Trask",
    appId: readRequiredEnv("TRASK_DISCORD_APP_ID"),
    permissions: 84992n,
  },
  {
    name: "HK",
    appId: readRequiredEnv("HK_DISCORD_APP_ID"),
    /** Align with hk-bot `HK_REACTION_BOT_PERMISSIONS` (reaction panels + roles). */
    permissions: 2416266304n,
  },
  {
    name: "Pazaak Bot",
    appId: readRequiredEnv("PAZAAK_DISCORD_APP_ID"),
    permissions: 19456n,
  },
];

for (const install of installs) {
  console.log(`${install.name}: ${buildInstallUrl(install.appId, install.permissions, guildId)}`);
}
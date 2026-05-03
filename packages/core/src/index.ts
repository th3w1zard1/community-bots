import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

type LogDetails = Error | object | string | number | boolean | null;

export interface Logger {
  info<T extends LogDetails = LogDetails>(message: string, details?: T): void;
  warn<T extends LogDetails = LogDetails>(message: string, details?: T): void;
  error<T extends LogDetails = LogDetails>(message: string, details?: T): void;
  debug<T extends LogDetails = LogDetails>(message: string, details?: T): void;
}

export interface DiscordRuntimeConfigLike {
  appId: string;
  botToken: string;
  guildId: string | undefined;
}

export interface ClientIntentOptions {
  guildMembers?: boolean;
  /** Implied when `guildMessageReactions` is true (required for reaction events on guild messages). */
  guildMessages?: boolean;
  messageContent?: boolean;
  /** Enables Guild Message Reactions intent and reaction/message/channel/user partials for uncached messages. */
  guildMessageReactions?: boolean;
}

const writeLog = (level: string, scope: string, message: string, details?: LogDetails): void => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${scope}] [${level}] ${message}`;

  if (details === undefined) {
    console.log(prefix);
    return;
  }

  console.log(prefix, details);
};

export const createLogger = (scope: string): Logger => {
  return {
    info: (message, details) => writeLog("INFO", scope, message, details),
    warn: (message, details) => writeLog("WARN", scope, message, details),
    error: (message, details) => writeLog("ERROR", scope, message, details),
    debug: (message, details) => writeLog("DEBUG", scope, message, details),
  };
};

export const createBotClient = (options: ClientIntentOptions = {}): Client => {
  const intents = [GatewayIntentBits.Guilds];

  if (options.guildMembers) {
    intents.push(GatewayIntentBits.GuildMembers);
  }

  if (options.guildMessages || options.guildMessageReactions) {
    intents.push(GatewayIntentBits.GuildMessages);
  }

  if (options.guildMessageReactions) {
    intents.push(GatewayIntentBits.GuildMessageReactions);
  }

  if (options.messageContent) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  const partials = options.guildMessageReactions
    ? [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
    : undefined;

  return new Client(partials ? { intents, partials } : { intents });
};

export const deployGuildCommands = async (
  config: DiscordRuntimeConfigLike,
  commands: readonly RESTPostAPIApplicationCommandsJSONBody[],
  logger: Logger,
): Promise<void> => {
  if (!config.guildId) {
    logger.warn("Skipping guild command deployment because no guild id is configured.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(config.botToken);

  await rest.put(Routes.applicationGuildCommands(config.appId, config.guildId), {
    body: commands,
  });

  logger.info("Guild-scoped commands deployed.", {
    guildId: config.guildId,
    commandCount: commands.length,
  });
};

/**
 * Deploy commands globally (available in all guilds and DMs).
 * Global commands can take up to one hour to propagate.
 * If `guildId` is also configured on the same app, guild commands take precedence
 * in that guild, so you can still override per-guild for faster testing.
 */
export const deployGlobalCommands = async (
  config: DiscordRuntimeConfigLike,
  commands: readonly RESTPostAPIApplicationCommandsJSONBody[],
  logger: Logger,
): Promise<void> => {
  const rest = new REST({ version: "10" }).setToken(config.botToken);

  await rest.put(Routes.applicationCommands(config.appId), {
    body: commands,
  });

  logger.info("Global commands deployed.", {
    commandCount: commands.length,
  });
};

export const toErrorMessage = <T>(error: T): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

export const mentionUser = (userId: string): string => `<@${userId}>`;
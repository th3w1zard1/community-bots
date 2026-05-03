import {
  EmbedBuilder,
  Events,
  type Client,
  type Guild,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type Role,
  type User,
} from "discord.js";

import type { Logger } from "@openkotor/core";
import { buildSuccessEmbed, buildWarningEmbed } from "@openkotor/discord-ui";
import { findCuratedRoleById } from "@openkotor/personas";

import { mutateMemberRole, getBotMember } from "./member-role-mutate.js";
import {
  discordEmojiKey,
  findMappingForEmoji,
  findPanelForMessage,
  type ReactionRoleConfigLoader,
} from "./reaction-role-config.js";
import {
  pickReactionErrorLine,
  pickReactionNoopLine,
  pickReactionSuccessLine,
} from "./reaction-role-replies.js";

const lastReplyAt = new Map<string, number>();

const replyCooldownKey = (messageId: string, userId: string): string => `${messageId}:${userId}`;

const resolveTargetRole = async (
  guild: Guild,
  mapping: { roleId?: string; curatedRoleId?: string; roleNameHint?: string },
): Promise<Role | null> => {
  if (mapping.roleId) {
    const cached = guild.roles.cache.get(mapping.roleId);

    if (cached) {
      return cached;
    }

    return guild.roles.fetch(mapping.roleId).catch(() => null);
  }

  const curatedId = mapping.curatedRoleId;

  if (curatedId) {
    const def = findCuratedRoleById(curatedId);

    if (!def) {
      return null;
    }

    const exact = guild.roles.cache.find((r) => r.name === def.name);

    if (exact) {
      return exact;
    }

    const lower = def.name.toLowerCase();
    return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ?? null;
  }

  const hint = mapping.roleNameHint?.trim();

  if (!hint) {
    return null;
  }

  const exact = guild.roles.cache.find((r) => r.name === hint);

  if (exact) {
    return exact;
  }

  const lower = hint.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ?? null;
};

const resolveRoleLabel = (
  mapping: { roleId?: string; curatedRoleId?: string; roleNameHint?: string },
  role: Role | null,
): string => {
  if (role) {
    return role.name;
  }

  if (mapping.curatedRoleId) {
    const def = findCuratedRoleById(mapping.curatedRoleId);

    return def?.name ?? mapping.curatedRoleId;
  }

  if (mapping.roleNameHint) {
    return mapping.roleNameHint;
  }

  return mapping.roleId ?? "unknown role";
};

/** Human-readable emoji for HK flavor text (custom → `:name:`, unicode as-is). */
const reactionEmojiDisplay = (emojiKey: string): string => {
  const colonIdx = emojiKey.lastIndexOf(":");

  if (colonIdx > 0) {
    const name = emojiKey.slice(0, colonIdx).trim();

    if (name) {
      return `:${name}:`;
    }
  }

  return emojiKey || "that reaction";
};

const finalizeReaction = async (
  reaction: MessageReaction,
  user: User,
  direction: "add" | "remove",
  logger: Logger,
  configLoader: ReactionRoleConfigLoader,
): Promise<void> => {
  const message = reaction.message;

  if (!message.guild || !message.channel.isTextBased()) {
    return;
  }

  const guild = message.guild;
  const snapshot = configLoader.getSnapshot();
  const panel = findPanelForMessage(snapshot, message.channel.id, message.id);

  if (!panel) {
    return;
  }

  const emojiKey = discordEmojiKey(reaction.emoji);
  const mapping = findMappingForEmoji(panel, emojiKey);
  const emojiLabel = reactionEmojiDisplay(emojiKey);

  if (!mapping) {
    return;
  }

  let member;

  try {
    member = await guild.members.fetch(user.id);
  } catch (error) {
    logger.warn("Reaction-role: could not fetch guild member.", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const role = await resolveTargetRole(guild, mapping);
  const roleLabel = resolveRoleLabel(mapping, role);
  const curatedDef = mapping.curatedRoleId ? findCuratedRoleById(mapping.curatedRoleId) : undefined;

  const auditReason = `HK reaction-role panel (${direction}) for ${member.user.tag}`;

  if (!role) {
    await announceOutcome({
      panelAnnounceMode: panel.announceMode,
      message,
      memberId: member.id,
      cooldownMs: snapshot.replyCooldownMs,
      embed: buildWarningEmbed({
        title: "Designation Failure",
        description: pickReactionErrorLine("missing", roleLabel, {
          displayName: member.displayName,
          emojiLabel,
        }),
      }),
      logger,
    });
    return;
  }

  let botMember: Awaited<ReturnType<typeof getBotMember>>;

  try {
    botMember = await getBotMember(member);
  } catch (error) {
    logger.warn("Reaction-role: could not fetch bot member.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const mutation = await mutateMemberRole(member, role, direction === "add" ? "add" : "remove", botMember, auditReason);

  if (mutation.kind === "blocked") {
    await announceOutcome({
      panelAnnounceMode: panel.announceMode,
      message,
      memberId: member.id,
      cooldownMs: snapshot.replyCooldownMs,
      embed: buildWarningEmbed({
        title: "Designation Failure",
        description: pickReactionErrorLine("blocked", mutation.roleName, {
          displayName: member.displayName,
          emojiLabel,
        }),
      }),
      logger,
    });
    return;
  }

  if (mutation.kind === "noop") {
    await announceOutcome({
      panelAnnounceMode: panel.announceMode,
      message,
      memberId: member.id,
      cooldownMs: snapshot.replyCooldownMs,
      embed: buildSuccessEmbed({
        title: "Designation Update",
        description: pickReactionNoopLine(direction, mutation.roleName, {
          displayName: member.displayName,
          emojiLabel,
        }),
      }),
      logger,
    });
    return;
  }

  const line = pickReactionSuccessLine(direction, mutation.roleName, curatedDef, {
    displayName: member.displayName,
    emojiLabel,
  });

  await announceOutcome({
    panelAnnounceMode: panel.announceMode,
    message,
    memberId: member.id,
    cooldownMs: snapshot.replyCooldownMs,
    embed: buildSuccessEmbed({
      title: direction === "add" ? "Designation Assigned" : "Designation Removed",
      description: line,
    }),
    logger,
  });
};

const announceOutcome = async (opts: {
  panelAnnounceMode: import("./reaction-role-config.js").AnnounceMode;
  message: MessageReaction["message"];
  memberId: string;
  cooldownMs: number;
  embed: EmbedBuilder;
  logger: Logger;
}): Promise<void> => {
  if (opts.panelAnnounceMode === "silent") {
    return;
  }

  const key = replyCooldownKey(opts.message.id, opts.memberId);
  const now = Date.now();
  const last = lastReplyAt.get(key) ?? 0;

  if (now - last < opts.cooldownMs) {
    return;
  }

  lastReplyAt.set(key, now);

  try {
    if (opts.panelAnnounceMode === "dm") {
      const user = await opts.message.client.users.fetch(opts.memberId);
      await user.send({ embeds: [opts.embed] });
      return;
    }

    if (!opts.message.channel.isTextBased()) {
      return;
    }

    await opts.message.reply({
      embeds: [opts.embed],
      allowedMentions: { users: [opts.memberId] },
    });
  } catch (error) {
    opts.logger.warn("Reaction-role: could not send HK reply.", {
      mode: opts.panelAnnounceMode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const hydrateReaction = async (
  reaction: MessageReaction | PartialMessageReaction,
  logger: Logger,
): Promise<MessageReaction | null> => {
  try {
    if (reaction.partial) {
      await reaction.fetch();
    }

    const msg = reaction.message;

    if (msg.partial) {
      await msg.fetch();
    }

    return reaction as MessageReaction;
  } catch (error) {
    logger.debug("Reaction-role: reaction/message fetch failed (deleted or inaccessible).", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const hydrateUser = async (user: User | PartialUser): Promise<User | null> => {
  try {
    if (user.partial) {
      return await user.fetch();
    }

    return user as User;
  } catch {
    return null;
  }
};

export const registerReactionRoleHandlers = (client: Client, logger: Logger, configLoader: ReactionRoleConfigLoader): void => {
  const handle = async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    direction: "add" | "remove",
  ): Promise<void> => {
    const fullUser = await hydrateUser(user);

    if (!fullUser || fullUser.bot || fullUser.id === client.user?.id) {
      return;
    }

    const fullReaction = await hydrateReaction(reaction, logger);

    if (!fullReaction) {
      return;
    }

    await finalizeReaction(fullReaction, fullUser, direction, logger, configLoader);
  };

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void handle(reaction, user, "add");
  });

  client.on(Events.MessageReactionRemove, (reaction, user) => {
    void handle(reaction, user, "remove");
  });
};

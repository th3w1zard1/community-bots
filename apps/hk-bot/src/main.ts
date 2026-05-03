import {
  ActionRowBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type RESTPostAPIApplicationCommandsJSONBody,
  type Role,
  type StringSelectMenuInteraction,
} from "discord.js";

import { loadHkBotConfig } from "@openkotor/config";
import { createBotClient, createLogger, deployGuildCommands, toErrorMessage } from "@openkotor/core";
import { JsonDesignationPresetRepository, resolveDataFile } from "@openkotor/persistence";
import { asBulletList, buildErrorEmbed, buildInfoEmbed, buildSuccessEmbed, buildWarningEmbed } from "@openkotor/discord-ui";
import { findCuratedRoleById, groupCuratedRolesByCategory, hkCuratedRoles, personaProfiles } from "@openkotor/personas";

import { getBotMember, mutateMemberRole } from "./member-role-mutate.js";
import { ReactionRoleConfigLoader } from "./reaction-role-config.js";
import { registerReactionRoleHandlers } from "./reaction-role-handlers.js";
import { buildReactionsHelpEmbed, buildReactionsStatusEmbed } from "./reaction-role-setup-ui.js";

const logger = createLogger("hk-bot");
const config = loadHkBotConfig();
const presetRepo = new JsonDesignationPresetRepository(resolveDataFile(config.dataDir, "designation-presets.json"));
const reactionRoleConfigLoader = new ReactionRoleConfigLoader(
  resolveDataFile(config.dataDir, "reaction-role-panels.json"),
  logger,
);

const designationChoices = hkCuratedRoles.map((role) => ({
  name: role.name,
  value: role.id,
}));

const designationsCommand = new SlashCommandBuilder()
  .setName("designations")
  .setDescription("Manage curated HK designations.")
  .addSubcommand((subcommand) => {
    return subcommand.setName("panel").setDescription("Open a panel to sync your curated designations.");
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("onboarding")
      .setDescription("Post a persistent public designation panel to this channel.")
      .addBooleanOption((option: import("discord.js").SlashCommandBooleanOption) =>
        option
          .setName("ephemeral")
          .setDescription("Post only to you instead of the channel? (default: false)")
          .setRequired(false),
      );
  })
  .addSubcommand((subcommand) => {
    return subcommand.setName("list").setDescription("List the currently approved designations.");
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("assign")
      .setDescription("Assign one designation from the curated role catalog.")
      .addStringOption((option) => {
        return option
          .setName("designation")
          .setDescription("Which designation should be assigned?")
          .setRequired(true)
          .addChoices(...designationChoices);
      });
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("remove")
      .setDescription("Remove one designation from the curated role catalog.")
      .addStringOption((option) => {
        return option
          .setName("designation")
          .setDescription("Which designation should be removed?")
          .setRequired(true)
          .addChoices(...designationChoices);
      });
  })
  .addSubcommandGroup((group) => {
    return group
      .setName("reactions")
      .setDescription("Reaction-for-role panel operators.")
      .addSubcommand((sub) =>
        sub.setName("help").setDescription("Full setup checklist, intents note, and bot invite link."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("status")
          .setDescription("Reload reaction-role-panels.json from disk and summarize panels (Manage Server)."),
      );
  });

const getCurrentDesignationIds = (member: GuildMember): string[] => {
  return hkCuratedRoles
    .filter((role) => member.roles.cache.some((guildRole) => guildRole.name === role.name))
    .map((role) => role.id);
};

const buildDesignationListEmbed = () => {
  const groups = groupCuratedRolesByCategory();

  return buildInfoEmbed({
    title: `${personaProfiles.hk.displayName} Designation Catalog`,
    description: "Statement: The following designations are approved for self-service assignment.",
    fields: Array.from(groups.entries()).map(([category, roles]) => ({
      name: category,
      value: asBulletList(roles.map((role) => `${role.name}: ${role.description}`)),
      inline: false,
    })),
  });
};

const buildDesignationPanelPayload = (member: GuildMember, savedPresetIds?: readonly string[]) => {
  const currentIds = savedPresetIds ? new Set(savedPresetIds) : new Set(getCurrentDesignationIds(member));
  const currentLabels = hkCuratedRoles.filter((role) => currentIds.has(role.id)).map((role) => role.name);

  const select = new StringSelectMenuBuilder()
    .setCustomId("hk:designation-sync")
    .setPlaceholder("Select the designations you want to keep.")
    .setMinValues(0)
    .setMaxValues(hkCuratedRoles.length)
    .addOptions(
      hkCuratedRoles.map((role) => ({
        label: role.name,
        value: role.id,
        description: role.description,
        default: currentIds.has(role.id),
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  return {
    embeds: [
      buildInfoEmbed({
        title: "Designation Sync Panel",
        description: currentLabels.length
          ? `Statement: Current designations synchronized. Active set: ${currentLabels.join(", ")}.`
          : "Statement: No curated designations currently assigned.",
      }),
    ],
    components: [row],
  };
};

const resolveCuratedGuildRoles = (member: GuildMember): Map<string, Role | undefined> => {
  return new Map(
    hkCuratedRoles.map((role) => [
      role.id,
      member.guild.roles.cache.find((guildRole) => guildRole.name === role.name),
    ]),
  );
};

const applyDesignationSelection = async (
  member: GuildMember,
  selectedIds: readonly string[],
): Promise<{
  assigned: string[];
  removed: string[];
  missing: string[];
  blocked: string[];
}> => {
  const botMember = await getBotMember(member);
  const currentIds = new Set(getCurrentDesignationIds(member));
  const desiredIds = new Set(selectedIds);
  const roleMap = resolveCuratedGuildRoles(member);
  const assigned: string[] = [];
  const removed: string[] = [];
  const missing: string[] = [];
  const blocked: string[] = [];
  const auditReason = `HK designation sync for ${member.user.tag}`;

  for (const roleDefinition of hkCuratedRoles) {
    const role = roleMap.get(roleDefinition.id);

    if (!role) {
      if (desiredIds.has(roleDefinition.id) || currentIds.has(roleDefinition.id)) {
        missing.push(roleDefinition.name);
      }

      continue;
    }

    if (desiredIds.has(roleDefinition.id) && !currentIds.has(roleDefinition.id)) {
      const result = await mutateMemberRole(member, role, "add", botMember, auditReason);

      if (result.kind === "assigned") {
        assigned.push(result.roleName);
      }

      if (result.kind === "blocked") {
        blocked.push(result.roleName);
      }

      continue;
    }

    if (!desiredIds.has(roleDefinition.id) && currentIds.has(roleDefinition.id)) {
      const result = await mutateMemberRole(member, role, "remove", botMember, auditReason);

      if (result.kind === "removed") {
        removed.push(result.roleName);
      }

      if (result.kind === "blocked") {
        blocked.push(result.roleName);
      }
    }
  }

  return { assigned, removed, missing, blocked };
};

const replyWithSelectionSummary = async (
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  member: GuildMember,
  summary: {
    assigned: string[];
    removed: string[];
    missing: string[];
    blocked: string[];
  },
  selectedIds?: readonly string[],
) => {
  if (selectedIds) {
    await presetRepo.savePreset(member.guild.id, member.id, selectedIds);
  }

  const savedPreset = selectedIds ?? (await presetRepo.getPreset(member.guild.id, member.id));
  const updatedPanel = buildDesignationPanelPayload(member, savedPreset);
  const lines: string[] = [];

  if (summary.assigned.length > 0) {
    lines.push(`Statement: Assigned ${summary.assigned.join(", ")}.`);
  }

  if (summary.removed.length > 0) {
    lines.push(`Statement: Removed ${summary.removed.join(", ")}.`);
  }

  if (summary.missing.length > 0) {
    lines.push(`Observation: Missing guild roles for ${summary.missing.join(", ")}.`);
  }

  if (summary.blocked.length > 0) {
    lines.push(`Mockery: Role hierarchy prevented access to ${summary.blocked.join(", ")}.`);
  }

  if (lines.length === 0) {
    lines.push("Statement: No designation changes were required.");
  }

  const payload = {
    embeds: [
      buildSuccessEmbed({
        title: "Designation Update Complete",
        description: lines.join("\n"),
      }),
      ...updatedPanel.embeds,
    ],
    components: updatedPanel.components,
  };

  if (interaction.isStringSelectMenu()) {
    await interaction.update(payload);
    return;
  }

  await interaction.reply({
    ...payload,
    ephemeral: true,
  });
};

const client = createBotClient({ guildMembers: true, guildMessageReactions: true });

registerReactionRoleHandlers(client, logger, reactionRoleConfigLoader);

client.once("ready", (readyClient) => {
  logger.info("HK designation unit online.", {
    user: readyClient.user.tag,
    designationCount: hkCuratedRoles.length,
    reactionRolePanelsPath: resolveDataFile(config.dataDir, "reaction-role-panels.json"),
  });
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.inGuild() || !interaction.member) {
        await interaction.reply({
          embeds: [
            buildErrorEmbed({
              title: "Guild Required",
              description: "Statement: Designation changes can only occur inside a guild.",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName !== "designations") {
        return;
      }

      const guild = interaction.guild;

      if (!guild) {
        throw new Error("Guild unavailable for designation command.");
      }

      const member = await guild.members.fetch(interaction.user.id);

      if (interaction.options.getSubcommandGroup(false) === "reactions") {
        const reactionSub = interaction.options.getSubcommand(true);

        if (reactionSub === "help") {
          await interaction.reply({
            embeds: [
              buildReactionsHelpEmbed({
                appId: config.discord.appId,
                configPath: reactionRoleConfigLoader.configPath,
              }),
            ],
            ephemeral: true,
          });
          return;
        }

        if (reactionSub === "status") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
              embeds: [
                buildErrorEmbed({
                  title: "Insufficient Permissions",
                  description: "Statement: Only guild managers can inspect reaction panel config.",
                }),
              ],
              ephemeral: true,
            });
            return;
          }

          reactionRoleConfigLoader.invalidateCache();
          const snapshot = reactionRoleConfigLoader.getSnapshot();

          await interaction.reply({
            embeds: [buildReactionsStatusEmbed({ loader: reactionRoleConfigLoader, snapshot })],
            ephemeral: true,
          });
          return;
        }
      }

      const subcommand = interaction.options.getSubcommand(true);

      if (subcommand === "list") {
        await interaction.reply({
          embeds: [buildDesignationListEmbed()],
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "panel") {
        const savedPreset = await presetRepo.getPreset(guild.id, member.id);
        await interaction.reply({
          ...buildDesignationPanelPayload(member, savedPreset),
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "onboarding") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            embeds: [
              buildErrorEmbed({
                title: "Insufficient Permissions",
                description: "Statement: Only guild managers can post onboarding panels.",
              }),
            ],
            ephemeral: true,
          });
          return;
        }
        const sendEphemeral = interaction.options.getBoolean("ephemeral", false) ?? false;
        const savedPreset = await presetRepo.getPreset(guild.id, member.id);
        const panel = buildDesignationPanelPayload(member, savedPreset);
        await interaction.reply({
          embeds: [
            buildInfoEmbed({
              title: "Designation Panel Posted",
              description: sendEphemeral
                ? "Statement: Panel dispatched to your channel in private mode."
                : "Statement: Onboarding panel posted to this channel.",
            }),
          ],
          ephemeral: true,
        });
        if (!sendEphemeral) {
          await interaction.channel?.send({
            ...panel,
          });
        }
        return;
      }

      const designationId = interaction.options.getString("designation", true);
      const designation = findCuratedRoleById(designationId);

      if (!designation) {
        await interaction.reply({
          embeds: [
            buildErrorEmbed({
              title: "Unknown Designation",
              description: `Query: ${designationId}? That designation is not approved.`,
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "assign") {
        const assignIds = [...new Set([...getCurrentDesignationIds(member), designation.id])];
        const summary = await applyDesignationSelection(member, assignIds);
        await replyWithSelectionSummary(interaction, member, summary, assignIds);
        return;
      }

      if (subcommand === "remove") {
        const removeIds = getCurrentDesignationIds(member).filter((roleId) => roleId !== designation.id);
        const summary = await applyDesignationSelection(member, removeIds);
        await replyWithSelectionSummary(interaction, member, summary, removeIds);
      }

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "hk:designation-sync") {
      if (!interaction.inGuild()) {
        await interaction.reply({
          embeds: [
            buildErrorEmbed({
              title: "Guild Required",
              description: "Statement: This panel only functions inside a guild.",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const guild = interaction.guild;

      if (!guild) {
        throw new Error("Guild unavailable for designation sync.");
      }

      const member = await guild.members.fetch(interaction.user.id);
      const summary = await applyDesignationSelection(member, interaction.values);
      await replyWithSelectionSummary(interaction, member, summary, interaction.values);
    }
  } catch (error) {
    logger.error("HK interaction failed.", error instanceof Error ? error : { error: String(error) });

    const payload = {
      embeds: [
        buildWarningEmbed({
          title: "Designation Failure",
          description: `Observation: The procedure failed. ${toErrorMessage(error)}`,
        }),
      ],
      ephemeral: true,
    };

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }
});

const deployables = [designationsCommand.toJSON() as RESTPostAPIApplicationCommandsJSONBody];
await deployGuildCommands(config.discord, deployables, logger);
await client.login(config.discord.botToken);
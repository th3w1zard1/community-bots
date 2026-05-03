import { basename } from "node:path";

import { buildInfoEmbed, buildWarningEmbed } from "@openkotor/discord-ui";

import type { ReactionRoleConfigLoader, ReactionRolePanelsSnapshot } from "./reaction-role-config.js";

/** Bitfield for OAuth invite: Manage Roles, Send Messages, Embed, History, Reactions, Slash, External Emojis, View Channel. */
export const HK_REACTION_BOT_PERMISSIONS = "2416266304";

/** Canonical HK user + operator guide (wiki submodule `community-bots.wiki`). */
export const HK_USER_GUIDE_WIKI_URL =
  "https://github.com/OpenKotOR/community-bots/wiki/docs/guides/hk-86";

/** Example reaction panels JSON in this monorepo (`bots`). */
export const HK_REACTION_PANELS_EXAMPLE_BLOB_URL =
  "https://github.com/OpenKotOR/bots/blob/main/apps/hk-bot/reaction-role-panels.example.json";

export const buildReactionSetupInviteUrl = (appId: string): string => {
  const params = new URLSearchParams({
    client_id: appId,
    permissions: HK_REACTION_BOT_PERMISSIONS,
    scope: "bot applications.commands",
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
};

export const buildReactionsHelpEmbed = (opts: { appId: string; configPath: string }) => {
  const invite = buildReactionSetupInviteUrl(opts.appId);

  return buildInfoEmbed({
    title: "Reaction panels — full setup",
    description:
      "Statement: Execute these steps once per deployment. Hot edits use only the JSON file — no restart.",
    fields: [
      {
        name: "1. Discord application",
        value: [
          "- Turn on **Privileged intents** you already use: **Server Members Intent** (required for roles).",
          "- **Guild Messages** / **Guild Message Reactions** are requested by the bot in code — there are no separate toggles for them in the Developer Portal.",
          "- Optional: disable **Message Content** if you want minimal privileges (HK react-for-role does not need it).",
        ].join("\n"),
        inline: false,
      },
      {
        name: "2. Bot invite (permissions pre-filled)",
        value: `[Add HK-86 to a server](${invite})\nPermissions integer: \`${HK_REACTION_BOT_PERMISSIONS}\` (Manage Roles, View Channel, Send Messages, Embed, Read History, Add Reactions, Use Slash Commands, Use External Emojis).`,
        inline: false,
      },
      {
        name: "3. Guild layout",
        value:
          "- Drag the **HK-86** role **above** every role it may assign.\n- Ensure the bot can **Send messages** and **Read history** in the channel that hosts the panel.",
        inline: false,
      },
      {
        name: "4. Panel message",
        value:
          "- Post your explanation/embed in a channel, then **copy channel ID** and **message ID** (Developer Mode).\n- Add the same emoji reactions you list in JSON (users react with those).",
        inline: false,
      },
      {
        name: "5. Config file",
        value: [
          `- Path on the host: \`${opts.configPath}\``,
          `- Full guide: ${HK_USER_GUIDE_WIKI_URL}`,
          `- Example JSON: ${HK_REACTION_PANELS_EXAMPLE_BLOB_URL} — copy to that path as \`reaction-role-panels.json\` and replace placeholders.`,
          "- Prefer **`roleId`** (snowflake) for stability; use **`roleNameHint`** if you want name-based binding when IDs churn.",
          "- **`emoji`** (string) or **`emojis`** (array): multiple reactions can map to one role.",
          "- **`curatedRoleId`** resolves by catalog name with **case-insensitive** guild match if exact name drifted.",
          "- Save the file — the bot **watches the file** and reloads on change (also on **mtime** each reaction; **`/designations reactions status`** forces reload).",
        ].join("\n"),
        inline: false,
      },
      {
        name: "6. Verify",
        value:
          "- Run **`/designations reactions status`** (Manage Server) after edits.\n- React on the panel with a test account; expect HK reply + role change.",
        inline: false,
      },
    ],
  });
};

export const buildReactionsStatusEmbed = (opts: {
  loader: ReactionRoleConfigLoader;
  snapshot: ReactionRolePanelsSnapshot;
}) => {
  const path = opts.loader.configPath;
  const exists = opts.loader.fileExists();

  if (!exists) {
    return buildWarningEmbed({
      title: "Reaction config missing",
      description: [
        `Observation: No file at \`${path}\`.`,
        `Statement: Create it from \`apps/hk-bot/${basename(path)}\` example in the repo (copy → rename → replace IDs).`,
      ].join("\n"),
    });
  }

  const snap = opts.snapshot;
  const lines = snap.panels.map((p, i) => {
    const mapCount = p.mappings.length;
    return `**${i + 1}.** ch \`${p.channelId}\` · msg \`${p.messageId}\` · ${mapCount} mapping(s) · announce **${p.announceMode}**`;
  });

  return buildInfoEmbed({
    title: "Reaction config status",
    description: [
      `**File:** \`${path}\``,
      `**Default announce:** ${snap.defaultAnnounceMode} · **Cooldown:** ${snap.replyCooldownMs}ms`,
      snap.panels.length ? ["**Panels:**", ...lines].join("\n") : "**Panels:** none (empty array — no reaction routing).",
    ].join("\n\n"),
  });
};

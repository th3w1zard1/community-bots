import { existsSync, readFileSync, statSync, watchFile } from "node:fs";

import type { Logger } from "@openkotor/core";

export type AnnounceMode = "reply" | "dm" | "silent";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ParsedReactionMapping {
  /** One or more normalized emoji keys (unicode literal or custom `name:snowflake`). */
  emojiKeys: readonly string[];
  roleId?: string;
  curatedRoleId?: string;
  /** Resolve a guild role by exact Discord role name (trimmed). Case-insensitive fallback if no exact match. */
  roleNameHint?: string;
}

export interface ParsedReactionPanel {
  channelId: string;
  messageId: string;
  announceMode: AnnounceMode;
  mappings: ParsedReactionMapping[];
}

export interface ReactionRolePanelsSnapshot {
  readonly defaultAnnounceMode: AnnounceMode;
  /** Per-(channelId:messageId) cooldown between HK replies for the same user, milliseconds. */
  readonly replyCooldownMs: number;
  readonly panels: ParsedReactionPanel[];
}

const SNOWFLAKE_RE = /^\d{17,20}$/;

const isSnowflake = (value: string): boolean => SNOWFLAKE_RE.test(value);

/** Build lookup key matching Discord.js reaction emoji for comparisons. */
export const discordEmojiKey = (emoji: { id: string | null; name: string | null | undefined }): string => {
  if (emoji.id && emoji.name) {
    return `${emoji.name}:${emoji.id}`;
  }

  return (emoji.name ?? "").trim();
};

/**
 * Normalize emoji string from JSON config.
 * Custom emojis must use `name:snowflake` (same as discordEmojiKey output).
 * Unicode emojis are stored as the literal character(s).
 */
export const normalizeConfigEmoji = (
  raw: string,
): { ok: true; key: string } | { ok: false; reason: string } => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty emoji" };
  }

  const colonIdx = trimmed.lastIndexOf(":");

  if (colonIdx > 0) {
    const name = trimmed.slice(0, colonIdx).trim();
    const id = trimmed.slice(colonIdx + 1).trim();

    if (!name || !isSnowflake(id)) {
      return { ok: false, reason: `invalid custom emoji format (expected name:snowflake): ${raw}` };
    }

    return { ok: true, key: `${name}:${id}` };
  }

  return { ok: true, key: trimmed };
};

interface RawMapping {
  emoji?: JsonValue;
  emojis?: JsonValue;
  roleId?: JsonValue;
  curatedRoleId?: JsonValue;
  roleNameHint?: JsonValue;
}

interface RawPanel {
  channelId?: JsonValue;
  messageId?: JsonValue;
  announceMode?: JsonValue;
  mappings?: JsonValue;
}

interface RawRoot {
  version?: JsonValue;
  defaultAnnounceMode?: JsonValue;
  replyCooldownMs?: JsonValue;
  panels?: JsonValue;
}

const parseAnnounceMode = (raw: JsonValue | undefined, fallback: AnnounceMode): AnnounceMode => {
  if (raw === undefined || raw === null) {
    return fallback;
  }

  if (raw === "reply" || raw === "dm" || raw === "silent") {
    return raw;
  }

  throw new Error(`Invalid announceMode: ${String(raw)}`);
};

export const parseReactionRolePanelsJson = (
  text: string,
  logger?: Pick<Logger, "warn">,
): ReactionRolePanelsSnapshot => {
  let root: RawRoot;

  try {
    root = JSON.parse(text) as RawRoot;
  } catch {
    throw new Error("reaction-role-panels.json is not valid JSON");
  }

  const defaultAnnounceMode = parseAnnounceMode(root.defaultAnnounceMode, "reply");

  let replyCooldownMs = 3000;

  if (root.replyCooldownMs !== undefined && root.replyCooldownMs !== null) {
    if (typeof root.replyCooldownMs !== "number" || !Number.isFinite(root.replyCooldownMs) || root.replyCooldownMs < 0) {
      throw new Error("replyCooldownMs must be a non-negative number");
    }

    replyCooldownMs = root.replyCooldownMs;
  }

  if (!Array.isArray(root.panels)) {
    throw new Error("panels must be an array");
  }

  const panels: ParsedReactionPanel[] = [];

  for (const entry of root.panels as RawPanel[]) {
    if (typeof entry?.channelId !== "string" || !isSnowflake(entry.channelId)) {
      logger?.warn("Skipping reaction-role panel: invalid channelId.", { entry });
      continue;
    }

    if (typeof entry.messageId !== "string" || !isSnowflake(entry.messageId)) {
      logger?.warn("Skipping reaction-role panel: invalid messageId.", { entry });
      continue;
    }

    let announceMode: AnnounceMode;

    try {
      announceMode = parseAnnounceMode(entry.announceMode, defaultAnnounceMode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger?.warn(`Skipping panel ${entry.channelId}/${entry.messageId}: ${msg}`);
      continue;
    }

    if (!Array.isArray(entry.mappings)) {
      logger?.warn("Skipping reaction-role panel: mappings must be an array.", {
        channelId: entry.channelId,
        messageId: entry.messageId,
      });
      continue;
    }

    const mappings: ParsedReactionMapping[] = [];

    for (const m of entry.mappings as RawMapping[]) {
      const emojiRawList: JsonValue[] = [];

      if (m?.emoji !== undefined && m?.emoji !== null) {
        emojiRawList.push(m.emoji as JsonValue);
      }

      if (Array.isArray(m?.emojis)) {
        emojiRawList.push(...(m.emojis as JsonValue[]));
      }

      const emojiKeys: string[] = [];

      for (const rawEmoji of emojiRawList) {
        if (typeof rawEmoji !== "string") {
          logger?.warn("Skipping emoji entry: must be a string.", { channelId: entry.channelId, rawEmoji });
          continue;
        }

        const normalized = normalizeConfigEmoji(rawEmoji);

        if (!normalized.ok) {
          logger?.warn(`Skipping emoji: ${normalized.reason}`, { emoji: rawEmoji });
          continue;
        }

        if (!emojiKeys.includes(normalized.key)) {
          emojiKeys.push(normalized.key);
        }
      }

      if (emojiKeys.length === 0) {
        logger?.warn("Skipping mapping: provide `emoji` (string) and/or `emojis` (string[]) with at least one valid emoji.", {
          channelId: entry.channelId,
        });
        continue;
      }

      const roleId = m.roleId !== undefined && m.roleId !== null ? String(m.roleId).trim() : undefined;
      const curatedRoleId =
        m.curatedRoleId !== undefined && m.curatedRoleId !== null ? String(m.curatedRoleId).trim() : undefined;
      const roleNameHint =
        m.roleNameHint !== undefined && m.roleNameHint !== null ? String(m.roleNameHint).trim() : undefined;

      const hasRole = roleId !== undefined && roleId.length > 0;
      const hasCurated = curatedRoleId !== undefined && curatedRoleId.length > 0;
      const hasHint = roleNameHint !== undefined && roleNameHint.length > 0;
      const modeCount = [hasRole, hasCurated, hasHint].filter(Boolean).length;

      if (modeCount !== 1) {
        logger?.warn(
          "Skipping mapping: provide exactly one of roleId (snowflake), curatedRoleId (catalog id), or roleNameHint (guild role name).",
          { emojiKeys },
        );
        continue;
      }

      if (hasRole && roleId && !isSnowflake(roleId)) {
        logger?.warn("Skipping mapping: roleId must be a snowflake.", { emojiKeys });
        continue;
      }

      mappings.push({
        emojiKeys,
        ...(hasRole ? { roleId } : {}),
        ...(hasCurated ? { curatedRoleId } : {}),
        ...(hasHint ? { roleNameHint } : {}),
      });
    }

    panels.push({
      channelId: entry.channelId,
      messageId: entry.messageId,
      announceMode,
      mappings,
    });
  }

  return {
    defaultAnnounceMode,
    replyCooldownMs,
    panels,
  };
};

export const findPanelForMessage = (
  snapshot: ReactionRolePanelsSnapshot,
  channelId: string,
  messageId: string,
): ParsedReactionPanel | undefined => {
  return snapshot.panels.find((p) => p.channelId === channelId && p.messageId === messageId);
};

export const findMappingForEmoji = (
  panel: ParsedReactionPanel,
  emojiKey: string,
): ParsedReactionMapping | undefined => {
  return panel.mappings.find((m) => m.emojiKeys.includes(emojiKey));
};

/** Loads `reaction-role-panels.json` with mtime-based cache invalidation. */
export class ReactionRoleConfigLoader {
  private cachedMtimeMs = 0;

  private cachedSnapshot: ReactionRolePanelsSnapshot = {
    defaultAnnounceMode: "reply",
    replyCooldownMs: 3000,
    panels: [],
  };

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
    options?: { watchFileChanges?: boolean },
  ) {
    const watch = options?.watchFileChanges !== false;

    if (watch) {
      try {
        watchFile(this.filePath, { interval: 1500 }, () => {
          this.invalidateCache();
          this.logger.debug("Reaction-role config file watch fired; cache invalidated.", {
            path: this.filePath,
          });
        });
      } catch (error) {
        this.logger.warn("Could not watch reaction-role config path (falling back to mtime on events only).", {
          path: this.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Absolute path to `reaction-role-panels.json` as resolved at startup. */
  get configPath(): string {
    return this.filePath;
  }

  fileExists(): boolean {
    return existsSync(this.filePath);
  }

  /** Forces the next `getSnapshot()` to reload from disk even if mtime is unchanged. */
  invalidateCache(): void {
    this.cachedMtimeMs = Number.NEGATIVE_INFINITY;
  }

  getSnapshot(): ReactionRolePanelsSnapshot {
    if (!existsSync(this.filePath)) {
      if (this.cachedMtimeMs !== -1) {
        this.cachedMtimeMs = -1;
        this.cachedSnapshot = {
          defaultAnnounceMode: "reply",
          replyCooldownMs: 3000,
          panels: [],
        };
        this.logger.debug("Reaction-role config file missing; using empty panels.", {
          path: this.filePath,
        });
      }

      return this.cachedSnapshot;
    }

    let stat;

    try {
      stat = statSync(this.filePath);
    } catch (error) {
      this.logger.warn("Could not stat reaction-role config.", {
        path: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.cachedSnapshot;
    }

    const mtime = stat.mtimeMs;

    if (mtime === this.cachedMtimeMs) {
      return this.cachedSnapshot;
    }

    let text: string;

    try {
      text = readFileSync(this.filePath, "utf8");
    } catch (error) {
      this.logger.warn("Could not read reaction-role config.", {
        path: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.cachedSnapshot;
    }

    try {
      this.cachedSnapshot = parseReactionRolePanelsJson(text, this.logger);
      this.cachedMtimeMs = mtime;
      this.logger.info("Loaded reaction-role panels config.", {
        path: this.filePath,
        panelCount: this.cachedSnapshot.panels.length,
      });
    } catch (error) {
      this.logger.warn("Failed to parse reaction-role config; keeping previous snapshot.", {
        path: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.cachedSnapshot;
  }
}

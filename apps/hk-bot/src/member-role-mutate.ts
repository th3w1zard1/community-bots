import type { GuildMember, Role } from "discord.js";

export type RoleMutationKind = "assigned" | "removed" | "noop" | "blocked";

export interface RoleMutationResult {
  kind: RoleMutationKind;
  roleName: string;
}

export const getBotMember = async (member: GuildMember): Promise<GuildMember> => {
  const existing = member.guild.members.me;

  if (existing) {
    return existing;
  }

  return member.guild.members.fetch(member.client.user.id);
};

/**
 * Add or remove a single guild role with the same hierarchy rules as designation sync.
 */
export const mutateMemberRole = async (
  member: GuildMember,
  role: Role,
  direction: "add" | "remove",
  botMember: GuildMember,
  auditReason: string,
): Promise<RoleMutationResult> => {
  const roleName = role.name;

  if (role.position >= botMember.roles.highest.position) {
    return { kind: "blocked", roleName };
  }

  const has = member.roles.cache.has(role.id);

  if (direction === "add") {
    if (has) {
      return { kind: "noop", roleName };
    }

    await member.roles.add(role, auditReason);
    return { kind: "assigned", roleName };
  }

  if (!has) {
    return { kind: "noop", roleName };
  }

  await member.roles.remove(role, auditReason);
  return { kind: "removed", roleName };
};

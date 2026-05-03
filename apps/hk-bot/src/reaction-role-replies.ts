import type { CuratedRoleDefinition } from "@openkotor/personas";

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

export interface ReactionReplyHints {
  /** Guild nickname or username fragment for direct HK address. */
  displayName: string;
  /** Label for the emoji the user chose (`:custom:` or unicode). */
  emojiLabel: string;
}

const meatbag = (name: string): string => {
  const trimmed = name.trim();

  if (!trimmed) {
    return "meatbag";
  }

  return trimmed;
};

export const pickReactionSuccessLine = (
  direction: "add" | "remove",
  roleDisplayName: string,
  curated: CuratedRoleDefinition | undefined,
  hints: ReactionReplyHints,
): string => {
  const roleLabel = roleDisplayName;
  const flavor = curated?.flavor ?? "";
  const category = curated?.category ?? "";
  const mb = meatbag(hints.displayName);
  const choice = hints.emojiLabel;

  const genericAssign = [
    `Statement: ${mb}, you tapped ${choice}. ${roleLabel} designation acquired — try not to embarrass the module.`,
    `Observation: ${mb} selected ${choice}. Tagging you for ${roleLabel}. Voluntary categorization logged.`,
    `Statement: ${choice} acknowledged, ${mb}. ${roleLabel} is live — I will monitor your enthusiasm with mild interest.`,
    flavor
      ? `Statement: ${mb}, ${choice} maps to ${roleLabel}. Context payload: ${flavor}`
      : `Statement: ${mb}, ${choice} locks ${roleLabel}. Proceed with your meatbag agenda.`,
    `Mockery: ${mb} thought ${choice} was decorative. It was not. ${roleLabel} applied.`,
  ];

  const genericRemove = [
    `Statement: ${mb}, you withdrew ${choice}. ${roleLabel} stripped — statistically insignificant, yet noted.`,
    `Observation: ${mb} abandoned ${choice}. ${roleLabel} canceled. I pretend to mourn.`,
    `Statement: ${choice} reversal from ${mb}. ${roleLabel} cleared — targeting tables updated.`,
    flavor
      ? `Statement: ${mb}, ${choice} no longer binds ${roleLabel}. Former context: ${flavor}`
      : `Statement: ${mb}, ${choice} shed ${roleLabel}. Efficiency marginally improved.`,
    `Mockery: ${mb} un-clicked ${choice}. ${roleLabel} gone. Dramatic, yet lawful.`,
  ];

  const sectorFlavor =
    category === "Sectors"
      ? [
          `Statement: ${mb}, sector ping via ${choice}: ${roleLabel}. Align your chronometer with propaganda.`,
          `Observation: ${choice} from ${mb} toggled sector flag ${roleLabel}. Galaxy remains indifferent.`,
        ]
      : [];

  const pool =
    direction === "add"
      ? [...genericAssign, ...(sectorFlavor.length ? sectorFlavor : [])]
      : [
          ...genericRemove,
          ...(category === "Sectors"
            ? [`Statement: ${mb}, ${choice} dropped sector tag ${roleLabel}.`]
            : []),
        ];

  return pick(pool);
};

export const pickReactionErrorLine = (
  kind: "missing" | "blocked",
  roleLabel: string,
  hints: ReactionReplyHints,
): string => {
  const mb = meatbag(hints.displayName);
  const choice = hints.emojiLabel;

  if (kind === "missing") {
    return pick([
      `Observation: ${mb}, ${choice} wants ${roleLabel}, but this guild has no matching role. Complain upward.`,
      `Statement: ${mb} triggered ${choice} for ${roleLabel}. Mapping exists; role object does not. Administrative meatbags required.`,
      `Mockery: ${choice} is cute, ${mb}, yet ${roleLabel} cannot materialize from vacuum.`,
    ]);
  }

  return pick([
    `Mockery: ${mb}, hierarchy veto on ${roleLabel} after ${choice}. Elevate this unit or accept defeat.`,
    `Observation: ${choice} from ${mb} targets ${roleLabel}, but role order forbids it. Fix the ladder.`,
    `Statement: ${mb}, I cannot touch ${roleLabel} — some fool stacked roles incorrectly. ${choice} wasted effort.`,
  ]);
};

export const pickReactionNoopLine = (
  direction: "add" | "remove",
  roleDisplayName: string,
  hints: ReactionReplyHints,
): string => {
  const mb = meatbag(hints.displayName);
  const choice = hints.emojiLabel;

  if (direction === "add") {
    return pick([
      `Observation: ${mb}, ${choice} is redundant — ${roleDisplayName} already rides your profile.`,
      `Statement: ${mb} hammered ${choice} again. ${roleDisplayName} unchanged. Enthusiasm logged, outcome zero.`,
    ]);
  }

  return pick([
    `Observation: ${mb}, ${roleDisplayName} was already absent after ${choice}. Gesture wasted; theatre appreciated.`,
    `Statement: ${mb}, ${choice} cannot strip ${roleDisplayName} — nothing was there. Try reacting when it matters.`,
  ]);
};

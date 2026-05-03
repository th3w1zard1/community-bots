import { z } from "zod";

export const regionDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Cloudflare Durable Object `locationHint` (best-effort). */
  locationHint: z.string().min(1).optional(),
});

export const timeControlPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  turnSeconds: z.number().int().positive(),
  incrementSeconds: z.number().int().nonnegative().optional(),
});

export const pazaakOpsPolicySchema = z.object({
  version: z.literal(1),
  timers: z.object({
    turnTimerSeconds: z.number().int().positive(),
    disconnectForfeitMs: z.number().int().nonnegative(),
    turnTimeoutMs: z.number().int().nonnegative(),
    reconnectGraceMs: z.number().int().nonnegative(),
  }),
  matchmaking: z.object({
    tickMs: z.number().int().positive(),
    queueWidenAfterMs: z.number().int().nonnegative(),
    regions: z.array(regionDefinitionSchema).min(1),
    defaultRegionId: z.string().min(1),
  }),
  features: z.object({
    workerMatchAuthority: z.boolean(),
    dualWriteMatchesToWorker: z.boolean(),
    dualWriteMatchesToBot: z.boolean(),
    allowPrivateBackendUrl: z.boolean(),
    blackjackOnlineEnabled: z.boolean(),
  }),
  blackjack: z.object({
    shoeDecks: z.number().int().min(1).max(16),
    dealerHitsSoft17: z.boolean(),
    modifiers: z.record(z.unknown()),
  }),
  progression: z.object({
    milestonesEnabled: z.boolean(),
  }),
  admin: z.object({
    discordUserAllowlist: z.array(z.string()).default([]),
  }),
  timeControls: z.object({
    presets: z.array(timeControlPresetSchema).min(1),
  }),
});

export type PazaakOpsPolicy = z.infer<typeof pazaakOpsPolicySchema>;
export type TimeControlPreset = z.infer<typeof timeControlPresetSchema>;
export type RegionDefinition = z.infer<typeof regionDefinitionSchema>;

export function parsePolicyJson(raw: unknown): PazaakOpsPolicy {
  return pazaakOpsPolicySchema.parse(raw);
}

import type { PazaakOpsPolicy } from "./schema.js";

/** Baked v1 defaults — merge overrides on top (runtime JSON, env, admin). */
export const PAZAAK_POLICY_DEFAULTS: PazaakOpsPolicy = {
  version: 1,
  timers: {
    turnTimerSeconds: 45,
    disconnectForfeitMs: 30_000,
    turnTimeoutMs: 300_000,
    reconnectGraceMs: 120_000,
  },
  matchmaking: {
    tickMs: 5000,
    queueWidenAfterMs: 15_000,
    regions: [
      { id: "auto", label: "Recommended" },
      { id: "enam", label: "North America", locationHint: "enam" },
      { id: "weur", label: "Western Europe", locationHint: "weur" },
      { id: "apac", label: "Asia-Pacific", locationHint: "apac" },
    ],
    defaultRegionId: "auto",
  },
  features: {
    workerMatchAuthority: false,
    dualWriteMatchesToWorker: false,
    dualWriteMatchesToBot: false,
    allowPrivateBackendUrl: true,
    blackjackOnlineEnabled: true,
  },
  blackjack: {
    shoeDecks: 6,
    dealerHitsSoft17: true,
    modifiers: {},
  },
  progression: {
    milestonesEnabled: true,
  },
  admin: {
    discordUserAllowlist: [],
  },
  timeControls: {
    presets: [
      { id: "blitz", label: "Blitz — 60s / turn", turnSeconds: 60, incrementSeconds: 0 },
      { id: "standard", label: "Standard — 45s / turn", turnSeconds: 45, incrementSeconds: 0 },
      { id: "rapid", label: "Rapid — 120s / turn", turnSeconds: 120, incrementSeconds: 0 },
      { id: "relaxed", label: "Relaxed — 300s / turn", turnSeconds: 300, incrementSeconds: 0 },
    ],
  },
};

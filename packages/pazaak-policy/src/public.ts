import type { PazaakOpsPolicy } from "./schema.js";
/** Safe subset for `GET /api/config/public` (no admin allowlists). */
export interface PublicPazaakConfig {
  version: 1;
  timers: Pick<PazaakOpsPolicy["timers"], "turnTimerSeconds">;
  matchmaking: {
    regions: PazaakOpsPolicy["matchmaking"]["regions"];
    defaultRegionId: string;
  };
  timeControls: PazaakOpsPolicy["timeControls"];
  features: Pick<PazaakOpsPolicy["features"], "blackjackOnlineEnabled" | "allowPrivateBackendUrl">;
}

export function toPublicConfig(policy: PazaakOpsPolicy): PublicPazaakConfig {
  return {
    version: 1,
    timers: {
      turnTimerSeconds: policy.timers.turnTimerSeconds,
    },
    matchmaking: {
      regions: policy.matchmaking.regions,
      defaultRegionId: policy.matchmaking.defaultRegionId,
    },
    timeControls: policy.timeControls,
    features: {
      blackjackOnlineEnabled: policy.features.blackjackOnlineEnabled,
      allowPrivateBackendUrl: policy.features.allowPrivateBackendUrl,
    },
  };
}

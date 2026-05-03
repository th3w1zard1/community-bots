import test from "node:test";
import assert from "node:assert/strict";

import { collectPolicyEnvOverrides, loadPazaakOpsPolicy } from "./merge.js";

test("loadPazaakOpsPolicy merges env scalar overrides", () => {
  const policy = loadPazaakOpsPolicy({
    PAZAAK_POLICY__TIMERS__TURN_TIMER_SECONDS: "90",
    PAZAAK_POLICY__FEATURES__WORKER_MATCH_AUTHORITY: "true",
  });
  assert.equal(policy.timers.turnTimerSeconds, 90);
  assert.equal(policy.features.workerMatchAuthority, true);
});

test("collectPolicyEnvOverrides builds nested structure", () => {
  const struct = collectPolicyEnvOverrides({
    PAZAAK_POLICY__MATCHMAKING__DEFAULT_REGION_ID: "weur",
  });
  assert.equal((struct.matchmaking as { defaultRegionId: string }).defaultRegionId, "weur");
});

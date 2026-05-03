import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";

import { cloneDefaultPolicy, deepMergePolicy } from "./merge.js";
import type { PazaakOpsPolicy } from "./schema.js";

/** Load policy from `.json`, `.yaml`, or `.yml` (relative or absolute path). */
export function loadPolicyFromFile(path: string): PazaakOpsPolicy {
  const raw = readFileSync(path, "utf8");
  const lower = path.toLowerCase();
  let parsed: unknown;
  if (lower.endsWith(".json")) {
    parsed = JSON.parse(raw) as unknown;
  } else if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    parsed = parseYaml(raw);
  } else {
    throw new Error(`Unsupported policy file extension: ${path}`);
  }
  return deepMergePolicy(cloneDefaultPolicy(), parsed);
}

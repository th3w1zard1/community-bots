import { PAZAAK_POLICY_DEFAULTS } from "./defaults.js";
import { type PazaakOpsPolicy, parsePolicyJson } from "./schema.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function cloneDefaultPolicy(): PazaakOpsPolicy {
  return parsePolicyJson(JSON.parse(JSON.stringify(PAZAAK_POLICY_DEFAULTS))) as PazaakOpsPolicy;
}

function deepMergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const bv = base[k];
    if (isPlainObject(bv) && isPlainObject(v)) {
      out[k] = deepMergeRecords(bv, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Deep-merge `patch` onto `base`, then validate (arrays/scalars from patch win). */
export function deepMergePolicy(base: PazaakOpsPolicy, patch: unknown): PazaakOpsPolicy {
  if (!isPlainObject(patch)) {
    return base;
  }
  const merged = deepMergeRecords(base as unknown as Record<string, unknown>, patch);
  return parsePolicyJson(merged);
}

const POLICY_ENV_PREFIX = "PAZAAK_POLICY__";

function parseEnvScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^-?\d*\.\d+$/.test(t)) return Number.parseFloat(t);
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return t;
  }
}

function setPath(root: Record<string, unknown>, path: string[], value: unknown): void {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const p = path[i]!;
    const next = cur[p];
    if (!isPlainObject(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

/** Build a nested object from env keys like `PAZAAK_POLICY__TIMERS__TURN_TIMER_SECONDS`. */
export function collectPolicyEnvOverrides(env: Record<string, string | undefined>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(env)) {
    if (!key.startsWith(POLICY_ENV_PREFIX) || val === undefined) continue;
    const tail = key.slice(POLICY_ENV_PREFIX.length);
    if (!tail) continue;
    const segments = tail
      .split("__")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0) continue;
    const snakeToCamel = (s: string) =>
      s.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const path = segments.map(snakeToCamel);
    setPath(root, path, parseEnvScalar(val));
  }
  return root;
}

export interface LoadPolicyOptions {
  /** Starting point (e.g. file-loaded policy); defaults used when omitted. */
  basePolicy?: PazaakOpsPolicy;
  /** Raw JSON object merged on top (e.g. DO-stored admin blob). */
  jsonOverride?: unknown;
  /** Single JSON string (`PAZAAK_POLICY_JSON`). */
  jsonEnv?: string | undefined;
}

/** Resolved policy: base → `PAZAAK_POLICY_JSON` → `PAZAAK_POLICY__*` keys → jsonOverride. */
export function loadPazaakOpsPolicy(
  env: Record<string, string | undefined>,
  options: LoadPolicyOptions = {},
): PazaakOpsPolicy {
  let policy = options.basePolicy ?? cloneDefaultPolicy();

  const jsonRaw = options.jsonEnv?.trim() ?? env.PAZAAK_POLICY_JSON?.trim();
  if (jsonRaw) {
    try {
      const partial = JSON.parse(jsonRaw) as unknown;
      policy = deepMergePolicy(policy, partial);
    } catch {
      /* ignore malformed JSON */
    }
  }

  const envStruct = collectPolicyEnvOverrides(env);
  if (Object.keys(envStruct).length > 0) {
    policy = deepMergePolicy(policy, envStruct);
  }

  if (options.jsonOverride !== undefined) {
    policy = deepMergePolicy(policy, options.jsonOverride);
  }

  return policy;
}

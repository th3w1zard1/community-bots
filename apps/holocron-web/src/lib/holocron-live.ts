/** Tiny helpers so Holocron motion can track the *current* question text without spamming the DOM. */

const STOP = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'have',
  'has',
  'was',
  'were',
  'are',
  'you',
  'your',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'why',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'into',
  'about',
  'there',
  'their',
  'them',
  'then',
  'than',
  'some',
  'any',
  'all',
  'not',
  'but',
])

/** Stable 32-bit fingerprint for tying animation phase to the active query string. */
export function holocronQuerySignature(text: string): number {
  let h = 2166136261 >>> 0
  const s = text.trim().toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Pull a short stream of “shard” tokens from natural-language queries (holocron glyphs). */
export function fluxTokensFromQuery(text: string, maxTokens = 8): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w))

  const out: string[] = []
  const seen = new Set<string>()
  for (const w of raw) {
    const key = w.slice(0, 24)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= maxTokens) break
  }
  return out
}

/** Mulberry32 PRNG — deterministic from a seed (e.g. query signature). */
export function holocronMulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

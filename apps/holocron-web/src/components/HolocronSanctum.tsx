import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { HOLOCRON_FRAME_SRCS } from '@/lib/holocron-frames'
import { fluxTokensFromQuery, holocronMulberry32 } from '@/lib/holocron-live'

const HERO_VIDEO_SRC = '/holocron/holocron-hero-loop.mp4'

export type HolocronActivityMood = 'idle' | 'retrieve' | 'success' | 'warn' | 'hot'

const FRAME_INTERVAL_MS_BASE = 520

export type HolocronSourceZone = 'deadlystream' | 'lucasforums' | 'kotor' | 'modding' | 'core'

export type HolocronFluxEvent = {
  id: string
  words: string
  zone: HolocronSourceZone
  createdAt: number
}

/** Short-lived glyphs driven by server `liveTrace` (shared across viewers polling the same thread). */
export type HolocronRetrievalPulse = {
  id: string
  words: string
  zone: HolocronSourceZone
  /** Trace phases gravitate in; source hits egress outward to facets. */
  direction: 'in' | 'out'
  createdAt: number
}

type HolocronSanctumProps = {
  queryFlux: HolocronFluxEvent[]
  answerFlux: HolocronFluxEvent[]
  sourceMetrics: Partial<Record<HolocronSourceZone, number>>
  totalInteractions: number
  isProcessing: boolean
  /** Increment when an answer completes so the shell plays a short rim “bond” pulse. */
  answerBondTicks?: number
  /**
   * Fingerprint of the active / last-submitted query so drift, frame cadence, and specs
   * stay tied to what is actually being searched instead of a generic loop.
   */
  querySignature?: number
  /** Live composer preview — faint looping shards before submit (same coordinate space as flux). */
  draftQuery?: string
  /** Server-backed retrieval timeline (`GET /api/trask/thread/:id` → `liveTrace`). */
  livePulses?: HolocronRetrievalPulse[]
}

type ZonePoint = {
  x: number
  y: number
}

const ZONE_COORDS: Record<HolocronSourceZone, ZonePoint> = {
  deadlystream: { x: -34, y: -24 },
  lucasforums: { x: 34, y: -20 },
  kotor: { x: -30, y: 26 },
  modding: { x: 30, y: 24 },
  core: { x: 0, y: 0 },
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export function zoneFromSourceLabel(label: string): HolocronSourceZone {
  const v = label.toLowerCase()
  if (v.includes('deadlystream')) return 'deadlystream'
  if (v.includes('lucasforumsarchive') || v.includes('lucas') || v.includes('forum')) return 'lucasforums'
  if (v.includes('kotor') || v.includes('reddit')) return 'kotor'
  if (v.includes('mod') || v.includes('wiki') || v.includes('doc')) return 'modding'
  return 'core'
}

/** Deterministic zone from user query so inbound glyphs originate from varied facets before sources exist. */
export function zoneFromQueryText(query: string): HolocronSourceZone {
  const zones: HolocronSourceZone[] = ['deadlystream', 'lucasforums', 'kotor', 'modding', 'core']
  let h = 0
  for (let i = 0; i < query.length; i++) {
    h = (h * 31 + query.charCodeAt(i)) >>> 0
  }
  return zones[h % zones.length]!
}

/** Prefer archive names / topics hit in the literal query so shards hug the correct facet when possible. */
export function zoneFromQueryKeyTerms(query: string): HolocronSourceZone {
  const v = query.toLowerCase()
  if (v.includes('deadlystream') || /\bdeadly\s*stream\b/.test(v)) return 'deadlystream'
  if (v.includes('lucasforumsarchive') || v.includes('lucasforums') || /\blucas\s*forums?\b/.test(v))
    return 'lucasforums'
  if (v.includes('reddit') || v.includes('kotor') || v.includes('tsl') || v.includes('swtor'))
    return 'kotor'
  if (v.includes('mod') || v.includes('wiki') || v.includes('nexus') || v.includes('toolset')) return 'modding'
  return zoneFromQueryText(query)
}

/** Spread later shards across facets so concurrent glyphs don’t stack on one node. */
export function shardZoneForToken(query: string, token: string, index: number): HolocronSourceZone {
  const zones: HolocronSourceZone[] = ['deadlystream', 'lucasforums', 'kotor', 'modding', 'core']
  const mix = `${query}\n${token}\n${index}`
  let h = 0
  for (let i = 0; i < mix.length; i++) {
    h = (h * 31 + mix.charCodeAt(i)) >>> 0
  }
  return zones[h % zones.length]!
}

export function HolocronSanctum({
  queryFlux,
  answerFlux,
  sourceMetrics,
  totalInteractions,
  isProcessing,
  answerBondTicks = 0,
  querySignature = 0,
  draftQuery = '',
  livePulses = [],
}: HolocronSanctumProps) {
  const [artifactBroken, setArtifactBroken] = useState(false)
  const [heroVideoBroken, setHeroVideoBroken] = useState(false)
  const [bondFlash, setBondFlash] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [activityMood, setActivityMood] = useState<HolocronActivityMood>('idle')
  const successGlowUntilRef = useRef(0)

  useEffect(() => {
    if (answerBondTicks > 0) {
      successGlowUntilRef.current = Date.now() + 2800
    }
  }, [answerBondTicks])

  useEffect(() => {
    const id = window.setInterval(() => {
      const srcSum = (Object.keys(ZONE_COORDS) as HolocronSourceZone[]).reduce(
        (acc, z) => acc + (sourceMetrics[z] ?? 0),
        0,
      )
      let mood: HolocronActivityMood = 'idle'
      if (isProcessing) {
        mood = 'retrieve'
      } else if (Date.now() < successGlowUntilRef.current) {
        mood = 'success'
      } else if (srcSum >= 20 || totalInteractions >= 42) {
        mood = 'hot'
      } else if (srcSum >= 8 || totalInteractions >= 18) {
        mood = 'warn'
      }
      setActivityMood(mood)
    }, FRAME_INTERVAL_MS_BASE)
    return () => window.clearInterval(id)
  }, [isProcessing, sourceMetrics, totalInteractions])

  const frameStride = isProcessing ? 2 : 1
  const frameMs = Math.round(
    FRAME_INTERVAL_MS_BASE * (isProcessing ? 0.62 : 0.92) - (querySignature % 140) * 0.15,
  )

  useEffect(() => {
    const n = HOLOCRON_FRAME_SRCS.length
    if (n <= 0) return
    setFrameIndex(querySignature % n)
  }, [querySignature])

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrameIndex((i) => {
        const n = HOLOCRON_FRAME_SRCS.length
        if (n <= 0) return 0
        return (i + frameStride) % n
      })
    }, Math.max(240, frameMs))
    return () => window.clearInterval(id)
  }, [frameStride, frameMs])

  useEffect(() => {
    if (!answerBondTicks) return
    setBondFlash(true)
    const t = window.setTimeout(() => setBondFlash(false), 1100)
    return () => window.clearTimeout(t)
  }, [answerBondTicks])
  const auraGain = clamp(totalInteractions / 26, 0, 1)
  const sigPulse =
    2600 + (querySignature % 900) - Math.round(auraGain * 420) - (isProcessing ? 520 : 0)
  const auraPulseMs = clamp(sigPulse, 1680, 4200)
  const ambientSpecs =
    26 + Math.round(auraGain * 40) + (isProcessing ? 14 : 0) + ((querySignature >>> 3) % 9)

  const specField = useMemo(() => {
    const rnd = holocronMulberry32((querySignature ^ (isProcessing ? 0x85ebca6b : 0)) >>> 0)
    return Array.from({ length: ambientSpecs }, (_, i) => ({
      id: `ambient-${querySignature}-${i}`,
      x: rnd() * 100,
      y: rnd() * 100,
      delay: `${(rnd() * 1.8).toFixed(2)}s`,
      dur: `${3.8 + rnd() * 3.4}s`,
    }))
  }, [ambientSpecs, querySignature, isProcessing])

  const zones = useMemo(
    () =>
      (Object.keys(ZONE_COORDS) as HolocronSourceZone[]).map((zone) => ({
        zone,
        point: ZONE_COORDS[zone],
        count: sourceMetrics[zone] ?? 0,
      })),
    [sourceMetrics],
  )

  const retrievalRipples = useMemo(() => {
    if (!isProcessing) return []
    const all = Object.keys(ZONE_COORDS) as HolocronSourceZone[]
    const rnd = holocronMulberry32((querySignature ^ 0x9e3779b9) >>> 0)
    const picks: HolocronSourceZone[] = []
    let guard = 0
    while (picks.length < 3 && guard < 24) {
      guard++
      const cand = all[Math.floor(rnd() * all.length)]!
      if (!picks.includes(cand)) picks.push(cand)
    }
    return picks.map((zone, i) => ({
      zone,
      delay: `${i * 0.38 + (rnd() * 0.22).toFixed(2)}s`,
    }))
  }, [isProcessing, querySignature])

  return (
    <div className={`holocron-sanctum holocron-sanctum--mood-${activityMood}`} aria-hidden>
      <div className="holocron-sanctum__veil" />
      <div className="holocron-sanctum__flare" />

      <div className="holocron-sanctum__spec-field">
        {specField.map((dot) => (
          <span
            key={dot.id}
            className="holocron-sanctum__spec"
            style={
              {
                '--sx': `${dot.x}%`,
                '--sy': `${dot.y}%`,
                '--sd': dot.delay,
                '--dur': dot.dur,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div
        className={`holocron-core-shell ${isProcessing ? 'is-processing' : ''} ${bondFlash ? 'holocron-core-shell--bond' : ''} ${artifactBroken ? 'holocron-core-shell--no-artifact' : ''}`}
        style={
          {
            '--aura-pulse': `${auraPulseMs}ms`,
            '--holocron-chip-tempo': isProcessing ? '4.9s' : '7.5s',
            '--holocron-chip-tempo-b': isProcessing ? '6.1s' : '9.2s',
          } as CSSProperties
        }
      >
        <div className="holocron-core-shell__halo" />
        {!artifactBroken ? (
          <>
            {!heroVideoBroken ? (
              <video
                className="holocron-core-shell__artifact holocron-core-shell__hero-video"
                src={HERO_VIDEO_SRC}
                muted
                playsInline
                loop
                autoPlay
                aria-hidden
                onError={() => setHeroVideoBroken(true)}
              />
            ) : (
              <img
                src={HOLOCRON_FRAME_SRCS[frameIndex] ?? '/holocron/holocron-artifact.png'}
                alt=""
                className="holocron-core-shell__artifact holocron-core-shell__artifact--frames"
                onError={() => setArtifactBroken(true)}
              />
            )}
            <div className="holocron-core-shell__chip-field holocron-core-shell__chip-field--a" aria-hidden />
            <div className="holocron-core-shell__chip-field holocron-core-shell__chip-field--b" aria-hidden />
          </>
        ) : null}
        <div className="holocron-core-shell__outer" />
        <div className="holocron-core-shell__inner" />
      </div>

      {retrievalRipples.map(({ zone, delay }) => {
        const p = ZONE_COORDS[zone]
        return (
          <span
            key={`ripple-${zone}-${querySignature}`}
            className="holocron-retrieval-ripple"
            style={
              {
                '--zx': `${p.x}%`,
                '--zy': `${p.y}%`,
                '--rdelay': delay,
              } as CSSProperties
            }
          />
        )
      })}

      {zones.map(({ zone, point, count }) => (
        <div
          key={zone}
          className={`holocron-zone-node ${count > 0 ? 'holocron-zone-node--live' : ''}`}
          style={
            {
              '--zx': `${point.x}%`,
              '--zy': `${point.y}%`,
              '--zi': count === 0 ? 0 : clamp(count / 8, 0.15, 1),
            } as CSSProperties
          }
        />
      ))}

      {queryFlux.map((event) => {
        const p = ZONE_COORDS[event.zone]
        const jx = (((event.id.charCodeAt(2) ?? 0) * 17) % 41) - 20
        const jy = (((event.id.charCodeAt(4) ?? 0) * 13) % 31) - 15
        const seed = (event.id.codePointAt(0) ?? 0) + (event.words.length << 3)
        const durIn = 1.85 + (seed % 70) / 100
        const delay = ((seed % 28) / 100).toFixed(2)
        return (
          <span
            key={event.id}
            className="holocron-word-flux holocron-word-flux--in"
            style={
              {
                '--sx': `${p.x}%`,
                '--sy': `${p.y}%`,
                '--jx': `${jx}px`,
                '--jy': `${jy}px`,
                '--flux-in-dur': `${durIn}s`,
                '--flux-delay': `${delay}s`,
              } as CSSProperties
            }
          >
            {event.words}
          </span>
        )
      })}

      {draftQuery.trim().length >= 4
        ? fluxTokensFromQuery(draftQuery).map((tok, i) => {
            const zone =
              i === 0 ? zoneFromQueryKeyTerms(draftQuery) : shardZoneForToken(draftQuery, tok, i)
            const p = ZONE_COORDS[zone]
            const jx = ((tok.codePointAt(0) ?? i) * 17) % 41 - 20
            const jy = ((tok.codePointAt(1) ?? i * 3) * 13) % 31 - 15
            return (
              <span
                key={`draft-${tok}-${i}`}
                className="holocron-word-flux holocron-word-flux--draft"
                style={
                  {
                    '--sx': `${p.x}%`,
                    '--sy': `${p.y}%`,
                    '--jx': `${jx}px`,
                    '--jy': `${jy}px`,
                    '--draft-phase': i,
                  } as CSSProperties
                }
              >
                {tok}
              </span>
            )
          })
        : null}

      {answerFlux.map((event) => {
        const p = ZONE_COORDS[event.zone]
        const jx = (((event.id.charCodeAt(3) ?? 0) * 19) % 41) - 20
        const jy = (((event.id.charCodeAt(5) ?? 0) * 11) % 31) - 15
        const seed = (event.id.codePointAt(1) ?? 0) + (event.words.length << 2)
        const durOut = 2.35 + (seed % 90) / 100
        const delay = ((seed % 22) / 100).toFixed(2)
        return (
          <span
            key={event.id}
            className="holocron-word-flux holocron-word-flux--out"
            style={
              {
                '--tx': `${p.x}%`,
                '--ty': `${p.y}%`,
                '--jx': `${jx}px`,
                '--jy': `${jy}px`,
                '--flux-out-dur': `${durOut}s`,
                '--flux-delay': `${delay}s`,
              } as CSSProperties
            }
          >
            {event.words}
          </span>
        )
      })}

      {livePulses.map((pulse) => {
        const p = ZONE_COORDS[pulse.zone]
        const jx = (((pulse.id.charCodeAt(4) ?? 0) * 13) % 41) - 20
        const jy = (((pulse.id.charCodeAt(6) ?? 0) * 11) % 31) - 15
        const seed = pulse.id.codePointAt(2) ?? 0
        const dur = pulse.direction === 'in' ? `${1.65 + (seed % 60) / 100}s` : `${2.05 + (seed % 70) / 100}s`
        const delay = ((seed % 20) / 100).toFixed(2)
        if (pulse.direction === 'in') {
          return (
            <span
              key={pulse.id}
              className="holocron-word-flux holocron-word-flux--in holocron-word-flux--pulse"
              style={
                {
                  '--sx': `${p.x}%`,
                  '--sy': `${p.y}%`,
                  '--jx': `${jx}px`,
                  '--jy': `${jy}px`,
                  '--flux-in-dur': dur,
                  '--flux-delay': `${delay}s`,
                } as CSSProperties
              }
            >
              {pulse.words}
            </span>
          )
        }
        return (
          <span
            key={pulse.id}
            className="holocron-word-flux holocron-word-flux--out holocron-word-flux--pulse"
            style={
              {
                '--tx': `${p.x}%`,
                '--ty': `${p.y}%`,
                '--jx': `${jx}px`,
                '--jy': `${jy}px`,
                '--flux-out-dur': dur,
                '--flux-delay': `${delay}s`,
              } as CSSProperties
            }
          >
            {pulse.words}
          </span>
        )
      })}
    </div>
  )
}

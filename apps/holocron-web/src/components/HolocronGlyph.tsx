import { Sparkle } from '@phosphor-icons/react'
import { useState } from 'react'

type HolocronGlyphProps = {
  variant: 'header' | 'hero'
  className?: string
}

/**
 * Uses repo asset when present; falls back to Sparkle so dev/prod never shows a broken image.
 */
export function HolocronGlyph({ variant, className = '' }: HolocronGlyphProps) {
  const [useFallback, setUseFallback] = useState(false)

  if (useFallback) {
    const size = variant === 'hero' ? 72 : 28
    return (
      <Sparkle
        size={size}
        weight="duotone"
        className={`text-accent shrink-0 drop-shadow-[0_0_12px_rgba(56,189,248,0.45)] ${className}`}
        aria-hidden
      />
    )
  }

  const dim = variant === 'hero' ? 'holocron-artifact-hero mb-5 select-none' : 'holocron-header-glyph shrink-0 rounded-sm ring-1 ring-accent/35'

  return (
    <img
      src="/holocron/holocron-artifact.png"
      alt=""
      className={`${dim} ${className}`}
      onError={() => setUseFallback(true)}
    />
  )
}

import { useEffect, useState } from "react";

interface PazaakAssetProps {
  src?: string;
  fallback?: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  size?: "sm" | "md" | "lg" | "xl";
  type?: "card" | "character" | "background" | "avatar" | "icon";
}

/**
 * PazaakAsset renders game assets with fallback support
 * Assets can be:
 * - Real images from CDN or local assets
 * - Generated from prompt+seed as deterministic inline SVG art
 * - Unicode/CSS-based fallbacks for instant display
 */
export function PazaakAsset({
  src,
  fallback = "◆",
  alt,
  className = "",
  style = {},
  size = "md",
  type = "icon",
}: PazaakAssetProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [src]);

  const shouldShowImage = src && !imageError;
  const sizePx: Record<string, number> = {
    sm: 32,
    md: 64,
    lg: 128,
    xl: 256,
  };
  const px = sizePx[size];

  const combinedClassName = `pazaak-asset pazaak-asset--${type} pazaak-asset--${size} ${className}`;
  const combinedStyle: React.CSSProperties = {
    ...style,
    width: px,
    height: px,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  };

  if (shouldShowImage && !imageError) {
    return (
      <div className={combinedClassName} style={combinedStyle}>
        <img
          src={src}
          alt={alt}
          onError={() => setImageError(true)}
          onLoad={() => setImageLoaded(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "inherit",
            opacity: imageLoaded ? 1 : 0,
            transition: "opacity 0.3s ease-out",
          }}
        />
        {!imageLoaded && (
          <div
            style={{
              position: "absolute",
              fontSize: `${px * 0.5}px`,
              opacity: 0.3,
            }}
            aria-hidden="true"
          >
            {fallback}
          </div>
        )}
      </div>
    );
  }

  // Fallback: Unicode or CSS-based display
  return (
    <div
      className={combinedClassName}
      style={{
        ...combinedStyle,
        fontSize: `${px * 0.6}px`,
        color: "var(--accent)",
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
      title={alt}
    >
      {fallback}
    </div>
  );
}

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const toHex = (value: number): string => value.toString(16).padStart(2, "0");

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const pickColor = (rng: () => number, alpha = 1): string => {
  const r = clampChannel(40 + rng() * 190);
  const g = clampChannel(30 + rng() * 170);
  const b = clampChannel(25 + rng() * 145);
  if (alpha >= 1) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
};

const escapeXml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const parseSize = (value?: string): { width: number; height: number } => {
  const match = value?.trim().match(/^(\d{2,4})x(\d{2,4})$/i);
  if (!match) {
    return { width: 256, height: 256 };
  }
  const width = Math.max(64, Math.min(1024, Number.parseInt(match[1], 10)));
  const height = Math.max(64, Math.min(1024, Number.parseInt(match[2], 10)));
  return { width, height };
};

/**
 * Generate a deterministic prompt-based image URL as an inline SVG.
 * This keeps rendering local/browser-safe while still producing unique art per prompt.
 */
export function generateAiImageUrl(prompt: string, options?: { size?: string; seed?: number }): string {
  const normalizedPrompt = prompt.trim().length > 0 ? prompt.trim() : "Pazaak";
  const { width, height } = parseSize(options?.size);
  const computedSeed = options?.seed ?? hashString(normalizedPrompt.toLowerCase());
  const rng = mulberry32(computedSeed);

  const colorA = pickColor(rng);
  const colorB = pickColor(rng);
  const colorC = pickColor(rng);
  const glow = pickColor(rng, 0.32);
  const ringCount = 4 + Math.floor(rng() * 4);

  const rings = Array.from({ length: ringCount }, (_, index) => {
    const cx = (0.15 + rng() * 0.7) * width;
    const cy = (0.15 + rng() * 0.7) * height;
    const radius = (0.12 + rng() * 0.32) * Math.min(width, height);
    const stroke = 1 + Math.floor(rng() * 4);
    const opacity = (0.2 + rng() * 0.35).toFixed(2);
    return `<circle cx=\"${cx.toFixed(2)}\" cy=\"${cy.toFixed(2)}\" r=\"${radius.toFixed(2)}\" fill=\"none\" stroke=\"${index % 2 === 0 ? colorB : colorC}\" stroke-opacity=\"${opacity}\" stroke-width=\"${stroke}\" />`;
  }).join("");

  const words = normalizedPrompt.split(/\s+/).slice(0, 3).join(" ");
  const label = escapeXml(words.length > 24 ? `${words.slice(0, 23)}...` : words);

  const svg = [
    `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${width}\" height=\"${height}\" viewBox=\"0 0 ${width} ${height}\" role=\"img\" aria-label=\"${escapeXml(normalizedPrompt)}\">`,
    "<defs>",
    `<linearGradient id=\"bg\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"${colorA}\"/><stop offset=\"50%\" stop-color=\"${colorB}\"/><stop offset=\"100%\" stop-color=\"${colorC}\"/></linearGradient>`,
    `<radialGradient id=\"glow\" cx=\"50%\" cy=\"50%\" r=\"65%\"><stop offset=\"0%\" stop-color=\"${glow}\"/><stop offset=\"100%\" stop-color=\"rgba(0,0,0,0)\"/></radialGradient>`,
    "</defs>",
    `<rect x=\"0\" y=\"0\" width=\"${width}\" height=\"${height}\" fill=\"url(#bg)\"/>`,
    `<rect x=\"0\" y=\"0\" width=\"${width}\" height=\"${height}\" fill=\"url(#glow)\"/>`,
    rings,
    `<rect x=\"8\" y=\"${height - 44}\" width=\"${width - 16}\" height=\"32\" rx=\"10\" fill=\"rgba(10, 12, 18, 0.48)\"/>`,
    `<text x=\"50%\" y=\"${height - 22}\" text-anchor=\"middle\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"14\" fill=\"#f5f2e8\">${label}</text>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Card asset with KOTOR-themed styling
 */
export function CardAsset({ cardValue, variant }: { cardValue: number; variant?: "main" | "side" }) {
  return (
    <div
      className="card-asset"
      style={{
        width: "80px",
        height: "120px",
        backgroundColor: variant === "side" ? "var(--warn)" : "var(--accent)",
        border: "2px solid var(--text)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "32px",
        fontWeight: "bold",
        color: "#0c0906",
        textShadow: "1px 1px 2px rgba(255,255,255,0.3)",
        boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
      }}
    >
      {cardValue > 0 ? `+${cardValue}` : cardValue}
    </div>
  );
}

/**
 * Character portrait with fallback
 */
export function CharacterPortrait({
  name,
  difficulty,
  src,
}: {
  name: string;
  difficulty: string;
  src?: string;
}) {
  const difficultyEmoji: Record<string, string> = {
    novice: "⭐",
    advanced: "⭐⭐",
    expert: "⭐⭐⭐",
    master: "⭐⭐⭐⭐",
    professional: "🏆",
  };

  return (
    <div className="character-portrait">
      <PazaakAsset
        src={src}
        fallback="◌"
        alt={name}
        type="character"
        size="lg"
        style={{
          borderRadius: "var(--radius-lg)",
          border: "2px solid var(--accent)",
        }}
      />
      <div className="character-info">
        <h4>{name}</h4>
        <p className="character-difficulty">{difficultyEmoji[difficulty] || "⭐"} {difficulty}</p>
      </div>
    </div>
  );
}

---
title: Holocron Archive Tales-of-the-Jedi visual layer
type: feat
status: completed
date: 2026-05-02
---

# Holocron Archive — Tales of the Jedi visual layer

## Overview

Ground Holocron Archive in **1990s Dark Horse *Tales of the Jedi*** cues: earthy parchment and royal purple inks (Pamela Rambo palette notes), halftone print, bronze/teal accents for Jedi tech — **fan-made tone**, no studio logos or recognizable character likenesses in prompts.

## Requirements trace

- R1. Lore-adjacent palette and typography without copying specific covers.
- R2. Repo-local raster assets (HF MCP generation → committed PNGs under `apps/holocron-web/public/holocron/`).
- R3. Subtle motion (float/pulse) on hero holocron prop; non-blocking overlays.

## Implementation (done)

- **Assets:** `totj-cinematic-panel.png` (wide halftone vignette plate), `holocron-artifact.png` (centered prop) via `user-hf-mcp-server` `gr3_z_image_turbo_mcp_generate`.
- **UI:** `apps/holocron-web/src/index.css` — atmosphere layers, halftone grid, vignette, `holocron-float`, TotJ-tuned OKLCH tokens; `apps/holocron-web/src/App.tsx` — wires layers + images; `apps/holocron-web/index.html` — Cinzel for serif captions.
- **Regeneration:** Re-run MCP image tools with similar prompts; replace files in `apps/holocron-web/public/holocron/` and rebuild.

## Non-goals

- Disney/Lucasfilm trademarked logotypes; identifiable character art.
- Video/GIF animations in-repo (CSS-only motion first).

## Sources

- Wikipedia / Dark Horse listings for series context (era, publishers — not for copying art).
- Comic palette characterization: warm earth tones + ancient-setting framing.

# Holocron live metrics vs animation

The sanctum animates **query words** (inbound) and **answer fragments** (outbound) using client state. **Source-derived zones** (`deadlystream`, `lucasforums`, etc.) come from `TraskQueryRecord.sources` after `/api/trask/ask` completes — see `zoneFromSourceLabel` in `HolocronSanctum.tsx`.

**Gap:** Per-retrieval / per-scrape progress (e.g. “currently fetching deadlystream”) is **not** exposed on the public Trask DTO consumed by the SPA. Until the API streams research steps or intermediate tool events, facet pulses during retrieval remain **best-effort** (`isProcessing` halo only). Mapping each flying spec to an individual scrape event would require backend events or SSE.

**Video loop:** Optional hero file `public/holocron/holocron-hero-loop.mp4` is supported by `HolocronSanctum` when present; HF WAN i2v generation may be retried offline if MCP timeouts occur.

**Hero still (latest):** `holocron-artifact.png` — sourced from Imgur album https://imgur.com/a/RwZA9vk (`i.imgur.com/iTGKv8P.png`), **symmetric horizontal crop (~36% margin each side)** to drop Trask UI columns/text without inpainting the pyramid (inpainting caused wing artifacts). Duplicate filenames: `holocron-archive-clean.png`, `holocron-imgur-trask-ui-stripped.png`. Older HF gens remain as `holocron-archive-v5-three-face.png`, etc.

**Frame reel:** Twenty PNG stills live under `public/holocron/frames/holo-00.png` … `holo-19.png`. The sanctum cycles them (~520 ms) when video is absent; URLs are listed in `src/lib/holocron-frames.ts`. Generations used **20 separate** `gr3_z_image_turbo_mcp_generate` calls with distinct lore-heavy prompts (Flux Schnell / Qwen Spaces often return WebP and may fail MCP decode—curl the URL if needed). Bonus sample: `frames/gen-flux-krea-05.webp`.

**Orb mood tint:** CSS classes `holocron-sanctum--mood-{idle|retrieve|success|warn|hot}` drive halo/flare/drop-shadow variables—idle light blue, retrieving cyan, brief neon green after answers, orange/red when cumulative source hits or interaction counts climb (see `HolocronSanctum.tsx`).
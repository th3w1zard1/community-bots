/** Twenty HF-generated square-pyramid holocron stills (diverse lore prompts); cycled in `HolocronSanctum`. */
export const HOLOCRON_FRAME_SRCS: readonly string[] = Array.from(
  { length: 20 },
  (_, i) => `/holocron/frames/holo-${String(i).padStart(2, '0')}.png`,
)

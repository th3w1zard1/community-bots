import type { PazaakTableTheme } from "./types.ts";

/** Shell preset aligned with ModSync style dictionaries (K1 / TSL / Light). */
export type KotorShellPreset = "k1" | "tsl" | "light";

/** Map in-game table theme to UI shell (see ModSync KotorStyle / Kotor2Style / LightStyle). */
export function shellPresetFromTableTheme(theme: PazaakTableTheme): KotorShellPreset {
  if (theme === "malachor") {
    return "tsl";
  }
  if (theme === "coruscant") {
    return "light";
  }
  return "k1";
}

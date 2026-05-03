import {
  getDefaultPazaakOpponentForAdvisorDifficulty,
  getPazaakOpponentById,
  pazaakOpponents,
  type PazaakOpponentPhraseKey,
  type PazaakOpponentProfile,
} from "@openkotor/pazaak-engine/opponents";
import type { AdvisorDifficulty } from "./types.ts";

export type LocalOpponentPhraseKey = PazaakOpponentPhraseKey;

export type LocalOpponentProfile = Omit<PazaakOpponentProfile, "difficulty" | "advisorDifficulty"> & {
  difficulty: AdvisorDifficulty;
  vendorDifficulty: PazaakOpponentProfile["difficulty"];
};

const toLocalOpponent = (opponent: PazaakOpponentProfile): LocalOpponentProfile => ({
  ...opponent,
  difficulty: opponent.advisorDifficulty,
  vendorDifficulty: opponent.difficulty,
});

export const localOpponents: readonly LocalOpponentProfile[] = pazaakOpponents.map(toLocalOpponent);

export const getDefaultLocalOpponentForDifficulty = (difficulty: AdvisorDifficulty): LocalOpponentProfile => {
  return toLocalOpponent(getDefaultPazaakOpponentForAdvisorDifficulty(difficulty));
};

export const getLocalOpponentById = (opponentId?: string): LocalOpponentProfile | undefined => {
  const opponent = getPazaakOpponentById(opponentId);
  return opponent ? toLocalOpponent(opponent) : undefined;
};

export const pickOpponentPhrase = (
  opponent: LocalOpponentProfile,
  key: LocalOpponentPhraseKey,
  previousLine?: string,
  fallback = "...",
): string => {
  const lines = opponent.phrases[key];
  if (lines.length === 0) {
    return fallback;
  }

  if (lines.length === 1) {
    return lines[0] ?? fallback;
  }

  const filtered = lines.filter((line: string) => line !== previousLine);
  const pool = filtered.length > 0 ? filtered : lines;
  return pool[Math.floor(Math.random() * pool.length)] ?? fallback;
};

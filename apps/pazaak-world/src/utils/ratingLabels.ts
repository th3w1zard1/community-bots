/**
 * Player-facing rating strings (Chess.com vocabulary: MMR ≈ displayed rating, RD = rating deviation).
 * Numeric defaults mirror `@openkotor/pazaak-rating` (`PAZAAK_DEFAULT_RD`); update if that package changes.
 */
const RD_FALLBACK = 350;

export function formatWalletRatingLine(mmr: number, mmrRd: number | undefined): string {
  const rd = typeof mmrRd === "number" && Number.isFinite(mmrRd) ? mmrRd : RD_FALLBACK;
  return `${mmr} MMR · RD ${Math.round(rd)}`;
}

export function formatCornerRatingSubtitle(mmr: number, mmrRd: number | undefined): string {
  return formatWalletRatingLine(mmr, mmrRd);
}

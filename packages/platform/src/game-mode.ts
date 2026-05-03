export const CARD_GAME_TYPES = ["pazaak", "blackjack", "poker"] as const;

export type CardGameType = (typeof CARD_GAME_TYPES)[number];

export interface CardWorldConfig {
  botGameType: CardGameType;
  defaultPublicGameType: CardGameType;
  pazaakRequiresOwnershipProof: boolean;
  acceptedOwnershipProofFilenames: readonly string[];
}

/** Values that might arrive from env, JSON, or query strings before narrowing to {@link CardGameType}. */
export type UntrustedCardGameTypeInput =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | object;

export const isCardGameType = (value: UntrustedCardGameTypeInput): value is CardGameType => {
  return typeof value === "string" && (CARD_GAME_TYPES as readonly string[]).includes(value);
};

export const normalizeCardGameType = (
  value: UntrustedCardGameTypeInput,
  fallback: CardGameType = "blackjack",
): CardGameType => {
  return isCardGameType(value) ? value : fallback;
};
export declare const CARD_GAME_TYPES: readonly ["pazaak", "blackjack", "poker"];
export type CardGameType = (typeof CARD_GAME_TYPES)[number];
export interface CardWorldConfig {
    botGameType: CardGameType;
    defaultPublicGameType: CardGameType;
    pazaakRequiresOwnershipProof: boolean;
    acceptedOwnershipProofFilenames: readonly string[];
}
/** Values that might arrive from env, JSON, or query strings before narrowing to {@link CardGameType}. */
export type UntrustedCardGameTypeInput = string | number | boolean | bigint | symbol | null | undefined | object;
export declare const isCardGameType: (value: UntrustedCardGameTypeInput) => value is CardGameType;
export declare const normalizeCardGameType: (value: UntrustedCardGameTypeInput, fallback?: CardGameType) => CardGameType;

import React, { useMemo, useState } from "react";
import { dealerShouldHit } from "@openkotor/blackjack-engine";
import {
  playDrawSound,
  playPositiveSound,
  playNegativeSound,
  playVictorySound,
} from "../utils/soundManager.ts";

interface LocalBlackjackGameProps {
  username: string;
  onExit: () => void;
}

type BlackjackCard = {
  rank: string;
  suit: string;
  value: number;
};

type HandOutcome = "playing" | "won" | "lost" | "push";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS: ReadonlyArray<{ rank: string; value: number }> = [
  { rank: "A", value: 11 },
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 10 },
  { rank: "Q", value: 10 },
  { rank: "K", value: 10 },
];

const createShuffledDeck = (): BlackjackCard[] => {
  const deck: BlackjackCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank: rank.rank, value: rank.value });
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

const getHandValue = (cards: readonly BlackjackCard[]): number => {
  let total = cards.reduce((sum, card) => sum + card.value, 0);
  let aces = cards.filter((card) => card.rank === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
};

const drawCard = (deck: BlackjackCard[]): BlackjackCard => {
  const card = deck.pop();
  if (!card) {
    throw new Error("Deck exhausted.");
  }
  return card;
};

const formatCard = (card: BlackjackCard): string => `${card.rank}${card.suit}`;

const toEngineRanks = (cards: readonly BlackjackCard[]): number[] =>
  cards.map((card) => {
    if (card.rank === "A") return 1;
    if (card.rank === "J") return 11;
    if (card.rank === "Q") return 12;
    if (card.rank === "K") return 13;
    return Number(card.rank);
  });

export const LocalBlackjackGame = ({ username, onExit }: LocalBlackjackGameProps): React.ReactElement => {
  const [deck, setDeck] = useState<BlackjackCard[]>(() => createShuffledDeck());
  const [playerCards, setPlayerCards] = useState<BlackjackCard[]>([]);
  const [dealerCards, setDealerCards] = useState<BlackjackCard[]>([]);
  const [outcome, setOutcome] = useState<HandOutcome>("playing");
  const [message, setMessage] = useState("Deal to begin your blackjack hand.");

  const playerValue = useMemo(() => getHandValue(playerCards), [playerCards]);
  const dealerValue = useMemo(() => getHandValue(dealerCards), [dealerCards]);

  const concludeHand = (nextPlayerCards: BlackjackCard[], nextDealerCards: BlackjackCard[]) => {
    const nextPlayerValue = getHandValue(nextPlayerCards);
    const nextDealerValue = getHandValue(nextDealerCards);

    if (nextPlayerValue > 21) {
      setOutcome("lost");
      setMessage("Bust. Dealer wins this hand.");
      playNegativeSound();
      return;
    }

    if (nextDealerValue > 21 || nextPlayerValue > nextDealerValue) {
      setOutcome("won");
      setMessage("You win. The force is with you.");
      playVictorySound();
      return;
    }

    if (nextPlayerValue === nextDealerValue) {
      setOutcome("push");
      setMessage("Push. Nobody wins this hand.");
      playPositiveSound();
      return;
    }

    setOutcome("lost");
    setMessage("Dealer wins this hand.");
    playNegativeSound();
  };

  const dealNewHand = () => {
    const nextDeck = deck.length < 16 ? createShuffledDeck() : [...deck];
    const nextPlayerCards = [drawCard(nextDeck), drawCard(nextDeck)];
    const nextDealerCards = [drawCard(nextDeck), drawCard(nextDeck)];

    setDeck(nextDeck);
    setPlayerCards(nextPlayerCards);
    setDealerCards(nextDealerCards);
    setOutcome("playing");
    setMessage("Hit or stand.");
    playDrawSound();
  };

  const hit = () => {
    if (outcome !== "playing") {
      return;
    }

    const nextDeck = [...deck];
    const nextPlayerCards = [...playerCards, drawCard(nextDeck)];

    setDeck(nextDeck);
    setPlayerCards(nextPlayerCards);
    playDrawSound();

    if (getHandValue(nextPlayerCards) > 21) {
      concludeHand(nextPlayerCards, dealerCards);
    }
  };

  const stand = () => {
    if (outcome !== "playing") {
      return;
    }

    const nextDeck = [...deck];
    const nextDealerCards = [...dealerCards];

    const dealerOpts = { dealerHitsSoft17: true };
    while (dealerShouldHit(toEngineRanks(nextDealerCards), dealerOpts)) {
      nextDealerCards.push(drawCard(nextDeck));
    }

    setDeck(nextDeck);
    setDealerCards(nextDealerCards);
    concludeHand(playerCards, nextDealerCards);
  };

  return (
    <div className="pazaak-world-page">
      <header className="hero-card">
        <p className="label">CardWorld</p>
        <h1>Blackjack Practice</h1>
        <p className="muted">{username}, upload chitin.key to unlock full Pazaak. Blackjack remains available for everyone.</p>
      </header>

      <section className="panel-stack">
        <article className="panel-card">
          <p className="label">Dealer</p>
          <p>{dealerCards.length > 0 ? dealerCards.map(formatCard).join(" ") : "No cards dealt"}</p>
          <p className="muted">Value: {dealerCards.length > 0 ? dealerValue : "-"}</p>
        </article>

        <article className="panel-card">
          <p className="label">{username}</p>
          <p>{playerCards.length > 0 ? playerCards.map(formatCard).join(" ") : "No cards dealt"}</p>
          <p className="muted">Value: {playerCards.length > 0 ? playerValue : "-"}</p>
        </article>

        <article className="panel-card">
          <p>{message}</p>
          <div className="button-row">
            <button type="button" className="button" onClick={dealNewHand}>Deal</button>
            <button type="button" className="button" onClick={hit} disabled={outcome !== "playing" || playerCards.length === 0}>Hit</button>
            <button type="button" className="button" onClick={stand} disabled={outcome !== "playing" || playerCards.length === 0}>Stand</button>
            <button type="button" className="button" onClick={onExit}>Back</button>
          </div>
        </article>
      </section>
    </div>
  );
};

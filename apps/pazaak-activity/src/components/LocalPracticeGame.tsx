import { useEffect, useMemo, useState } from "react";
import type { AdvisorDifficulty } from "../types.ts";

type LocalCardType = "plus" | "minus" | "flex" | "flip" | "tiebreaker";

interface LocalSideCard {
  id: string;
  label: string;
  value: number;
  type: LocalCardType;
  used: boolean;
}

interface LocalPlayer {
  name: string;
  total: number;
  board: number[];
  roundWins: number;
  stood: boolean;
  bust: boolean;
  hasTiebreaker: boolean;
  sideDeck: LocalSideCard[];
}

interface LocalPracticeGameProps {
  username: string;
  difficulty: AdvisorDifficulty;
  onExit: () => void;
}

const TARGET_SCORE = 20;
const MAX_BOARD = 9;
const SETS_TO_WIN_LOCAL = 3;

type LocalGamePhase = "playing" | "round_end" | "game_end";

const randomId = (): string => Math.random().toString(36).slice(2, 11);

const shuffle = <T,>(input: readonly T[]): T[] => {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

const createMainDeck = (): number[] => {
  const deck: number[] = [];
  for (let value = 1; value <= 10; value += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      deck.push(value);
    }
  }
  return shuffle(deck);
};

const createSideDeck = (): LocalSideCard[] => {
  const deck: LocalSideCard[] = [
    { id: randomId(), label: "+1", value: 1, type: "plus", used: false },
    { id: randomId(), label: "+2", value: 2, type: "plus", used: false },
    { id: randomId(), label: "+3", value: 3, type: "plus", used: false },
    { id: randomId(), label: "-1", value: 1, type: "minus", used: false },
    { id: randomId(), label: "-2", value: 2, type: "minus", used: false },
    { id: randomId(), label: "-3", value: 3, type: "minus", used: false },
    { id: randomId(), label: "-4", value: 4, type: "minus", used: false },
    { id: randomId(), label: "+/-2", value: 2, type: "flex", used: false },
    { id: randomId(), label: "+/-4", value: 4, type: "flex", used: false },
    { id: randomId(), label: "+5", value: 5, type: "plus", used: false },
  ];

  // ~10% chance for a yellow special card (per PazaakWorld): flip or tiebreaker
  if (Math.random() < 0.1) {
    const roll = Math.random();
    if (roll < 0.67) {
      // Flip 3&6 or Flip 2&4
      const flipValue = Math.random() < 0.5 ? 3 : 2;
      const partner = flipValue === 3 ? 6 : 4;
      deck.push({ id: randomId(), label: `Flip ${flipValue}&${partner}`, value: flipValue, type: "flip", used: false });
    } else {
      // Tiebreaker: adds +1 and wins any tied round
      deck.push({ id: randomId(), label: "\xb11T", value: 1, type: "tiebreaker", used: false });
    }
  }

  return deck;
};

const createPlayer = (name: string): LocalPlayer => ({
  name,
  total: 0,
  board: [],
  roundWins: 0,
  stood: false,
  bust: false,
  hasTiebreaker: false,
  sideDeck: createSideDeck(),
});

const nextAiAction = (player: LocalPlayer, difficulty: AdvisorDifficulty): "draw" | "stand" => {
  if (player.total >= TARGET_SCORE) return "stand";

  if (difficulty === "professional") {
    if (player.total >= 17) return "stand";
    if (player.total >= 15 && Math.random() > 0.45) return "stand";
    return "draw";
  }

  if (difficulty === "hard") {
    if (player.total >= 16) return "stand";
    if (player.total >= 14 && Math.random() > 0.6) return "stand";
    return "draw";
  }

  if (player.total >= 15) return "stand";
  if (player.total >= 13 && Math.random() > 0.8) return "stand";
  return "draw";
};

const scorePlayer = (player: LocalPlayer): LocalPlayer => {
  const total = player.board.reduce((sum, value) => sum + value, 0);
  return {
    ...player,
    total,
    bust: total > TARGET_SCORE,
  };
};

const formatDifficulty = (difficulty: AdvisorDifficulty): string => {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "hard") return "Hard";
  return "Professional";
};

export function LocalPracticeGame({ username, difficulty, onExit }: LocalPracticeGameProps) {
  const [human, setHuman] = useState<LocalPlayer>(() => createPlayer(username || "Player"));
  const [ai, setAi] = useState<LocalPlayer>(() => createPlayer(`AI ${formatDifficulty(difficulty)}`));
  const [mainDeck, setMainDeck] = useState<number[]>(() => createMainDeck());
  const [phase, setPhase] = useState<LocalGamePhase>("playing");
  const [isHumanTurn, setIsHumanTurn] = useState<boolean>(() => Math.random() > 0.5);
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundSummary, setRoundSummary] = useState<string>("Local match started.");
  const [actionLog, setActionLog] = useState<string[]>(["Local match started."]);

  const winner = useMemo(() => {
    if (phase !== "game_end") return null;
    return human.roundWins >= SETS_TO_WIN_LOCAL ? human.name : ai.name;
  }, [ai.name, ai.roundWins, human.name, human.roundWins, phase]);

  const pushLog = (message: string) => {
    setActionLog((previous) => [message, ...previous].slice(0, 16));
  };

  const resetRound = (nextHuman: LocalPlayer, nextAi: LocalPlayer) => {
    setHuman({ ...nextHuman, board: [], total: 0, bust: false, stood: false, hasTiebreaker: false, sideDeck: nextHuman.sideDeck });
    setAi({ ...nextAi, board: [], total: 0, bust: false, stood: false, hasTiebreaker: false, sideDeck: nextAi.sideDeck });
    setMainDeck(createMainDeck());
    setRoundNumber((value) => value + 1);
    setIsHumanTurn(Math.random() > 0.5);
    setPhase("playing");
  };

  const finishRound = () => {
    const scoredHuman = scorePlayer(human);
    const scoredAi = scorePlayer(ai);

    let nextHuman = { ...scoredHuman };
    let nextAi = { ...scoredAi };

    let summary = "Set tied.";

    if (scoredHuman.bust && !scoredAi.bust) {
      nextAi.roundWins += 1;
      summary = `${ai.name} wins set ${roundNumber} (${scoredAi.total} vs bust).`;
    } else if (!scoredHuman.bust && scoredAi.bust) {
      nextHuman.roundWins += 1;
      summary = `${human.name} wins set ${roundNumber} (${scoredHuman.total} vs bust).`;
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredHuman.total > scoredAi.total) {
      nextHuman.roundWins += 1;
      summary = `${human.name} wins set ${roundNumber} (${scoredHuman.total} to ${scoredAi.total}).`;
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredAi.total > scoredHuman.total) {
      nextAi.roundWins += 1;
      summary = `${ai.name} wins set ${roundNumber} (${scoredAi.total} to ${scoredHuman.total}).`;
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredHuman.total === scoredAi.total) {
      // Tiebreaker resolution: if only one player has the tiebreaker flag, they win
      if (scoredHuman.hasTiebreaker && !scoredAi.hasTiebreaker) {
        nextHuman.roundWins += 1;
        summary = `${human.name} wins set ${roundNumber} with Tiebreaker (${scoredHuman.total} tied)!`;
      } else if (scoredAi.hasTiebreaker && !scoredHuman.hasTiebreaker) {
        nextAi.roundWins += 1;
        summary = `${ai.name} wins set ${roundNumber} with Tiebreaker (${scoredAi.total} tied)!`;
      }
    }

    setRoundSummary(summary);
    pushLog(summary);

    if (nextHuman.roundWins >= SETS_TO_WIN_LOCAL || nextAi.roundWins >= SETS_TO_WIN_LOCAL) {
      setHuman(nextHuman);
      setAi(nextAi);
      setPhase("game_end");
      return;
    }

    setTimeout(() => {
      resetRound(nextHuman, nextAi);
    }, 900);
  };

  const drawFor = (target: "human" | "ai") => {
    if (mainDeck.length === 0) {
      setPhase("round_end");
      return;
    }

    const value = mainDeck[mainDeck.length - 1]!;
    const nextDeck = mainDeck.slice(0, -1);
    setMainDeck(nextDeck);

    if (target === "human") {
      const next = scorePlayer({ ...human, board: [...human.board, value] });
      setHuman(next);
      pushLog(`${human.name} draws ${value} (total ${next.total}).`);
      if (next.bust || next.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else {
        setIsHumanTurn(false);
      }
      return;
    }

    const next = scorePlayer({ ...ai, board: [...ai.board, value] });
    setAi(next);
    pushLog(`${ai.name} draws ${value} (total ${next.total}).`);
    if (next.bust || next.board.length >= MAX_BOARD) {
      setPhase("round_end");
    } else {
      setIsHumanTurn(true);
    }
  };

  const applyHumanSideCard = (cardId: string) => {
    const card = human.sideDeck.find((entry) => entry.id === cardId && !entry.used);
    if (!card) return;

    const nextDeck = human.sideDeck.map((entry) => (entry.id === card.id ? { ...entry, used: true } : entry));

    if (card.type === "flip") {
      // Flip cards invert the sign of all board values equal to card.value or its partner
      const flipValues = new Set([card.value, card.value * 2]);
      const flipped = human.board.map((v) => (flipValues.has(Math.abs(v)) ? -v : v));
      const next = scorePlayer({ ...human, sideDeck: nextDeck, board: flipped });
      setHuman(next);
      pushLog(`${human.name} plays ${card.label} — board flipped (total ${next.total}).`);
      if (next.bust || next.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else {
        setIsHumanTurn(false);
      }
      return;
    }

    if (card.type === "tiebreaker") {
      // Tiebreaker: adds +1 to board and grants ability to win tied rounds
      const next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, 1], hasTiebreaker: true });
      setHuman(next);
      pushLog(`${human.name} plays \xb11T Tiebreaker — total ${next.total}, ties won this set.`);
      if (next.bust || next.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else {
        setIsHumanTurn(false);
      }
      return;
    }

    const sign = card.type === "flex" ? (window.confirm(`Use ${card.label} as positive? Press Cancel for negative.`) ? 1 : -1) : card.type === "minus" ? -1 : 1;
    const delta = sign * card.value;

    const next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, delta] });
    setHuman(next);
    pushLog(`${human.name} plays ${card.label} as ${delta > 0 ? `+${delta}` : `${delta}`} (total ${next.total}).`);

    if (next.bust || next.board.length >= MAX_BOARD) {
      setPhase("round_end");
    } else {
      setIsHumanTurn(false);
    }
  };

  const humanStand = () => {
    setHuman((previous) => ({ ...previous, stood: true }));
    pushLog(`${human.name} stands on ${human.total}.`);
    setIsHumanTurn(false);
  };

  useEffect(() => {
    if (phase !== "playing") return;
    if (human.stood && ai.stood) {
      setPhase("round_end");
      return;
    }

    if (isHumanTurn) return;
    if (ai.stood || ai.bust) {
      setIsHumanTurn(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      const action = nextAiAction(ai, difficulty);
      if (action === "stand") {
        setAi((previous) => ({ ...previous, stood: true }));
        pushLog(`${ai.name} stands on ${ai.total}.`);
        setIsHumanTurn(true);
      } else {
        drawFor("ai");
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [ai, difficulty, human.stood, isHumanTurn, phase]);

  useEffect(() => {
    if (phase === "round_end") {
      finishRound();
    }
  }, [phase]);

  const canAct = phase === "playing" && isHumanTurn && !human.stood && !human.bust;

  const restartGame = () => {
    const freshHuman = createPlayer(username || "Player");
    const freshAi = createPlayer(`AI ${formatDifficulty(difficulty)}`);
    setHuman(freshHuman);
    setAi(freshAi);
    setMainDeck(createMainDeck());
    setPhase("playing");
    setIsHumanTurn(Math.random() > 0.5);
    setRoundNumber(1);
    setRoundSummary("New match started.");
    setActionLog(["New match started."]);
  };

  return (
    <div className="screen screen--lobby">
      <div className="local-game">
        <section className="local-game__header">
          <h1>Local Practice</h1>
          <p>{human.name} vs {ai.name} · Difficulty {formatDifficulty(difficulty)}</p>
          <p>Set {roundNumber} · First to {SETS_TO_WIN_LOCAL} wins</p>
          <div className="local-game__header-actions">
            <button className="btn btn--ghost" onClick={onExit}>Back to Lobby</button>
          </div>
        </section>

        <section className="local-game__players">
          <article className="local-game__player-card">
            <h2>{human.name} {isHumanTurn ? "(Your turn)" : ""}</h2>
            <p>Total: {human.bust ? "BUST" : human.total} · Sets: {human.roundWins}</p>
            <div className="local-game__board">
              {human.board.length === 0 ? <span>No cards</span> : human.board.map((value, index) => <span key={`${value}-${index}`}>{value > 0 ? `+${value}` : `${value}`}</span>)}
            </div>
            <div className="local-game__side-deck">
              {human.sideDeck.filter((card) => !card.used).map((card) => (
                <button key={card.id} className="btn btn--card btn--sm" onClick={() => applyHumanSideCard(card.id)} disabled={!canAct}>
                  {card.label}
                </button>
              ))}
            </div>
          </article>

          <article className="local-game__player-card">
            <h2>{ai.name}</h2>
            <p>Total: {ai.bust ? "BUST" : ai.total} · Sets: {ai.roundWins}</p>
            <div className="local-game__board">
              {ai.board.length === 0 ? <span>No cards</span> : ai.board.map((value, index) => <span key={`${value}-${index}`}>{value > 0 ? `+${value}` : `${value}`}</span>)}
            </div>
          </article>
        </section>

        <section className="local-game__actions">
          <button className="btn btn--primary" onClick={() => drawFor("human")} disabled={!canAct}>Draw</button>
          <button className="btn btn--secondary" onClick={humanStand} disabled={!canAct}>Stand</button>
          {phase === "game_end" ? (
            <span className="local-game__result">
              <strong>Winner: {winner}</strong>
              <button className="btn btn--primary" onClick={restartGame}>Play Again</button>
            </span>
          ) : (
            <span>{roundSummary}</span>
          )}
        </section>

        <section className="local-game__log">
          <h3>Game Log</h3>
          <ul>
            {actionLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}

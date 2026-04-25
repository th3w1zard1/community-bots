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

/** Find the smallest minus/flex card that rescues the AI from a bust. */
const aiPickRescueCard = (player: LocalPlayer): LocalSideCard | null => {
  const overage = player.total - TARGET_SCORE;
  return player.sideDeck
    .filter((c) => !c.used && (c.type === "minus" || c.type === "flex") && c.value >= overage)
    .sort((a, b) => a.value - b.value)[0] ?? null;
};

/** Find a card that brings the AI to exactly 20. */
const aiPickExactCard = (player: LocalPlayer): LocalSideCard | null => {
  const needed = TARGET_SCORE - player.total;
  if (needed <= 0) return null;
  return player.sideDeck.find((c) => {
    if (c.used) return false;
    if ((c.type === "plus" || c.type === "flex" || c.type === "tiebreaker") && c.value === needed) return true;
    return false;
  }) ?? null;
};

const getAiDelay = (difficulty: AdvisorDifficulty): number => {
  if (difficulty === "easy") return 1000 + Math.random() * 2000;
  if (difficulty === "hard") return 800 + Math.random() * 1200;
  return 600 + Math.random() * 1000;
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
  const [flexPrompt, setFlexPrompt] = useState<{ cardId: string; label: string; value: number } | null>(null);
  const [setResult, setSetResult] = useState<{
    summary: string;
    humanTotal: number;
    aiTotal: number;
    humanWins: number;
    aiWins: number;
    nextHuman: LocalPlayer;
    nextAi: LocalPlayer;
    nextFirst: "human" | "ai" | "random";
  } | null>(null);

  const winner = useMemo(() => {
    if (phase !== "game_end") return null;
    return human.roundWins >= SETS_TO_WIN_LOCAL ? human.name : ai.name;
  }, [ai.name, ai.roundWins, human.name, human.roundWins, phase]);

  const pushLog = (message: string) => {
    setActionLog((previous) => [message, ...previous].slice(0, 16));
  };

  const resetRound = (nextHuman: LocalPlayer, nextAi: LocalPlayer, firstTurn: "human" | "ai" | "random") => {
    // Reset board + clear used-card flags so side cards are available each round (canonical rule)
    setHuman({ ...nextHuman, board: [], total: 0, bust: false, stood: false, hasTiebreaker: false, sideDeck: nextHuman.sideDeck.map((c) => ({ ...c, used: false })) });
    setAi({ ...nextAi, board: [], total: 0, bust: false, stood: false, hasTiebreaker: false, sideDeck: nextAi.sideDeck.map((c) => ({ ...c, used: false })) });
    setMainDeck(createMainDeck());
    setRoundNumber((value) => value + 1);
    setIsHumanTurn(firstTurn === "human" ? true : firstTurn === "ai" ? false : Math.random() > 0.5);
    setPhase("playing");
  };

  const finishRound = () => {
    const scoredHuman = scorePlayer(human);
    const scoredAi = scorePlayer(ai);

    let nextHuman = { ...scoredHuman };
    let nextAi = { ...scoredAi };

    let summary = "Set tied.";
    let setWinner: "human" | "ai" | "none" = "none";

    if (scoredHuman.bust && !scoredAi.bust) {
      nextAi.roundWins += 1;
      setWinner = "ai";
      summary = `${ai.name} wins set ${roundNumber} (${scoredAi.total} vs bust).`;
    } else if (!scoredHuman.bust && scoredAi.bust) {
      nextHuman.roundWins += 1;
      setWinner = "human";
      summary = `${human.name} wins set ${roundNumber} (${scoredHuman.total} vs bust).`;
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredHuman.total > scoredAi.total) {
      nextHuman.roundWins += 1;
      setWinner = "human";
      summary = `${human.name} wins set ${roundNumber} (${scoredHuman.total} to ${scoredAi.total}).`;
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredAi.total > scoredHuman.total) {
      nextAi.roundWins += 1;
      setWinner = "ai";
      summary = `${ai.name} wins set ${roundNumber} (${scoredAi.total} to ${scoredHuman.total}).`;
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredHuman.total === scoredAi.total) {
      // Tiebreaker resolution: if only one player has the tiebreaker flag, they win
      if (scoredHuman.hasTiebreaker && !scoredAi.hasTiebreaker) {
        nextHuman.roundWins += 1;
        setWinner = "human";
        summary = `${human.name} wins set ${roundNumber} with Tiebreaker (${scoredHuman.total} tied)!`;
      } else if (scoredAi.hasTiebreaker && !scoredHuman.hasTiebreaker) {
        nextAi.roundWins += 1;
        setWinner = "ai";
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

    // Canonical rule: loser of the set goes first in the next one
    const nextFirst: "human" | "ai" | "random" = setWinner === "human" ? "ai" : setWinner === "ai" ? "human" : "random";
    // Show round-end overlay instead of auto-advancing — user clicks Continue
    setSetResult({
      summary,
      humanTotal: scoredHuman.bust ? -1 : scoredHuman.total,
      aiTotal: scoredAi.bust ? -1 : scoredAi.total,
      humanWins: nextHuman.roundWins,
      aiWins: nextAi.roundWins,
      nextHuman,
      nextAi,
      nextFirst,
    });
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
      let next = scorePlayer({ ...human, board: [...human.board, value] });
      const autoStand = next.total === TARGET_SCORE && !next.bust;
      if (autoStand) {
        next = { ...next, stood: true };
        pushLog(`${human.name} draws ${value} — stands automatically at 20!`);
      } else {
        pushLog(`${human.name} draws ${value} (total ${next.total}).`);
      }
      setHuman(next);
      if (next.bust || next.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else {
        setIsHumanTurn(false);
      }
      return;
    }

    let next = scorePlayer({ ...ai, board: [...ai.board, value] });
    const autoStand = next.total === TARGET_SCORE && !next.bust;
    if (autoStand) {
      next = { ...next, stood: true };
      pushLog(`${ai.name} draws ${value} — stands automatically at 20!`);
    } else {
      pushLog(`${ai.name} draws ${value} (total ${next.total}).`);
    }
    setAi(next);
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

    if (card.type === "flex") {
      // Show inline polarity chooser instead of window.confirm
      setFlexPrompt({ cardId: card.id, label: card.label, value: card.value });
      return;
    }

    if (card.type === "flip") {
      const flipValues = new Set([card.value, card.value * 2]);
      const flipped = human.board.map((v) => (flipValues.has(Math.abs(v)) ? -v : v));
      let next = scorePlayer({ ...human, sideDeck: nextDeck, board: flipped });
      if (next.total === TARGET_SCORE && !next.bust) next = { ...next, stood: true };
      setHuman(next);
      pushLog(`${human.name} plays ${card.label} — board flipped (total ${next.total})${next.stood ? ", stands at 20!" : "."}`);
      if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
      else setIsHumanTurn(false);
      return;
    }

    if (card.type === "tiebreaker") {
      let next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, 1], hasTiebreaker: true });
      if (next.total === TARGET_SCORE && !next.bust) next = { ...next, stood: true };
      setHuman(next);
      pushLog(`${human.name} plays \xb11T Tiebreaker — total ${next.total}${next.stood ? ", stands at 20!" : ", ties won this set."}`);
      if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
      else setIsHumanTurn(false);
      return;
    }

    const sign = card.type === "minus" ? -1 : 1;
    const delta = sign * card.value;
    let next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, delta] });
    if (next.total === TARGET_SCORE && !next.bust) next = { ...next, stood: true };
    setHuman(next);
    pushLog(`${human.name} plays ${card.label} as ${delta > 0 ? `+${delta}` : `${delta}`} (total ${next.total})${next.stood ? " — stands at 20!" : "."}`);
    if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
    else setIsHumanTurn(false);
  };

  const confirmFlex = (sign: 1 | -1) => {
    if (!flexPrompt) return;
    const card = human.sideDeck.find((c) => c.id === flexPrompt.cardId && !c.used);
    setFlexPrompt(null);
    if (!card) return;
    const nextDeck = human.sideDeck.map((c) => (c.id === card.id ? { ...c, used: true } : c));
    const delta = sign * card.value;
    let next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, delta] });
    if (next.total === TARGET_SCORE && !next.bust) next = { ...next, stood: true };
    setHuman(next);
    pushLog(`${human.name} plays ${card.label} as ${delta > 0 ? `+${delta}` : `${delta}`} (total ${next.total})${next.stood ? " — stands at 20!" : "."}`);
    if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
    else setIsHumanTurn(false);
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

    const delay = getAiDelay(difficulty);
    const timeout = window.setTimeout(() => {
      const action = nextAiAction(ai, difficulty);
      if (action === "stand") {
        setAi((previous) => ({ ...previous, stood: true }));
        pushLog(`${ai.name} stands on ${ai.total}.`);
        setIsHumanTurn(true);
        return;
      }

      // AI draws a card
      if (mainDeck.length === 0) {
        setPhase("round_end");
        return;
      }
      const value = mainDeck[mainDeck.length - 1]!;
      setMainDeck((previous) => previous.slice(0, -1));

      let drawnAi = scorePlayer({ ...ai, board: [...ai.board, value] });

      // Auto-stand at exactly 20
      if (drawnAi.total === TARGET_SCORE && !drawnAi.bust) {
        drawnAi = { ...drawnAi, stood: true };
        pushLog(`${ai.name} draws ${value} \u2014 stands automatically at 20!`);
      } else {
        pushLog(`${ai.name} draws ${value} (total ${drawnAi.total}).`);
      }

      // AI side-card play: bust rescue first, then exact-finish
      if (drawnAi.bust) {
        const rescue = aiPickRescueCard(drawnAi);
        if (rescue) {
          const rescuedDeck = drawnAi.sideDeck.map((c) => (c.id === rescue.id ? { ...c, used: true } : c));
          const rescueDelta = -rescue.value;
          drawnAi = scorePlayer({ ...drawnAi, sideDeck: rescuedDeck, board: [...drawnAi.board, rescueDelta] });
          pushLog(`${ai.name} plays ${rescue.label} to recover (total ${drawnAi.total}).`);
        }
      } else if (!drawnAi.stood) {
        const exactCard = aiPickExactCard(drawnAi);
        if (exactCard) {
          const exactDeck = drawnAi.sideDeck.map((c) => (c.id === exactCard.id ? { ...c, used: true } : c));
          const exactDelta = exactCard.type === "minus" ? -exactCard.value : exactCard.value;
          drawnAi = scorePlayer({ ...drawnAi, sideDeck: exactDeck, board: [...drawnAi.board, exactDelta] });
          if (drawnAi.total === TARGET_SCORE && !drawnAi.bust) drawnAi = { ...drawnAi, stood: true };
          pushLog(`${ai.name} plays ${exactCard.label} \u2014 exact finish at ${drawnAi.total}!`);
        }
      }

      setAi(drawnAi);
      if (drawnAi.bust || drawnAi.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else {
        setIsHumanTurn(true);
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, difficulty, human.stood, isHumanTurn, phase]);

  useEffect(() => {
    if (phase === "round_end") {
      finishRound();
    }
  }, [phase]);

  const canAct = phase === "playing" && isHumanTurn && !human.stood && !human.bust;

  const continueToNextRound = () => {
    if (!setResult) return;
    const { nextHuman, nextAi, nextFirst } = setResult;
    setSetResult(null);
    resetRound(nextHuman, nextAi, nextFirst);
  };

  const restartGame = () => {
    const freshHuman = createPlayer(username || "Player");
    const freshAi = createPlayer(`AI ${formatDifficulty(difficulty)}`);
    setHuman(freshHuman);
    setAi(freshAi);
    setMainDeck(createMainDeck());
    setPhase("playing");
    setIsHumanTurn(Math.random() > 0.5);
    setRoundNumber(1);

        {/* Round-end overlay: shown between sets */}
        {setResult && (
          <div className="local-game__overlay">
            <div className="local-game__set-result">
              <h2>Set {roundNumber} Complete</h2>
              <p className="local-game__set-result__summary">{setResult.summary}</p>
              <table className="local-game__set-result__scores">
                <tbody>
                  <tr>
                    <td>{human.name}</td>
                    <td className={setResult.humanTotal < 0 ? "score--bust" : setResult.humanTotal === TARGET_SCORE ? "score--perfect" : ""}>
                      {setResult.humanTotal < 0 ? "BUST" : setResult.humanTotal}
                    </td>
                    <td>{setResult.humanWins} sets</td>
                  </tr>
                  <tr>
                    <td>{ai.name}</td>
                    <td className={setResult.aiTotal < 0 ? "score--bust" : setResult.aiTotal === TARGET_SCORE ? "score--perfect" : ""}>
                      {setResult.aiTotal < 0 ? "BUST" : setResult.aiTotal}
                    </td>
                    <td>{setResult.aiWins} sets</td>
                  </tr>
                </tbody>
              </table>
              <p className="local-game__set-result__series">Series: {human.name} {setResult.humanWins} – {setResult.aiWins} {ai.name}</p>
              <button className="btn btn--primary" onClick={continueToNextRound}>Continue</button>
            </div>
          </div>
        )}
    setRoundSummary("New match started.");
    setActionLog(["New match started."]);
    setSetResult(null);
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
            <h2>{human.name} {isHumanTurn && phase === "playing" ? "(Your turn)" : ""}</h2>
            <p>
              Total:{" "}
              <span className={human.bust ? "score--bust" : human.total === TARGET_SCORE ? "score--perfect" : ""}>
                {human.bust ? "BUST" : human.total}
              </span>
              {" "}· Sets: {human.roundWins}
            </p>
            <div className="local-game__board">
              {human.board.length === 0 ? <span>No cards</span> : human.board.map((value, index) => (
                <span key={`${value}-${index}`} className={`board-card ${value > 0 ? "board-card--pos" : "board-card--neg"}`}>
                  {value > 0 ? `+${value}` : `${value}`}
                </span>
              ))}
            </div>
            <div className="local-game__side-deck">
              {flexPrompt ? (
                <div className="local-game__flex-prompt">
                  <span>Play {flexPrompt.label} as:</span>
                  <button className="btn btn--primary btn--sm" onClick={() => confirmFlex(1)}>+{flexPrompt.value}</button>
                  <button className="btn btn--secondary btn--sm" onClick={() => confirmFlex(-1)}>-{flexPrompt.value}</button>
                </div>
              ) : (
                human.sideDeck.map((card) => (
                  <button
                    key={card.id}
                    className={`btn btn--card btn--sm${card.used ? " btn--card--used" : ""}`}
                    onClick={() => applyHumanSideCard(card.id)}
                    disabled={!canAct || card.used}
                  >
                    {card.label}
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="local-game__player-card">
            <h2>{ai.name}{!isHumanTurn && phase === "playing" ? " (thinking…)" : ""}</h2>
            <p>
              Total:{" "}
              <span className={ai.bust ? "score--bust" : ai.total === TARGET_SCORE ? "score--perfect" : ""}>
                {ai.bust ? "BUST" : ai.total}
              </span>
              {" "}· Sets: {ai.roundWins}
            </p>
            <div className="local-game__board">
              {ai.board.length === 0 ? <span>No cards</span> : ai.board.map((value, index) => (
                <span key={`${value}-${index}`} className={`board-card ${value > 0 ? "board-card--pos" : "board-card--neg"}`}>
                  {value > 0 ? `+${value}` : `${value}`}
                </span>
              ))}
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

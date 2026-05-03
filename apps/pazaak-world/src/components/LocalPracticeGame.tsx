import { useEffect, useMemo, useRef, useState } from "react";
import type { AdvisorDifficulty } from "../types.ts";
import {
  getDefaultLocalOpponentForDifficulty,
  getLocalOpponentById,
  pickOpponentPhrase,
  type LocalOpponentPhraseKey,
  type LocalOpponentProfile,
} from "../localOpponents.ts";
import {
  getStoredMusicEnabled,
  setStoredMusicEnabled,
  startAmbientMusic,
} from "../utils/ambientAudio.ts";

type LocalCardType = "plus" | "minus" | "flex" | "flip" | "copy" | "tiebreaker" | "valueChange";

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
  opponentId?: string;
  onExit: () => void;
}

interface OpponentRecord {
  played: number;
  won: number;
  lost: number;
}

interface LocalPracticeStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  roundsWon: number;
  roundsLost: number;
  perfect20s: number;
  byOpponent: Record<string, OpponentRecord>;
}

const TARGET_SCORE = 20;
const MAX_BOARD = 9;
const SETS_TO_WIN_LOCAL = 3;
const LOCAL_STATS_KEY = "pazaak-world-local-practice-stats-v1";
const LOCAL_SOUND_KEY = "pazaak-world-sound-enabled-v1";

const pickLocalStarter = (): "human" | "ai" => Math.random() > 0.5 ? "human" : "ai";

// ---------------------------------------------------------------------------
// Audio helpers (Web Audio API, no external assets)
// ---------------------------------------------------------------------------

type LocalToneType = "draw" | "card" | "stand" | "roundWin" | "roundLoss" | "win" | "lose" | "speak";

const LOCAL_TONE_PARAMS: Record<LocalToneType, { freq: number; duration: number; type: OscillatorType; gainPeak: number }> = {
  draw:      { freq: 440,  duration: 0.08, type: "sine",     gainPeak: 0.18 },
  card:      { freq: 660,  duration: 0.10, type: "triangle", gainPeak: 0.22 },
  stand:     { freq: 330,  duration: 0.14, type: "sine",     gainPeak: 0.15 },
  roundWin:  { freq: 523,  duration: 0.25, type: "triangle", gainPeak: 0.28 },
  roundLoss: { freq: 196,  duration: 0.28, type: "sine",     gainPeak: 0.20 },
  win:       { freq: 659,  duration: 0.45, type: "triangle", gainPeak: 0.32 },
  lose:      { freq: 147,  duration: 0.45, type: "sine",     gainPeak: 0.22 },
  speak:     { freq: 880,  duration: 0.06, type: "sine",     gainPeak: 0.10 },
};

function playLocalTone(type: LocalToneType): void {
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  let ctx: AudioContext;
  try { ctx = new AudioContextCtor(); } catch { return; }
  if (ctx.state === "suspended") { ctx.resume().catch(() => {}); }

  const params = LOCAL_TONE_PARAMS[type];
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = params.type;
  oscillator.frequency.value = params.freq;
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(params.gainPeak, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + params.duration);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + params.duration + 0.02);
  oscillator.onended = () => { void ctx.close(); };
}

function getStoredSoundEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(LOCAL_SOUND_KEY);
    if (raw === null) return true; // on by default in local practice
    return raw === "true";
  } catch { return true; }
}

function setStoredSoundEnabled(value: boolean): void {
  try { window.localStorage.setItem(LOCAL_SOUND_KEY, value ? "true" : "false"); } catch { /* ignore */ }
}

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
  return [
    { id: randomId(), label: "+1", value: 1, type: "plus", used: false },
    { id: randomId(), label: "+2", value: 2, type: "plus", used: false },
    { id: randomId(), label: "+3", value: 3, type: "plus", used: false },
    { id: randomId(), label: "-1", value: 1, type: "minus", used: false },
    { id: randomId(), label: "-2", value: 2, type: "minus", used: false },
    { id: randomId(), label: "-3", value: 3, type: "minus", used: false },
    { id: randomId(), label: "-4", value: 4, type: "minus", used: false },
    { id: randomId(), label: "+/-2", value: 2, type: "flex", used: false },
    { id: randomId(), label: "D", value: 0, type: "copy", used: false },
    { id: randomId(), label: "1+/-2", value: 2, type: "valueChange", used: false },
  ];
};

const createSideCardFromToken = (token: string): LocalSideCard | null => {
  const normalized = token.trim().toUpperCase();

  if (/^[+][1-6]$/.test(normalized)) {
    const value = Number(normalized.slice(1));
    return { id: randomId(), label: `+${value}`, value, type: "plus", used: false };
  }

  if (/^[-][1-6]$/.test(normalized)) {
    const value = Number(normalized.slice(1));
    return { id: randomId(), label: `-${value}`, value, type: "minus", used: false };
  }

  if (/^[*][1-6]$/.test(normalized)) {
    const value = Number(normalized.slice(1));
    return { id: randomId(), label: `+/-${value}`, value, type: "flex", used: false };
  }

  if (normalized === "F1") {
    return { id: randomId(), label: "Flip 2&4", value: 2, type: "flip", used: false };
  }

  if (normalized === "F2") {
    return { id: randomId(), label: "Flip 3&6", value: 3, type: "flip", used: false };
  }

  if (normalized === "$$" || normalized === "D") {
    return { id: randomId(), label: "D", value: 0, type: "copy", used: false };
  }

  if (normalized === "TT") {
    return { id: randomId(), label: "+/-1T", value: 1, type: "tiebreaker", used: false };
  }

  if (normalized === "VV" || normalized === "1+/-2" || normalized === "+/-1/2") {
    return { id: randomId(), label: "1+/-2", value: 2, type: "valueChange", used: false };
  }

  return null;
};

const createOpponentSideDeck = (profile: LocalOpponentProfile): LocalSideCard[] => {
  const mapped = profile.sideDeckTokens
    .map((token: string) => createSideCardFromToken(token))
    .filter((card): card is LocalSideCard => card !== null);

  if (mapped.length >= 10) {
    return mapped.slice(0, 10);
  }

  const fallback = createSideDeck();
  return [...mapped, ...fallback].slice(0, 10);
};

const createPlayer = (name: string, sideDeck: LocalSideCard[] = createSideDeck()): LocalPlayer => ({
  name,
  total: 0,
  board: [],
  roundWins: 0,
  stood: false,
  bust: false,
  hasTiebreaker: false,
  sideDeck,
});

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

const getAiDelay = (difficulty: AdvisorDifficulty): number => {
  if (difficulty === "easy") return 1000 + Math.random() * 2000;
  if (difficulty === "hard") return 2000 + Math.random() * 3000;
  return 1500 + Math.random() * 2500;
};

const getStandThreshold = (difficulty: AdvisorDifficulty, opponent: LocalOpponentProfile): number => {
  if (difficulty === "easy") return Math.max(15, opponent.standAt - 1);
  if (difficulty === "hard") return opponent.standAt;
  return Math.min(19, opponent.standAt + 1);
};

const aiShouldStand = (
  player: LocalPlayer,
  opponent: LocalPlayer,
  difficulty: AdvisorDifficulty,
  profile: LocalOpponentProfile,
): boolean => {
  if (player.total >= TARGET_SCORE) return true;

  const standThreshold = getStandThreshold(difficulty, profile);
  if (player.total >= standThreshold) {
    return Math.random() > 0.22;
  }

  if (opponent.stood && player.total >= 17 && player.total <= opponent.total) {
    return Math.random() * 100 < profile.tieChance;
  }

  return false;
};

const aiPickRescueCard = (player: LocalPlayer): LocalSideCard | null => {
  const overage = player.total - TARGET_SCORE;
  return player.sideDeck
    .filter((c) => !c.used && (c.type === "minus" || c.type === "flex" || c.type === "valueChange") && c.value >= overage)
    .sort((a, b) => a.value - b.value)[0] ?? null;
};

const aiPickExactCard = (player: LocalPlayer): LocalSideCard | null => {
  const needed = TARGET_SCORE - player.total;
  if (needed <= 0) return null;
  return player.sideDeck.find((c) => {
    if (c.used) return false;
    if (c.type === "valueChange") return needed <= 2;
    return (c.type === "plus" || c.type === "flex" || c.type === "tiebreaker") && c.value === needed;
  }) ?? null;
};

const getAiRecoveryDelta = (card: LocalSideCard, overage: number): number => {
  if (card.type === "valueChange") return -Math.min(2, Math.max(1, overage));
  return -card.value;
};

const getAiExactDelta = (card: LocalSideCard, needed: number): number => {
  if (card.type === "valueChange") return Math.min(2, Math.max(1, needed));
  return card.type === "minus" ? -card.value : card.value;
};

const aiPickSetupCard = (player: LocalPlayer, difficulty: AdvisorDifficulty): LocalSideCard | null => {
  if (difficulty !== "professional") return null;
  if (player.total > 15) return null;
  if (Math.random() > 0.3) return null;
  return player.sideDeck.find((c) => !c.used && (c.type === "plus" || c.type === "flex") && c.value <= 3) ?? null;
};

const aiPickYellowCard = (player: LocalPlayer, opponent: LocalPlayer): LocalSideCard | null => {
  if (opponent.stood && opponent.total >= 17 && Math.abs(player.total - opponent.total) <= 2) {
    const tiebreaker = player.sideDeck.find((c) => !c.used && c.type === "tiebreaker");
    if (tiebreaker) return tiebreaker;
  }

  const flipCards = player.sideDeck.filter((c) => !c.used && c.type === "flip");
  for (const card of flipCards) {
    const flipValues = new Set([card.value, card.value * 2]);
    const flippedBoard = player.board.map((v) => (flipValues.has(Math.abs(v)) ? -v : v));
    const newTotal = flippedBoard.reduce((sum, v) => sum + v, 0);
    if (newTotal > player.total && newTotal <= TARGET_SCORE) {
      return card;
    }
  }

  return null;
};

const emptyStats = (): LocalPracticeStats => ({
  matchesPlayed: 0,
  matchesWon: 0,
  matchesLost: 0,
  roundsWon: 0,
  roundsLost: 0,
  perfect20s: 0,
  byOpponent: {},
});

const loadStats = (): LocalPracticeStats => {
  try {
    const raw = window.localStorage.getItem(LOCAL_STATS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as LocalPracticeStats;
    if (!parsed || typeof parsed !== "object") return emptyStats();
    return {
      ...emptyStats(),
      ...parsed,
      byOpponent: parsed.byOpponent ?? {},
    };
  } catch {
    return emptyStats();
  }
};

const toPercent = (numerator: number, denominator: number): string => {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
};

export function LocalPracticeGame({ username, difficulty, opponentId, onExit }: LocalPracticeGameProps) {
  const opponentProfile = useMemo(
    () => getLocalOpponentById(opponentId) ?? getDefaultLocalOpponentForDifficulty(difficulty),
    [difficulty, opponentId],
  );

  const [human, setHuman] = useState<LocalPlayer>(() => createPlayer(username || "Player"));
  const [ai, setAi] = useState<LocalPlayer>(() => createPlayer(opponentProfile.name, createOpponentSideDeck(opponentProfile)));
  const [mainDeck, setMainDeck] = useState<number[]>(() => createMainDeck());
  const [phase, setPhase] = useState<LocalGamePhase>("playing");
  const [initialSetStarter, setInitialSetStarter] = useState<"human" | "ai">(() => pickLocalStarter());
  const [isHumanTurn, setIsHumanTurn] = useState<boolean>(() => initialSetStarter === "human");
  const [turnStage, setTurnStage] = useState<"draw" | "resolve">("draw");
  const [sideCardPlayedThisTurn, setSideCardPlayedThisTurn] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundSummary, setRoundSummary] = useState<string>("Local match started.");
  const [actionLog, setActionLog] = useState<string[]>(() => [
    `${opponentProfile.name}: ${opponentProfile.phrases.chosen[0] ?? "..."}`,
    "Local match started.",
  ]);
  const [lastOpponentLines, setLastOpponentLines] = useState<Partial<Record<LocalOpponentPhraseKey, string>>>(() => ({
    chosen: opponentProfile.phrases.chosen[0] ?? "...",
  }));
  const [stats, setStats] = useState<LocalPracticeStats>(() => loadStats());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getStoredSoundEnabled());
  const [musicEnabled, setMusicEnabled] = useState<boolean>(() => getStoredMusicEnabled());
  const stopMusicRef = useRef<(() => void) | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

  // Start / stop ambient music when musicEnabled changes.
  useEffect(() => {
    if (musicEnabled) {
      stopMusicRef.current = startAmbientMusic();
    } else {
      stopMusicRef.current?.();
      stopMusicRef.current = null;
    }
    return () => {
      stopMusicRef.current?.();
      stopMusicRef.current = null;
    };
  }, [musicEnabled]);

  const [flexPrompt, setFlexPrompt] = useState<{ cardId: string; label: string; choices: number[] } | null>(null);
  const [latestOpponentQuote, setLatestOpponentQuote] = useState<string>(
    () => opponentProfile.phrases.chosen[0] ?? opponentProfile.description
  );
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

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  const winner = useMemo(() => {
    if (phase !== "game_end") return null;
    return human.roundWins >= SETS_TO_WIN_LOCAL ? human.name : ai.name;
  }, [ai.name, human.name, human.roundWins, phase]);

  const pushLog = (message: string) => {
    setActionLog((previous) => [message, ...previous].slice(0, 20));
  };

  const speakOpponent = (key: LocalOpponentPhraseKey, fallback: string) => {
    const line = pickOpponentPhrase(opponentProfile, key, lastOpponentLines[key], fallback);
    setLastOpponentLines((previous) => ({ ...previous, [key]: line }));
    setLatestOpponentQuote(line);
    pushLog(`${opponentProfile.name}: ${line}`);
  };

  const recordRoundTotals = (scoredHuman: LocalPlayer, scoredAi: LocalPlayer) => {
    setStats((previous) => ({
      ...previous,
      roundsWon: previous.roundsWon + (scoredHuman.bust ? 0 : scoredHuman.total > scoredAi.total || (scoredAi.bust ? 1 : 0) ? 1 : 0),
      roundsLost: previous.roundsLost + (scoredAi.bust ? 0 : scoredAi.total > scoredHuman.total || (scoredHuman.bust ? 1 : 0) ? 1 : 0),
      perfect20s: previous.perfect20s + (scoredHuman.total === TARGET_SCORE && !scoredHuman.bust ? 1 : 0),
    }));
  };

  const recordMatchOutcome = (didWin: boolean) => {
    setStats((previous) => {
      const currentOpponent = previous.byOpponent[opponentProfile.id] ?? { played: 0, won: 0, lost: 0 };
      return {
        ...previous,
        matchesPlayed: previous.matchesPlayed + 1,
        matchesWon: previous.matchesWon + (didWin ? 1 : 0),
        matchesLost: previous.matchesLost + (didWin ? 0 : 1),
        byOpponent: {
          ...previous.byOpponent,
          [opponentProfile.id]: {
            played: currentOpponent.played + 1,
            won: currentOpponent.won + (didWin ? 1 : 0),
            lost: currentOpponent.lost + (didWin ? 0 : 1),
          },
        },
      };
    });
  };

  const resetRound = (nextHuman: LocalPlayer, nextAi: LocalPlayer, firstTurn: "human" | "ai" | "random") => {
    setHuman({
      ...nextHuman,
      board: [],
      total: 0,
      bust: false,
      stood: false,
      hasTiebreaker: false,
    });
    setAi({
      ...nextAi,
      name: opponentProfile.name,
      board: [],
      total: 0,
      bust: false,
      stood: false,
      hasTiebreaker: false,
    });
    setMainDeck(createMainDeck());
    setRoundNumber((value) => value + 1);
    setIsHumanTurn(firstTurn === "human" ? true : firstTurn === "ai" ? false : initialSetStarter === "human");
    setTurnStage("draw");
    setSideCardPlayedThisTurn(false);
    setPhase("playing");
  };

  const finishRound = () => {
    const scoredHuman = scorePlayer(human);
    const scoredAi = scorePlayer(ai);
    recordRoundTotals(scoredHuman, scoredAi);

    const nextHuman = { ...scoredHuman };
    const nextAi = { ...scoredAi };

    let summary = "Set tied.";
    let setWinner: "human" | "ai" | "none" = "none";

    if (scoredHuman.bust && !scoredAi.bust) {
      nextAi.roundWins += 1;
      setWinner = "ai";
      summary = `${ai.name} wins set ${roundNumber} (${scoredAi.total} vs bust).`;
      if (soundEnabled) playLocalTone("roundLoss");
      speakOpponent("winRound", "Good game.");
    } else if (!scoredHuman.bust && scoredAi.bust) {
      nextHuman.roundWins += 1;
      setWinner = "human";
      summary = `${human.name} wins set ${roundNumber} (${scoredHuman.total} vs bust).`;
      if (soundEnabled) playLocalTone("roundWin");
      speakOpponent("loseRound", "That did not go to plan.");
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredHuman.total > scoredAi.total) {
      nextHuman.roundWins += 1;
      setWinner = "human";
      summary = `${human.name} wins set ${roundNumber} (${scoredHuman.total} to ${scoredAi.total}).`;
      if (soundEnabled) playLocalTone("roundWin");
      speakOpponent("loseRound", "Well played.");
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredAi.total > scoredHuman.total) {
      nextAi.roundWins += 1;
      setWinner = "ai";
      summary = `${ai.name} wins set ${roundNumber} (${scoredAi.total} to ${scoredHuman.total}).`;
      if (soundEnabled) playLocalTone("roundLoss");
      speakOpponent("winRound", "As expected.");
    } else if (!scoredHuman.bust && !scoredAi.bust && scoredHuman.total === scoredAi.total) {
      if (scoredHuman.hasTiebreaker && !scoredAi.hasTiebreaker) {
        nextHuman.roundWins += 1;
        setWinner = "human";
        summary = `${human.name} wins set ${roundNumber} with Tiebreaker (${scoredHuman.total} tied).`;
        speakOpponent("loseRound", "A clever trick.");
      } else if (scoredAi.hasTiebreaker && !scoredHuman.hasTiebreaker) {
        nextAi.roundWins += 1;
        setWinner = "ai";
        summary = `${ai.name} wins set ${roundNumber} with Tiebreaker (${scoredAi.total} tied).`;
        speakOpponent("winRound", "Tiebreak secured.");
      }
    }

    setRoundSummary(summary);
    pushLog(summary);

    if (nextHuman.roundWins >= SETS_TO_WIN_LOCAL || nextAi.roundWins >= SETS_TO_WIN_LOCAL) {
      setHuman(nextHuman);
      setAi(nextAi);
      setPhase("game_end");
      const didHumanWin = nextHuman.roundWins >= SETS_TO_WIN_LOCAL;
      recordMatchOutcome(didHumanWin);
      if (soundEnabled) playLocalTone(didHumanWin ? "win" : "lose");
      speakOpponent(didHumanWin ? "loseGame" : "winGame", didHumanWin ? "You have won this match." : "Another victory.");
      return;
    }

    const nextFirst: "human" | "ai" | "random" = setWinner === "human" ? "ai" : setWinner === "ai" ? "human" : initialSetStarter;
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
    if (target === "human" && turnStage !== "draw") {
      return;
    }

    if (mainDeck.length === 0) {
      setPhase("round_end");
      return;
    }

    const value = mainDeck[mainDeck.length - 1]!;
    setMainDeck((previous) => previous.slice(0, -1));

    if (target === "human") {
      const next = scorePlayer({ ...human, board: [...human.board, value] });
      pushLog(`${human.name} draws ${value} (total ${next.total}).`);
      if (soundEnabled) playLocalTone("draw");
      setHuman(next);
      if (next.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else if (next.bust) {
        pushLog(`${human.name} must recover with one side card or the set is lost.`);
        setIsHumanTurn(true);
        setTurnStage("resolve");
        setSideCardPlayedThisTurn(false);
      } else {
        setIsHumanTurn(true);
        setTurnStage("resolve");
        setSideCardPlayedThisTurn(false);
      }
      return;
    }

    let next = scorePlayer({ ...ai, board: [...ai.board, value] });
    const autoStand = next.total === TARGET_SCORE && !next.bust;
    if (autoStand) {
      next = { ...next, stood: true };
      pushLog(`${ai.name} draws ${value} and auto-stands at 20.`);
    } else {
      pushLog(`${ai.name} draws ${value} (total ${next.total}).`);
    }
    setAi(next);
    if (next.bust || next.board.length >= MAX_BOARD) {
      setPhase("round_end");
    } else {
      setIsHumanTurn(true);
      setTurnStage("draw");
    }
  };

  const applyHumanSideCard = (cardId: string) => {
    if (turnStage !== "resolve" || sideCardPlayedThisTurn || flexPrompt) return;

    const card = human.sideDeck.find((entry) => entry.id === cardId && !entry.used);
    if (!card) return;

    const nextDeck = human.sideDeck.map((entry) => (entry.id === card.id ? { ...entry, used: true } : entry));

    if (card.type === "flex") {
      setFlexPrompt({ cardId: card.id, label: card.label, choices: [card.value, -card.value] });
      return;
    }

    if (card.type === "valueChange") {
      setFlexPrompt({ cardId: card.id, label: card.label, choices: [1, 2, -1, -2] });
      return;
    }

    if (card.type === "tiebreaker") {
      setFlexPrompt({ cardId: card.id, label: card.label, choices: [1, -1] });
      return;
    }

    if (card.type === "flip") {
      const flipValues = new Set([card.value, card.value * 2]);
      const flipped = human.board.map((v) => (flipValues.has(Math.abs(v)) ? -v : v));
      const next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...flipped, 0] });
      setHuman(next);
      pushLog(`${human.name} plays ${card.label} and flips the board (total ${next.total}).`);
      setSideCardPlayedThisTurn(true);
      if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
      else setTurnStage("resolve");
      return;
    }

    if (card.type === "copy") {
      const previousValue = human.board.at(-1);
      if (previousValue === undefined) return;
      const next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, previousValue] });
      setHuman(next);
      pushLog(`${human.name} plays ${card.label} as ${previousValue > 0 ? `+${previousValue}` : `${previousValue}`} (total ${next.total}).`);
      setSideCardPlayedThisTurn(true);
      if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
      else setTurnStage("resolve");
      return;
    }

    const sign = card.type === "minus" ? -1 : 1;
    const delta = sign * card.value;
    const next = scorePlayer({ ...human, sideDeck: nextDeck, board: [...human.board, delta] });
    if (soundEnabled) playLocalTone("card");
    setHuman(next);
    pushLog(`${human.name} plays ${card.label} as ${delta > 0 ? `+${delta}` : `${delta}`} (total ${next.total}).`);
    setSideCardPlayedThisTurn(true);
    if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
    else setTurnStage("resolve");
  };

  const confirmFlex = (delta: number) => {
    if (!flexPrompt || sideCardPlayedThisTurn) return;
    const card = human.sideDeck.find((c) => c.id === flexPrompt.cardId && !c.used);
    setFlexPrompt(null);
    if (!card) return;

    const nextDeck = human.sideDeck.map((c) => (c.id === card.id ? { ...c, used: true } : c));
    const next = scorePlayer({
      ...human,
      sideDeck: nextDeck,
      board: [...human.board, delta],
      hasTiebreaker: card.type === "tiebreaker" ? true : human.hasTiebreaker,
    });

    setHuman(next);
    pushLog(`${human.name} plays ${card.label} as ${delta > 0 ? `+${delta}` : `${delta}`} (total ${next.total}).`);
    setSideCardPlayedThisTurn(true);
    if (next.bust || next.board.length >= MAX_BOARD) setPhase("round_end");
    else setTurnStage("resolve");
  };

  const humanStand = () => {
    if (soundEnabled) playLocalTone("stand");
    setHuman((previous) => ({ ...previous, stood: true }));
    pushLog(`${human.name} stands on ${human.total}.`);
    setIsHumanTurn(false);
    setTurnStage("draw");
    setSideCardPlayedThisTurn(false);
  };

  const humanEndTurn = () => {
    if (human.bust) {
      pushLog(`${human.name} cannot recover and busts at ${human.total}.`);
      setPhase("round_end");
      return;
    }

    pushLog(`${human.name} ends the turn at ${human.total}.`);
    setIsHumanTurn(false);
    setTurnStage("draw");
    setSideCardPlayedThisTurn(false);
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
      setTurnStage("draw");
      setSideCardPlayedThisTurn(false);
      return;
    }

    const delay = getAiDelay(difficulty);
    const timeout = window.setTimeout(() => {
      if (mainDeck.length === 0) {
        setPhase("round_end");
        return;
      }

      const value = mainDeck[mainDeck.length - 1]!;
      setMainDeck((previous) => previous.slice(0, -1));

      let drawnAi = scorePlayer({ ...ai, board: [...ai.board, value] });
      if (drawnAi.total === TARGET_SCORE && !drawnAi.bust) {
        drawnAi = { ...drawnAi, stood: true };
        pushLog(`${ai.name} draws ${value} and auto-stands at 20.`);
      } else {
        pushLog(`${ai.name} draws ${value} (total ${drawnAi.total}).`);
      }

      if (drawnAi.bust) {
        const rescue = aiPickRescueCard(drawnAi);
        if (rescue) {
          const rescuedDeck = drawnAi.sideDeck.map((c) => (c.id === rescue.id ? { ...c, used: true } : c));
          const rescueDelta = getAiRecoveryDelta(rescue, drawnAi.total - TARGET_SCORE);
          drawnAi = scorePlayer({ ...drawnAi, sideDeck: rescuedDeck, board: [...drawnAi.board, rescueDelta] });
          pushLog(`${ai.name} plays ${rescue.label} to recover (total ${drawnAi.total}).`);
          speakOpponent("play", "Adjusting the board.");
        }
      } else if (!drawnAi.stood) {
        const exactCard = aiPickExactCard(drawnAi);
        if (exactCard) {
          const exactDeck = drawnAi.sideDeck.map((c) => (c.id === exactCard.id ? { ...c, used: true } : c));
          const exactDelta = getAiExactDelta(exactCard, TARGET_SCORE - drawnAi.total);
          drawnAi = scorePlayer({ ...drawnAi, sideDeck: exactDeck, board: [...drawnAi.board, exactDelta] });
          if (drawnAi.total === TARGET_SCORE && !drawnAi.bust) drawnAi = { ...drawnAi, stood: true };
          pushLog(`${ai.name} plays ${exactCard.label} for an exact finish at ${drawnAi.total}.`);
          speakOpponent("play", "A precise move.");
        } else {
          const yellowCard = aiPickYellowCard(drawnAi, human);
          if (yellowCard) {
            if (yellowCard.type === "flip") {
              const flipValues = new Set([yellowCard.value, yellowCard.value * 2]);
              const flippedBoard = drawnAi.board.map((v) => (flipValues.has(Math.abs(v)) ? -v : v));
              const yellowDeck = drawnAi.sideDeck.map((c) => (c.id === yellowCard.id ? { ...c, used: true } : c));
              drawnAi = scorePlayer({ ...drawnAi, sideDeck: yellowDeck, board: [...flippedBoard, 0] });
              if (drawnAi.total === TARGET_SCORE && !drawnAi.bust) drawnAi = { ...drawnAi, stood: true };
              pushLog(`${ai.name} plays ${yellowCard.label} and flips the board (total ${drawnAi.total}).`);
            } else if (yellowCard.type === "tiebreaker") {
              const yellowDeck = drawnAi.sideDeck.map((c) => (c.id === yellowCard.id ? { ...c, used: true } : c));
              const tiebreakerDelta = Math.abs(human.total - drawnAi.total) === 1 ? human.total - drawnAi.total : 1;
              drawnAi = scorePlayer({ ...drawnAi, sideDeck: yellowDeck, board: [...drawnAi.board, tiebreakerDelta], hasTiebreaker: true });
              if (drawnAi.total === TARGET_SCORE && !drawnAi.bust) drawnAi = { ...drawnAi, stood: true };
              pushLog(`${ai.name} plays Tiebreaker (total ${drawnAi.total}).`);
            }
            speakOpponent("play", "Let us see if you can answer that.");
          } else {
            const setupCard = aiPickSetupCard(drawnAi, difficulty);
            if (setupCard) {
              const setupDeck = drawnAi.sideDeck.map((c) => (c.id === setupCard.id ? { ...c, used: true } : c));
              drawnAi = scorePlayer({ ...drawnAi, sideDeck: setupDeck, board: [...drawnAi.board, setupCard.value] });
              pushLog(`${ai.name} plays ${setupCard.label} (+${setupCard.value} to ${drawnAi.total}).`);
              speakOpponent("play", "Setting up the next hand.");
            }
          }
        }
      }

      if (!drawnAi.bust && !drawnAi.stood && aiShouldStand(drawnAi, human, difficulty, opponentProfile)) {
        drawnAi = { ...drawnAi, stood: true };
        pushLog(`${ai.name} stands on ${drawnAi.total}.`);
        speakOpponent("stand", "I will stand.");
      }

      setAi(drawnAi);
      if (drawnAi.bust || drawnAi.board.length >= MAX_BOARD) {
        setPhase("round_end");
      } else if (human.stood && !drawnAi.stood) {
        // If the player has already stood, the AI keeps taking turns until it stands or busts.
        setIsHumanTurn(false);
        setTurnStage("draw");
        setSideCardPlayedThisTurn(false);
      } else {
        setIsHumanTurn(true);
        setTurnStage("draw");
        setSideCardPlayedThisTurn(false);
      }
    }, delay);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, difficulty, human, isHumanTurn, mainDeck, opponentProfile, phase]);

  useEffect(() => {
    if (phase === "round_end") {
      finishRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const canDraw = phase === "playing" && isHumanTurn && !human.stood && !human.bust && turnStage === "draw";
  const canResolveTurn = phase === "playing" && isHumanTurn && !human.stood && turnStage === "resolve" && flexPrompt === null;
  const canStand = canResolveTurn && !human.bust;
  const canPlaySideCard = canResolveTurn && !sideCardPlayedThisTurn;
  const canPlaySpecificSideCard = (card: LocalSideCard): boolean => {
    return canPlaySideCard && !card.used && (card.type !== "copy" || human.board.length > 0);
  };
  const canEndTurn = canResolveTurn && human.board.length > 0;
  const hasStartedMatch = roundNumber > 1
    || human.board.length > 0
    || ai.board.length > 0
    || human.roundWins > 0
    || ai.roundWins > 0;

  const handleExitFromLocalGame = () => {
    if (phase !== "game_end" && hasStartedMatch && !confirm("Leave local practice and lose current progress?")) {
      return;
    }

    onExit();
  };

  const continueToNextRound = () => {
    if (!setResult) return;
    const { nextHuman, nextAi, nextFirst } = setResult;
    setSetResult(null);
    resetRound(nextHuman, nextAi, nextFirst);
  };

  const restartGame = () => {
    const freshHuman = createPlayer(username || "Player");
    const freshAi = createPlayer(opponentProfile.name, createOpponentSideDeck(opponentProfile));
    setHuman(freshHuman);
    setAi(freshAi);
    setMainDeck(createMainDeck());
    setPhase("playing");
    const nextStarter = pickLocalStarter();
    setInitialSetStarter(nextStarter);
    setIsHumanTurn(nextStarter === "human");
    setTurnStage("draw");
    setSideCardPlayedThisTurn(false);
    setRoundNumber(1);
    setRoundSummary("New match started.");
    setLastOpponentLines({ chosen: opponentProfile.phrases.chosen[0] ?? "..." });
    setActionLog([
      `${opponentProfile.name}: ${opponentProfile.phrases.chosen[0] ?? "..."}`,
      "New match started.",
    ]);
    setSetResult(null);
  };

  useEffect(() => {
    if (!setResult) {
      return;
    }

    continueButtonRef.current?.focus();
  }, [setResult]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput = target !== null
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (isTextInput) {
        return;
      }

      if (event.key === "Escape") {
        if (setResult) {
          event.preventDefault();
          continueToNextRound();
          return;
        }

        if (phase === "game_end") {
          event.preventDefault();
          handleExitFromLocalGame();
          return;
        }

        if (hasStartedMatch) {
          event.preventDefault();
          handleExitFromLocalGame();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey || event.altKey) || event.repeat) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "d":
          if (canDraw) {
            event.preventDefault();
            drawFor("human");
          }
          break;
        case "s":
          if (canStand) {
            event.preventDefault();
            humanStand();
          }
          break;
        case "e":
          if (canEndTurn) {
            event.preventDefault();
            humanEndTurn();
          }
          break;
        case "m": {
          event.preventDefault();
          const next = !soundEnabled;
          setSoundEnabled(next);
          setStoredSoundEnabled(next);
          break;
        }
        case "n": {
          event.preventDefault();
          const next = !musicEnabled;
          setMusicEnabled(next);
          setStoredMusicEnabled(next);
          break;
        }
        case "r":
          if (phase === "game_end") {
            event.preventDefault();
            restartGame();
          }
          break;
        default: {
          // Number keys 1–9, 0 → play side cards in order
          const num = event.key >= "1" && event.key <= "9" ? parseInt(event.key) - 1
            : event.key === "0" ? 9
            : -1;
          if (num >= 0 && canPlaySideCard && !flexPrompt) {
            const availableCards = human.sideDeck.filter((c) => !c.used);
            const card = availableCards[num];
            if (card && canPlaySpecificSideCard(card)) {
              event.preventDefault();
              applyHumanSideCard(card.id);
            }
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    ai.board.length,
    ai.roundWins,
    canDraw,
    canEndTurn,
    canPlaySideCard,
    canStand,
    hasStartedMatch,
    human.board.length,
    human.roundWins,
    musicEnabled,
    phase,
    setResult,
    soundEnabled,
  ]);

  const opponentStats = stats.byOpponent[opponentProfile.id] ?? { played: 0, won: 0, lost: 0 };

  return (
    <div className="screen screen--lobby">
      <div className="local-game">
        <div className="local-game__topbar">
          <div className="local-game__topbar-brand">
            <span aria-hidden="true">◆</span>
            <span>PazaakWorld</span>
          </div>
          <div className="local-game__topbar-account" aria-label="Current pilot account">
            <span className="local-game__topbar-account-icon" aria-hidden="true">◌</span>
            <span className="local-game__topbar-account-copy">
              <strong>{human.name}</strong>
              <small>Local Practice</small>
            </span>
          </div>
          <div className="local-game__topbar-controls" role="toolbar" aria-label="Local practice controls">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => { const next = !soundEnabled; setSoundEnabled(next); setStoredSoundEnabled(next); }}
              title={soundEnabled ? "Mute sounds" : "Enable sounds"}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? "Mute sounds" : "Enable sounds"}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => { const next = !musicEnabled; setMusicEnabled(next); setStoredMusicEnabled(next); }}
              title={musicEnabled ? "Stop ambient music" : "Play ambient music"}
              aria-pressed={musicEnabled}
              aria-label={musicEnabled ? "Stop ambient music" : "Play ambient music"}
            >
              {musicEnabled ? "🎵" : "🎵̶"}
            </button>
            <button className="btn btn--ghost" onClick={handleExitFromLocalGame}>Back to Lobby</button>
          </div>
        </div>
        <section className="local-game__header">
          <h1>Local Practice</h1>
          <p>{human.name} vs {ai.name} · Difficulty {formatDifficulty(difficulty)}</p>
          <p>{opponentProfile.description}</p>
          <p>Set {roundNumber} · First to {SETS_TO_WIN_LOCAL} wins</p>
        </section>

        {setResult ? (
          <div
            data-testid="round-overlay"
            className="local-game__overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-set-result-title"
            aria-describedby="local-set-result-summary"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                continueToNextRound();
              }
            }}
          >
            <div className="local-game__set-result" role="document">
              <h2 id="local-set-result-title">Set {roundNumber} Complete</h2>
              <p id="local-set-result-summary" className="local-game__set-result__summary">{setResult.summary}</p>
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
              <p className="local-game__set-result__series">Series: {human.name} {setResult.humanWins} - {setResult.aiWins} {ai.name}</p>
              <button ref={continueButtonRef} className="btn btn--primary" onClick={continueToNextRound}>Continue</button>
            </div>
          </div>
        ) : null}

        <section className="local-game__layout">
          <section className="local-game__players">
            <article className="local-game__player-card">
              <h2>{human.name} {isHumanTurn && phase === "playing" ? "(Your turn)" : ""}</h2>
              <p>
                Total: <span className={human.bust ? "score--bust" : human.total === TARGET_SCORE ? "score--perfect" : ""}>{human.bust ? "BUST" : human.total}</span>
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
                    {flexPrompt.choices.map((choice) => (
                      <button
                        key={choice}
                        className={`btn ${choice > 0 ? "btn--primary" : "btn--secondary"} btn--sm`}
                        onClick={() => confirmFlex(choice)}
                      >
                        {choice > 0 ? `+${choice}` : `${choice}`}
                      </button>
                    ))}
                  </div>
                ) : (
                  human.sideDeck.map((card) => (
                    <button
                      key={card.id}
                      className={`btn btn--card btn--sm${card.used ? " btn--card--used" : ""}`}
                      onClick={() => applyHumanSideCard(card.id)}
                      disabled={!canPlaySpecificSideCard(card)}
                      aria-label={`Play side card ${card.label}`}
                      title={`Play ${card.label}`}
                    >
                      {card.label}
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="local-game__player-card">
              <h2>
                {ai.name}
                {!isHumanTurn && phase === "playing" ? (
                  <span className="ai-thinking" aria-label="thinking">
                    <span className="ai-thinking__spinner" aria-hidden="true" /> thinking...
                  </span>
                ) : null}
              </h2>
              <p>
                Total: <span className={ai.bust ? "score--bust" : ai.total === TARGET_SCORE ? "score--perfect" : ""}>{ai.bust ? "BUST" : ai.total}</span>
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

          <aside className="local-game__intel">
            <article className="local-game__intel-card">
              <h3>Opponent Intel</h3>
              <p>{opponentProfile.description}</p>
              <p>{opponentProfile.species} · {opponentProfile.origin}</p>
              <p>Archetype: {opponentProfile.archetype}</p>
              <p>Stand threshold: {getStandThreshold(difficulty, opponentProfile)} · Tie accept: {opponentProfile.tieChance}%</p>
              <p>Deck: {opponentProfile.sideDeckTokens.join(" ")}</p>
              {latestOpponentQuote ? (
                <blockquote className="local-game__opponent-quote" aria-live="polite">
                  “{latestOpponentQuote}”
                </blockquote>
              ) : null}
            </article>
            <article className="local-game__intel-card">
              <h3>Practice Record</h3>
              <ul className="local-game__stats-list">
                <li><span>Match W-L</span><strong>{stats.matchesWon}-{stats.matchesLost}</strong></li>
                <li><span>Win Rate</span><strong>{toPercent(stats.matchesWon, stats.matchesPlayed)}</strong></li>
                <li><span>Sets W-L</span><strong>{stats.roundsWon}-{stats.roundsLost}</strong></li>
                <li><span>Perfect 20s</span><strong>{stats.perfect20s}</strong></li>
                <li><span>Vs {opponentProfile.name}</span><strong>{opponentStats.won}-{opponentStats.lost}</strong></li>
              </ul>
            </article>
          </aside>
        </section>

        <section className="local-game__actions">
          <button data-testid="draw-btn" className="btn btn--primary" onClick={() => drawFor("human")} disabled={!canDraw}>Draw</button>
          <button data-testid="stand-btn" className="btn btn--secondary" onClick={humanStand} disabled={!canStand}>Stand</button>
          <button className="btn btn--secondary" onClick={humanEndTurn} disabled={!canEndTurn}>End Turn</button>
          {phase === "game_end" ? (
            <span className="local-game__result">
              <strong>Winner: {winner}</strong>
              <button className="btn btn--primary" onClick={restartGame}>Play Again</button>
              <button className="btn btn--ghost" onClick={handleExitFromLocalGame}>Back to Lobby</button>
            </span>
          ) : (
            <span role="status" aria-live="polite">{roundSummary}</span>
          )}
        </section>

        <section className="local-game__log">
          <h3>Game Log</h3>
          <ul>
            {actionLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
          </ul>
        </section>

        <div className="local-game__shortcuts" aria-label="Keyboard shortcuts">
          <kbd>D</kbd> Draw
          <kbd>S</kbd> Stand
          <kbd>E</kbd> End turn
          <kbd>1</kbd>–<kbd>0</kbd> Side card
          <kbd>M</kbd> Sound
          <kbd>N</kbd> Music
          <kbd>R</kbd> Restart
          <kbd>Esc</kbd> Exit
        </div>
      </div>
    </div>
  );
}

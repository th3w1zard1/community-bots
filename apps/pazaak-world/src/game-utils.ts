import type { AdvisorAction, AdvisorCategory, AdvisorConfidence, AdvisorDifficulty, AdvisorSnapshot, SerializedMatch, SerializedPlayerState, SideCardOption, SideCardType } from "./types.ts";

/** Mirrors getSideCardOptionsForPlayer from @openkotor/pazaak-engine (browser-safe). */
export function getSideCardOptions(player: SerializedPlayerState): SideCardOption[] {
  const options: SideCardOption[] = [];
  const previousBoardValue = player.board.at(-1)?.value;
  const previousBoardLabel = previousBoardValue === undefined
    ? "D"
    : `D (= ${previousBoardValue > 0 ? `+${previousBoardValue}` : `${previousBoardValue}`})`;

  for (const card of player.hand) {
    if (player.usedCardIds.includes(card.id)) continue;

    switch (card.type) {
      case "plus":
        options.push({ cardId: card.id, displayLabel: `+${card.value}`, appliedValue: card.value });
        break;

      case "minus":
        options.push({ cardId: card.id, displayLabel: `-${card.value}`, appliedValue: -card.value });
        break;

      case "flip":
        options.push(
          { cardId: card.id, displayLabel: `+${card.value}`, appliedValue: card.value },
          { cardId: card.id, displayLabel: `-${card.value}`, appliedValue: -card.value },
        );
        break;

      case "value_change":
        options.push(
          { cardId: card.id, displayLabel: "+1", appliedValue: 1 },
          { cardId: card.id, displayLabel: "+2", appliedValue: 2 },
          { cardId: card.id, displayLabel: "-1", appliedValue: -1 },
          { cardId: card.id, displayLabel: "-2", appliedValue: -2 },
        );
        break;

      case "copy_previous":
        if (previousBoardValue !== undefined) {
          options.push({ cardId: card.id, displayLabel: previousBoardLabel, appliedValue: previousBoardValue });
        }
        break;

      case "tiebreaker":
        options.push(
          { cardId: card.id, displayLabel: "+1T", appliedValue: 1 },
          { cardId: card.id, displayLabel: "-1T", appliedValue: -1 },
        );
        break;

      case "flip_two_four":
        options.push({ cardId: card.id, displayLabel: "Flip 2&4", appliedValue: 0 });
        break;

      case "flip_three_six":
        options.push({ cardId: card.id, displayLabel: "Flip 3&6", appliedValue: 0 });
        break;
    }
  }

  return options;
}

interface EvaluatedAdvisorOption {
  option: SideCardOption;
  score: number;
  total: number;
  usesTiebreaker: boolean;
  category: AdvisorCategory;
  rationale: string;
}

interface AdvisorSimulation {
  total: number;
  usesTiebreaker: boolean;
  totalDelta: number;
  flippedCards: number;
}

interface AdvisorMatchContext {
  playerOnMatchPoint: boolean;
  opponentOnMatchPoint: boolean;
  leadingMatch: boolean;
  trailingMatch: boolean;
}

const formatSignedValue = (value: number): string => {
  return value > 0 ? `+${value}` : `${value}`;
};

export function getAdvisorSnapshot(
  match: SerializedMatch,
  userId: string,
  difficulty: AdvisorDifficulty = "professional",
): AdvisorSnapshot | null {
  if (match.phase === "completed") {
    return null;
  }

  const player = match.players.find((entry) => entry.userId === userId);

  if (!player || player.stood) {
    return null;
  }

  const currentPlayer = match.players[match.activePlayerIndex];

  if (!currentPlayer || currentPlayer.userId !== userId) {
    return null;
  }

  const opponent = match.players.find((entry) => entry.userId !== userId);

  if (!opponent) {
    return null;
  }

  const matchContext = getAdvisorMatchContext(player, opponent, match.setsToWin ?? SETS_TO_WIN);

  if (match.phase === "turn") {
    return {
      recommendation: {
        action: "draw",
        rationale: "You have not drawn yet. The next decision window only opens after a main-deck draw.",
      },
      difficulty,
      category: "neutral",
      confidence: "high",
      bustProbability: calculateBustProbability(player.total),
      alternatives: [],
    };
  }

  const cardOptions = getSideCardOptions(player);
  const currentBustProbability = calculateBustProbability(player.total);
  const beneficialOptions = cardOptions
    .map((option) => evaluateAdvisorOption(player, opponent, option, currentBustProbability))
    .filter((option): option is EvaluatedAdvisorOption => option !== null)
    .sort((left, right) => right.score - left.score);
  const bestOption = beneficialOptions[0] ?? null;
  const hasRecoveryOption = beneficialOptions.some((option) => option.total <= WIN_SCORE && option.total < player.total);
  const alternatives = beneficialOptions.slice(0, 3).map((option) => ({
    displayLabel: option.option.displayLabel,
    rationale: option.rationale,
    category: option.category,
    score: option.score,
  }));

  if (player.total > WIN_SCORE) {
    if (match.phase === "after-draw" && bestOption) {
      return {
        recommendation: {
          action: "play_side",
          cardId: bestOption.option.cardId,
          appliedValue: bestOption.option.appliedValue,
          displayLabel: bestOption.option.displayLabel,
          rationale: `${bestOption.rationale} You are currently over ${WIN_SCORE}, so this recovery has to happen before ending the turn.`,
        },
        difficulty,
        category: "recovery",
        confidence: "high",
        bustProbability: 1,
        alternatives,
      };
    }

    return {
      recommendation: {
        action: "end_turn",
        rationale: `No safe recovery card is available. Ending the turn confirms the bust at ${player.total}.`,
      },
      difficulty,
      category: "recovery",
      confidence: "high",
      bustProbability: 1,
      alternatives,
    };
  }

  if (match.phase === "after-draw" && player.board.length === MAX_BOARD_SIZE - 1 && bestOption) {
    return {
      recommendation: {
        action: "play_side",
        cardId: bestOption.option.cardId,
        appliedValue: bestOption.option.appliedValue,
        displayLabel: bestOption.option.displayLabel,
        rationale: `${bestOption.rationale} More importantly, any safe side-card play here fills your ninth slot and wins the set immediately.`,
      },
      difficulty,
      category: "pressure",
      confidence: "high",
      bustProbability: currentBustProbability,
      alternatives,
    };
  }

  if (match.phase === "after-draw" && bestOption && shouldPlayRecommendedOption(player, opponent, bestOption, difficulty, matchContext)) {
    return {
      recommendation: {
        action: "play_side",
        cardId: bestOption.option.cardId,
        appliedValue: bestOption.option.appliedValue,
        displayLabel: bestOption.option.displayLabel,
        rationale: bestOption.rationale,
      },
      difficulty,
      category: bestOption.category,
      confidence: getAdvisorConfidence(bestOption.score),
      bustProbability: currentBustProbability,
      alternatives,
    };
  }

  if (shouldStandForAdvisor(player, opponent, difficulty, currentBustProbability, hasRecoveryOption, matchContext)) {
    return {
      recommendation: {
        action: "stand",
        rationale: buildStandRationale(player, opponent, currentBustProbability, hasRecoveryOption, matchContext),
      },
      difficulty,
      category: opponent.stood ? "pressure" : "neutral",
      confidence: currentBustProbability >= 0.7 || player.total >= 18 ? "high" : "medium",
      bustProbability: currentBustProbability,
      alternatives,
    };
  }

  return {
    recommendation: {
      action: "end_turn",
      rationale: buildEndTurnRationale(player, opponent, difficulty, bestOption, matchContext),
    },
    difficulty,
    category: bestOption?.category ?? "neutral",
    confidence: bestOption ? getAdvisorConfidence(Math.max(0, bestOption.score - 80)) : "medium",
    bustProbability: currentBustProbability,
    alternatives,
  };
}

export function recommendMove(
  match: SerializedMatch,
  userId: string,
  difficulty: AdvisorDifficulty = "professional",
): AdvisorAction | null {
  return getAdvisorSnapshot(match, userId, difficulty)?.recommendation ?? null;
}

const evaluateAdvisorOption = (
  player: SerializedPlayerState,
  opponent: SerializedPlayerState,
  option: SideCardOption,
  currentBustProbability: number,
): EvaluatedAdvisorOption | null => {
  const card = player.hand.find((entry) => entry.id === option.cardId);

  if (!card) {
    return null;
  }

  const simulation = simulateAdvisorSideCard(player, option, card.type);
  const nextBustProbability = calculateBustProbability(simulation.total);
  const previousBoardValue = player.board.at(-1)?.value;

  if (simulation.total > WIN_SCORE) {
    return null;
  }

  let score = simulation.total * 10 - nextBustProbability * 15;
  let rationale = `${option.displayLabel} moves your total to ${simulation.total}.`;
  let category: AdvisorCategory = "neutral";

  if (simulation.total === WIN_SCORE) {
    score += 1000;
    category = "exact";
    rationale = `${option.displayLabel} lands exactly on ${WIN_SCORE}, which is the cleanest finish available.`;
  } else if (opponent.stood && simulation.total > opponent.total) {
    score += 900;
    category = "pressure";
    rationale = `${option.displayLabel} moves you past ${opponent.displayName}'s standing ${opponent.total}.`;
  } else if (opponent.stood && simulation.total === opponent.total && simulation.usesTiebreaker) {
    score += 880;
    category = "pressure";
    rationale = `${option.displayLabel} ties ${opponent.displayName} at ${simulation.total} while giving you the Tiebreaker edge.`;
  } else if (simulation.total > player.total) {
    score += 120;
    category = simulation.total >= 16 ? "setup" : "neutral";
    rationale = simulation.total >= 16
      ? `${option.displayLabel} sets you up on ${simulation.total}, which keeps live pressure on the next draw.`
      : `${option.displayLabel} improves your board without putting you over ${WIN_SCORE}.`;
  } else if (simulation.total < player.total) {
    score += 40;
    category = "recovery";
    rationale = `${option.displayLabel} is a recovery play that lowers your total to a safer ${simulation.total}.`;
  }

  if (category === "recovery" && currentBustProbability >= 0.5) {
    score += 140;
  }

  if (category === "setup" && player.total <= 15 && simulation.total >= 16 && simulation.total <= 18) {
    score += 110;
  }

  if (card.type === "tiebreaker" && (simulation.total >= 18 || opponent.stood)) {
    score += 85;
    if (category === "neutral" || category === "setup") {
      rationale = `${option.displayLabel} keeps the Tiebreaker live, so a tied stand still breaks your way.`;
    }
  }

  if (card.type === "copy_previous") {
    if (simulation.total === player.total) {
      score -= 120;
      rationale = `${option.displayLabel} only copies a neutral 0 right now, so it spends D without changing the board.`;
    } else if (previousBoardValue !== undefined && previousBoardValue < 0) {
      score += 130;
      category = category === "pressure" ? category : "recovery";
      rationale = `${option.displayLabel} copies your last ${formatSignedValue(previousBoardValue)}, which gives D a clean recovery line here.`;
    } else if (previousBoardValue !== undefined && previousBoardValue > 0 && simulation.total >= 17 && simulation.total < WIN_SCORE) {
      score += 75;
      if (category === "neutral") {
        category = "setup";
      }
      rationale = `${option.displayLabel} repeats your last ${formatSignedValue(previousBoardValue)} to build a stronger standing total.`;
    }
  }

  if (card.type === "value_change") {
    if (category === "exact") {
      score += 60;
      rationale = `${option.displayLabel} uses VV as a precise ${formatSignedValue(option.appliedValue)} to land exactly on ${WIN_SCORE}.`;
    } else if (option.appliedValue < 0 && currentBustProbability >= 0.5) {
      score += 95;
      category = category === "pressure" ? category : "recovery";
      rationale = `${option.displayLabel} turns VV into a recovery tool and cuts your next-draw bust risk to ${Math.round(nextBustProbability * 100)}%.`;
    } else if (option.appliedValue > 0 && simulation.total >= 17 && simulation.total < WIN_SCORE) {
      score += 65;
      if (category === "neutral") {
        category = "setup";
      }
      rationale = `${option.displayLabel} uses VV as a flexible push to ${simulation.total} without committing a larger fixed card.`;
    }
  }

  if (card.type === "flip_two_four" || card.type === "flip_three_six") {
    if (simulation.flippedCards === 0) {
      score -= 160;
      rationale = `${option.displayLabel} does not meaningfully change the current board, so it is a weak use of the card.`;
    } else if (simulation.total < player.total) {
      score += 70 + simulation.flippedCards * 55;
      if (currentBustProbability >= 0.5) {
        score += 80;
      }
      category = category === "exact" || category === "pressure" ? category : "recovery";
      rationale = `${option.displayLabel} flips ${simulation.flippedCards} live board card${simulation.flippedCards === 1 ? "" : "s"} and drops you to ${simulation.total}, which is a strong special-card recovery line.`;
    } else {
      score += 40 + simulation.flippedCards * 45;
      if (simulation.total >= 17 && simulation.total <= WIN_SCORE) {
        score += 55;
      }
      if (category === "neutral") {
        category = simulation.total >= 16 ? "setup" : "neutral";
      }
      rationale = `${option.displayLabel} flips ${simulation.flippedCards} live board card${simulation.flippedCards === 1 ? "" : "s"} and improves your pressure total to ${simulation.total}.`;
    }
  }

  return {
    option,
    score,
    total: simulation.total,
    usesTiebreaker: simulation.usesTiebreaker,
    category,
    rationale,
  };
};

const simulateAdvisorSideCard = (
  player: SerializedPlayerState,
  option: SideCardOption,
  sourceType: SideCardType,
): AdvisorSimulation => {
  if (sourceType !== "flip_two_four" && sourceType !== "flip_three_six") {
    return {
      total: player.total + option.appliedValue,
      usesTiebreaker: sourceType === "tiebreaker" || player.hasTiebreaker,
      totalDelta: option.appliedValue,
      flippedCards: 0,
    };
  }

  const targets = sourceType === "flip_two_four" ? [2, 4] : [3, 6];
  let totalDelta = 0;
  let flippedCards = 0;

  for (const boardCard of player.board) {
    const isFlippable = !boardCard.frozen && (boardCard.source === undefined || boardCard.source === "plus" || boardCard.source === "minus");

    if (isFlippable && targets.includes(boardCard.value)) {
      totalDelta += -2 * boardCard.value;
      flippedCards += 1;
    }
  }

  return {
    total: player.total + totalDelta,
    usesTiebreaker: player.hasTiebreaker,
    totalDelta,
    flippedCards,
  };
};

const shouldPlayRecommendedOption = (
  player: SerializedPlayerState,
  opponent: SerializedPlayerState,
  option: EvaluatedAdvisorOption,
  difficulty: AdvisorDifficulty,
  matchContext: AdvisorMatchContext,
): boolean => {
  if (player.board.length === MAX_BOARD_SIZE - 1 && option.total <= WIN_SCORE) {
    return true;
  }

  if (option.total === WIN_SCORE) {
    return true;
  }

  if (opponent.stood && option.total > opponent.total) {
    return true;
  }

  if (opponent.stood && option.total === opponent.total && option.usesTiebreaker) {
    return true;
  }

  switch (difficulty) {
    case "easy":
      return player.total > WIN_SCORE - 3 && option.total >= player.total;
    case "hard":
      return option.category === "exact"
        || option.category === "pressure"
        || (matchContext.opponentOnMatchPoint && option.total >= 17)
        || (option.category === "recovery" && player.total >= 18)
        || option.total >= 17
        || option.total > player.total;
    case "professional":
      return option.category === "exact"
        || option.category === "pressure"
        || (matchContext.opponentOnMatchPoint && option.total >= 16)
        || (option.category === "recovery" && (player.total >= 18 || option.score >= 220))
        || (option.category === "setup" && option.score >= 250)
        || (matchContext.trailingMatch && option.category === "setup" && option.total >= 16)
        || option.score >= 320;
  }
};

const shouldStandForAdvisor = (
  player: SerializedPlayerState,
  opponent: SerializedPlayerState,
  difficulty: AdvisorDifficulty,
  bustProbability: number,
  hasRecoveryOption: boolean,
  matchContext: AdvisorMatchContext,
): boolean => {
  if (player.total > WIN_SCORE) {
    return false;
  }

  if (player.total >= WIN_SCORE) {
    return true;
  }

  if (player.board.length === MAX_BOARD_SIZE - 1 && hasRecoveryOption) {
    return false;
  }

  if (opponent.stood) {
    if (player.total > opponent.total) {
      return true;
    }

    if (player.total === opponent.total && player.hasTiebreaker) {
      return true;
    }
  }

  switch (difficulty) {
    case "easy":
      if (matchContext.opponentOnMatchPoint && player.total <= 18) return false;
      return player.total >= 17;
    case "hard":
      if (matchContext.opponentOnMatchPoint && player.total <= 17) return false;
      if (player.total >= 19) return true;
      if (matchContext.playerOnMatchPoint && player.total >= 17 && bustProbability >= 0.4) return true;
      if (player.total >= 17 && (bustProbability >= 0.5 || !hasRecoveryOption)) return true;
      return false;
    case "professional":
      if (player.total <= 14) return false;
      if (matchContext.opponentOnMatchPoint && player.total <= 17 && hasRecoveryOption) return false;
      if (player.total >= 18) return true;
      if (matchContext.playerOnMatchPoint && player.total >= 17 && bustProbability >= 0.4) return true;
      if (matchContext.leadingMatch && player.total >= 17 && bustProbability >= 0.5) return true;
      if (bustProbability > 0.7) return true;
      if (!hasRecoveryOption && player.total >= 17) return true;
      return false;
  }
};

const buildStandRationale = (
  player: SerializedPlayerState,
  opponent: SerializedPlayerState,
  bustProbability: number,
  hasRecoveryOption: boolean,
  matchContext: AdvisorMatchContext,
): string => {
  if (player.total >= WIN_SCORE) {
    return `Stand now. You are already sitting on ${player.total}.`;
  }

  if (opponent.stood && player.total > opponent.total) {
    return `Stand now. ${player.total} already beats ${opponent.displayName}'s standing ${opponent.total}.`;
  }

  if (opponent.stood && player.total === opponent.total && player.hasTiebreaker) {
    return `Stand now. You are tied at ${player.total}, but your Tiebreaker should carry the set.`;
  }

  if (matchContext.playerOnMatchPoint && player.total >= 17) {
    return `Stand now. You are one set from winning the match, so ${player.total} is strong enough to protect the lead.`;
  }

  if (matchContext.leadingMatch && player.total >= 17 && bustProbability >= 0.5) {
    return `Stand now. You are already ahead in sets, so there is no reason to overextend from ${player.total}.`;
  }

  if (!hasRecoveryOption && player.total >= 17) {
    return `Stand now. ${player.total} is solid and your remaining hand does not offer much recovery if the next draw goes bad.`;
  }

  return `Stand now. At ${player.total}, the bust pressure on another draw is about ${Math.round(bustProbability * 100)}%.`;
};

const buildEndTurnRationale = (
  player: SerializedPlayerState,
  opponent: SerializedPlayerState,
  difficulty: AdvisorDifficulty,
  bestOption: EvaluatedAdvisorOption | null,
  matchContext: AdvisorMatchContext,
): string => {
  if (player.total > WIN_SCORE) {
    return `End the turn only if you accept the bust. You are at ${player.total}, so a recovery side card is the only way out.`;
  }

  if (opponent.stood && player.total < opponent.total) {
    return `End the turn if you want to keep pressing later. You still trail ${opponent.displayName}'s ${opponent.total}, so standing here would probably concede the set.`;
  }

  if (matchContext.opponentOnMatchPoint && player.total <= 17) {
    return `End the turn only if you need to keep pushing later. You are trailing the match, so this set still needs a more aggressive finish.`;
  }

  if (player.board.length === MAX_BOARD_SIZE - 1) {
    return `End the turn only if your remaining hand cannot safely finish the ninth slot. One more safe card would auto-win the set.`;
  }

  if (bestOption && difficulty === "easy") {
    return `End the turn. ${bestOption.option.displayLabel} is playable, but a safer line is to preserve your hand and revisit the board next turn.`;
  }

  if (bestOption && bestOption.category === "setup") {
    return `End the turn. ${bestOption.option.displayLabel} would improve your shape, but the advisor is holding it for a stronger timing window.`;
  }

  return `End the turn. ${player.total} is not strong enough to lock in yet, but there is no immediate side-card finish worth committing to.`;
};

const calculateBustProbability = (currentScore: number): number => {
  const safeValues = Math.max(0, WIN_SCORE - currentScore);
  return Math.max(0, (10 - safeValues) / 10);
};

const getAdvisorMatchContext = (
  player: SerializedPlayerState,
  opponent: SerializedPlayerState,
  setsToWin = SETS_TO_WIN,
): AdvisorMatchContext => ({
  playerOnMatchPoint: player.roundWins >= setsToWin - 1,
  opponentOnMatchPoint: opponent.roundWins >= setsToWin - 1,
  leadingMatch: player.roundWins > opponent.roundWins,
  trailingMatch: player.roundWins < opponent.roundWins,
});

const getAdvisorConfidence = (score: number): AdvisorConfidence => {
  if (score >= 700) {
    return "high";
  }

  if (score >= 250) {
    return "medium";
  }

  return "low";
};

export const WIN_SCORE = 20;
export const MAX_BOARD_SIZE = 9;
export const SETS_TO_WIN = 3;

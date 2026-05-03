import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  AdvisorAction,
  AdvisorAlternative,
  AdvisorCategory,
  AdvisorConfidence,
  AdvisorDifficulty,
  PazaakCardBackStyle,
  PazaakTableAmbience,
  PazaakTableTheme,
  SerializedMatch,
  SerializedPlayerState,
  SideCardOption,
} from "../types.ts";
import type { ChatMessage, MatchSocketConnectionState } from "../api.ts";
import { draw, stand, endTurn, playSideCard, forfeit, fetchMe } from "../api.ts";
import { getAdvisorSnapshot, getSideCardOptions, WIN_SCORE, SETS_TO_WIN } from "../game-utils.ts";
import { getCardReference, normalizeSideDeckToken } from "@openkotor/pazaak-engine";
import { QuickSideboardSwitcher } from "./QuickSideboardSwitcher.tsx";

const describeCardTooltip = (rawLabel: string): string => {
  const collapsed = rawLabel.trim().replace(/\s+/g, "");
  const token = normalizeSideDeckToken(collapsed) ?? normalizeSideDeckToken(rawLabel.trim());
  const ref = token ? getCardReference(token) : undefined;
  if (!ref) return rawLabel;
  const delta = ref.token.startsWith("+") || ref.token.startsWith("-") ? ` Applies ${ref.token}.` : "";
  return `${ref.displayLabel} — ${ref.mechanic}${delta} When to use: ${ref.whenToUse}`;
};

const CHAT_OPEN_STORAGE_KEY = "pazaak-world-chat-open-v1";

export type GameBoardVisualSettings = {
  tableTheme: PazaakTableTheme;
  cardBackStyle: PazaakCardBackStyle;
  tableAmbience: PazaakTableAmbience;
  /** When false, hide MMR / RD in the table header (matches Settings → Show ratings in game). */
  showRatingsInGame?: boolean;
};

interface GameBoardProps {
  match: SerializedMatch;
  userId: string;
  accessToken: string;
  socketState: MatchSocketConnectionState;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => void;
  onMatchUpdate: (match: SerializedMatch) => void;
  onOpenWorkshop: () => void;
  onReturnToLobby?: () => void;
  onSignIn?: () => void;
  onExit: () => void;
  /** Table / card-back / ambience from saved user settings (drives board styling). */
  visualSettings?: GameBoardVisualSettings;
}

export function GameBoard({
  match,
  userId,
  accessToken,
  socketState,
  chatMessages,
  onSendChat,
  onMatchUpdate,
  onOpenWorkshop,
  onReturnToLobby,
  onSignIn,
  onExit,
  visualSettings,
}: GameBoardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisorDifficulty, setAdvisorDifficulty] = useState<AdvisorDifficulty>("professional");
  const [roundSummary, setRoundSummary] = useState<{ title: string; body: string } | null>(null);
  const [actionLog, setActionLog] = useState<Array<{ id: string; text: string; at: number }>>([]);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatRegionId = "match-chat-panel";
  const [forfeitPending, setForfeitPending] = useState(false);
  const [preGameMmr, setPreGameMmr] = useState<number | null>(null);
  const [postGameMmr, setPostGameMmr] = useState<number | null>(null);
  const [preGameStreak, setPreGameStreak] = useState<number | null>(null);
  const [postGameStreak, setPostGameStreak] = useState<number | null>(null);
  const [animatedMmr, setAnimatedMmr] = useState<number | null>(null);
  const [mmrDeltaDisplay, setMmrDeltaDisplay] = useState<number | null>(null);
  const [walletRd, setWalletRd] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const previousSetRef = useRef(match.setNumber);
  const previousStatusLineRef = useRef(match.statusLine);
  const previousIsMyTurnRef = useRef<boolean | null>(null);
  const mmrAnimFrameRef = useRef<number | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const forfeitModalRef = useRef<HTMLDivElement | null>(null);
  const forfeitConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const roundSummaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const myPlayer = match.players.find((p) => p.userId === userId) ?? null;
  const opponents = match.players.filter((p) => p.userId !== userId);
  const isMyTurn = match.activePlayerIndex === match.players.findIndex((p) => p.userId === userId);

  const act = async (fn: () => Promise<SerializedMatch>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await fn();
      onMatchUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDraw = () => { if (soundEnabled) playUiTone("draw"); act(() => draw(match.id, accessToken)); };
  const handleStand = () => act(() => stand(match.id, accessToken));
  const handleEndTurn = () => act(() => endTurn(match.id, accessToken));
  const handlePlayCard = (option: SideCardOption) => { if (soundEnabled) playUiTone("card"); act(() => playSideCard(match.id, accessToken, option)); };
  const handleForfeit = () => setForfeitPending(true);
  const confirmForfeit = () => { setForfeitPending(false); act(() => forfeit(match.id, accessToken)); };
  const cancelForfeit = () => setForfeitPending(false);
  const dismissRoundSummary = () => setRoundSummary(null);

  const cardOptions = myPlayer && (match.phase === "after-draw") && isMyTurn
    ? getSideCardOptions(myPlayer)
    : [];
  const advisorEnabled = match.wager === 0;
  const advisorSnapshot = myPlayer && advisorEnabled ? getAdvisorSnapshot(match, userId, advisorDifficulty) : null;
  const advisor = advisorSnapshot?.recommendation ?? null;
  const disconnectedSince = match.disconnectedSince ?? {};
  const aiSeats = match.aiSeats ?? {};
  const targetSetsToWin = match.setsToWin ?? SETS_TO_WIN;
  const showRatingsInGame = visualSettings?.showRatingsInGame ?? true;

  const isCompleted = match.phase === "completed";
  const accountDisplayName = myPlayer?.displayName ?? "Spectator";
  const accountMmr = postGameMmr ?? preGameMmr;
  const displayedAccountMmr = animatedMmr ?? accountMmr;
  const mmrForProgress = displayedAccountMmr ?? 0;
  const currentTier = getMmrTier(mmrForProgress);
  const previousTier = preGameMmr !== null ? getMmrTier(preGameMmr) : null;
  const tierProgressPct = getTierProgressPercent(mmrForProgress, currentTier);
  const pointsToNextTier = currentTier.max === Number.POSITIVE_INFINITY
    ? 0
    : Math.max(0, currentTier.max + 1 - mmrForProgress);
  const didRankUp = Boolean(
    isCompleted
    && previousTier
    && postGameMmr !== null
    && getMmrTier(postGameMmr).index > previousTier.index,
  );
  const streakRibbon = getStreakRibbon(preGameStreak, postGameStreak);
  const shouldReduceMotion = reducedMotionEnabled || prefersReducedMotion;

  useEffect(() => {
    if (match.statusLine !== previousStatusLineRef.current) {
      setActionLog((previous) => {
        const next = [{ id: `${match.updatedAt}`, text: match.statusLine, at: match.updatedAt }, ...previous];
        return next.slice(0, 14);
      });
      previousStatusLineRef.current = match.statusLine;
    }
  }, [match.statusLine, match.updatedAt]);

  useEffect(() => {
    if (match.setNumber > previousSetRef.current) {
      const left = match.players[0];
      const right = match.players[1];
      setRoundSummary({
        title: `Set ${match.setNumber - 1} Complete`,
        body: `${match.statusLine} Score now ${left.displayName} ${left.roundWins} - ${right.roundWins} ${right.displayName}.`,
      });
    }
    previousSetRef.current = match.setNumber;
  }, [match.players, match.setNumber, match.statusLine]);

  useEffect(() => {
    if (!match.turnDeadlineAt || isCompleted) {
      setTimerSecondsLeft(null);
      return;
    }
    const update = () => {
      const secondsLeft = Math.max(0, Math.floor((match.turnDeadlineAt! - Date.now()) / 1000));
      setTimerSecondsLeft(secondsLeft);
    };
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [match.turnDeadlineAt, isCompleted]);

  useEffect(() => {
    fetchMe(accessToken).then((me) => {
      setPreGameMmr(me.wallet.mmr);
      setPreGameStreak(me.wallet.streak);
      setWalletRd(typeof me.wallet.mmrRd === "number" ? me.wallet.mmrRd : null);
      setSoundEnabled(me.wallet.userSettings.soundEnabled);
      setReducedMotionEnabled(me.wallet.userSettings.reducedMotionEnabled);
    }).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableTheme = visualSettings?.tableTheme ?? "ebon-hawk";
  const cardBackStyle = visualSettings?.cardBackStyle ?? "classic";
  const tableAmbience = visualSettings?.tableAmbience ?? "cantina";

  useEffect(() => {
    if (!isCompleted) return;
    fetchMe(accessToken).then((me) => {
      setPostGameMmr(me.wallet.mmr);
      setPostGameStreak(me.wallet.streak);
      setWalletRd(typeof me.wallet.mmrRd === "number" ? me.wallet.mmrRd : null);
      setReducedMotionEnabled(me.wallet.userSettings.reducedMotionEnabled);
    }).catch(() => { });
  }, [isCompleted, accessToken]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) {
      return;
    }

    const apply = () => setPrefersReducedMotion(media.matches);
    apply();

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (mmrAnimFrameRef.current !== null) {
      window.cancelAnimationFrame(mmrAnimFrameRef.current);
      mmrAnimFrameRef.current = null;
    }

    if (!showRatingsInGame) {
      setMmrDeltaDisplay(null);
      setAnimatedMmr(accountMmr);
      return;
    }

    if (!isCompleted || preGameMmr === null || postGameMmr === null) {
      setMmrDeltaDisplay(null);
      setAnimatedMmr(accountMmr);
      return;
    }

    const delta = postGameMmr - preGameMmr;
    setMmrDeltaDisplay(delta);
    if (shouldReduceMotion) {
      setAnimatedMmr(postGameMmr);
      return;
    }
    if (delta === 0) {
      setAnimatedMmr(postGameMmr);
      return;
    }

    const start = performance.now();
    const durationMs = 1400;
    const easeOutCubic = (t: number) => 1 - ((1 - t) ** 3);

    const tick = (nowTs: number) => {
      const t = Math.min(1, (nowTs - start) / durationMs);
      const eased = easeOutCubic(t);
      const value = Math.round(preGameMmr + (postGameMmr - preGameMmr) * eased);
      setAnimatedMmr(value);

      if (t < 1) {
        mmrAnimFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        mmrAnimFrameRef.current = null;
      }
    };

    mmrAnimFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (mmrAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(mmrAnimFrameRef.current);
        mmrAnimFrameRef.current = null;
      }
    };
  }, [accountMmr, isCompleted, postGameMmr, preGameMmr, shouldReduceMotion, showRatingsInGame]);

  useEffect(() => {
    const previousIsMyTurn = previousIsMyTurnRef.current;
    if (soundEnabled && previousIsMyTurn === false && isMyTurn && !isCompleted) {
      playUiTone("turn");
    }
    previousIsMyTurnRef.current = isMyTurn;
  }, [isCompleted, isMyTurn, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) {
      return;
    }

    if (isCompleted) {
      playUiTone("result");
    }
  }, [isCompleted, soundEnabled]);

  const isDialogOpen = forfeitPending || roundSummary !== null;

  useEffect(() => {
    if (isDialogOpen) {
      previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

      if (forfeitPending) {
        forfeitConfirmButtonRef.current?.focus();
      } else {
        roundSummaryButtonRef.current?.focus();
      }
      return;
    }

    previousFocusedElementRef.current?.focus();
  }, [forfeitPending, isDialogOpen, roundSummary]);

  const trapModalFocus = (event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) => {
    if (event.key !== "Tab" || !container) {
      return;
    }

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );

    if (focusables.length === 0) {
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleRoundSummaryKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissRoundSummary();
      return;
    }

    trapModalFocus(event, event.currentTarget);
  };

  const handleForfeitModalKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelForfeit();
      return;
    }

    trapModalFocus(event, forfeitModalRef.current);
  };

  // Tick "now" every second for disconnect countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-scroll chat to bottom on new messages.
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatOpen]);

  // Increment unread count when chat is closed and new messages arrive.
  const prevChatLengthRef = useRef(chatMessages.length);
  useEffect(() => {
    if (!chatOpen && chatMessages.length > prevChatLengthRef.current) {
      setChatUnread((n) => n + (chatMessages.length - prevChatLengthRef.current));
    }
    prevChatLengthRef.current = chatMessages.length;
  }, [chatMessages.length, chatOpen]);

  const handleChatToggle = () => {
    setChatOpen((open) => !open);
    setChatUnread(0);
  };

  const handleChatSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    onSendChat(text);
    setChatInput("");
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHAT_OPEN_STORAGE_KEY);
      if (stored === "1") {
        setChatOpen(true);
      }
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_OPEN_STORAGE_KEY, chatOpen ? "1" : "0");
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) {
      return;
    }

    chatInputRef.current?.focus();
  }, [chatOpen]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (forfeitPending || roundSummary) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTextInput = target !== null
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "/" && !isTextInput) {
        event.preventDefault();
        if (!chatOpen) {
          setChatOpen(true);
        }
        setChatUnread(0);
        window.setTimeout(() => chatInputRef.current?.focus(), 0);
        return;
      }

      if ((event.key === "c" || event.key === "C") && !isTextInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setChatOpen((open) => !open);
        setChatUnread(0);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [chatOpen, forfeitPending, roundSummary]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timeoutId = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDialogOpen]);


  return (
    <div
      className="game-board"
      data-table-theme={tableTheme}
      data-card-back={cardBackStyle}
      data-table-ambience={tableAmbience}
    >
      {/* Header */}
      <header className="game-header">
        <div className="game-header__title-group">
          <span className="game-header__title">Pazaak Table</span>
          <span className="game-header__set">Set {match.setNumber}</span>
          <span className="game-header__wager">⚙ {match.wager} credits</span>
        </div>
        {timerSecondsLeft !== null && (
          <span className={`game-header__timer ${timerSecondsLeft <= 10 ? "game-header__timer--urgent" : ""}`}>
            {`${String(Math.floor(timerSecondsLeft / 60)).padStart(2, "0")}:${String(timerSecondsLeft % 60).padStart(2, "0")}`}
          </span>
        )}
        {myPlayer ? (
          <span className={`game-header__connection ${disconnectedSince[myPlayer.userId] ? "game-header__connection--bad" : "game-header__connection--ok"}`}>
            {disconnectedSince[myPlayer.userId]
              ? `Connection: unstable (${Math.max(1, Math.floor((Date.now() - disconnectedSince[myPlayer.userId]!) / 1000))}s)`
              : "Connection: healthy"}
          </span>
        ) : null}
        <span className={`game-header__sync game-header__sync--${socketState}`}>
          {socketState === "connected"
            ? "Live Sync"
            : socketState === "reconnecting"
              ? "Reconnecting"
              : socketState === "connecting"
                ? "Connecting"
                : "Offline"}
        </span>
        <div className="game-header__account" aria-label="Current pilot account">
          <span className="game-header__account-icon" aria-hidden="true">◌</span>
          <span className="game-header__account-copy">
            <strong>{accountDisplayName}</strong>
            {showRatingsInGame ? (
              <small className={`game-header__mmr${isCompleted && mmrDeltaDisplay !== null ? ` game-header__mmr--${mmrDeltaDisplay >= 0 ? "gain" : "loss"}` : ""}`}>
                {`MMR: ${displayedAccountMmr ?? "--"}`}
                {walletRd !== null ? ` · RD ${Math.round(walletRd)}` : ""}
              </small>
            ) : (
              <small className="game-header__mmr">Ratings hidden</small>
            )}
          </span>
        </div>
        <div className="game-header__actions">
          {onReturnToLobby && (
            <button className="btn btn--ghost btn--sm" onClick={onReturnToLobby}>
              Lobby
            </button>
          )}
          {myPlayer && (
            <button className="btn btn--secondary btn--sm" onClick={onOpenWorkshop}>
              Sideboard Workshop
            </button>
          )}
          <button
            className={`btn btn--ghost btn--sm game-header__chat-toggle${chatUnread > 0 ? " game-header__chat-toggle--unread" : ""}`}
            onClick={handleChatToggle}
            title="Toggle chat"
            aria-pressed={chatOpen}
            aria-controls={chatRegionId}
            aria-label={chatOpen ? "Hide match chat" : "Show match chat"}
          >
            Chat{chatUnread > 0 ? ` (${chatUnread})` : ""}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setSoundEnabled((s) => !s)}
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? "Mute sounds" : "Enable sounds"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <button className="btn btn--ghost game-header__exit" onClick={onExit} title="Exit activity" aria-label="Exit activity">
            ✕
          </button>
        </div>
      </header>

      {/* Disconnect warnings for opponents */}
      {opponents.map((opp) => {
        const since = disconnectedSince[opp.userId];
        if (!since) return null;
        const elapsedMs = now - since;
        const FORFEIT_MS = 30_000;
        const remainingSec = Math.max(0, Math.ceil((FORFEIT_MS - elapsedMs) / 1000));
        return (
          <div key={opp.userId} className="disconnect-banner" role="alert">
            ⚠ <strong>{opp.displayName}</strong> has disconnected
            {remainingSec > 0 ? ` — auto-forfeit in ${remainingSec}s` : " — forfeiting…"}
          </div>
        );
      })}

      {/* Status */}
      <div className={`status-bar ${isCompleted ? "status-bar--complete" : isMyTurn ? "status-bar--my-turn" : "status-bar--waiting"}`}>
        {match.statusLine}
      </div>

      {roundSummary ? (
        <div className="round-summary-modal" role="dialog" aria-modal="true" aria-label="Set summary" onKeyDown={handleRoundSummaryKeyDown}>
          <div className="round-summary-modal__card" role="document">
            <h3>{roundSummary.title}</h3>
            <p>{roundSummary.body}</p>
            <button ref={roundSummaryButtonRef} className="btn btn--primary" onClick={dismissRoundSummary}>Continue</button>
          </div>
        </div>
      ) : null}

      {/* Error */}
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button className="error-toast__close" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {myPlayer && !isCompleted && (
        <QuickSideboardSwitcher accessToken={accessToken} variant="game" onOpenWorkshop={onOpenWorkshop} />
      )}

      {advisor && advisorSnapshot && !isCompleted && (
        <div className="game-advisor" role="status" aria-live="polite">
          <div className="game-advisor__header">
            <span className="game-advisor__eyebrow">PazaakWorld Advisor</span>
            <div className="game-advisor__difficulty-row">
              {(["easy", "hard", "professional"] as const).map((difficulty) => (
                <button
                  key={difficulty}
                  className={`btn btn--sm ${advisorDifficulty === difficulty ? "btn--primary" : "btn--ghost"}`}
                  onClick={() => setAdvisorDifficulty(difficulty)}
                  type="button"
                >
                  {formatAdvisorDifficultyLabel(difficulty)}
                </button>
              ))}
            </div>
          </div>
          <strong className="game-advisor__action">{describeAdvisorAction(advisor)}</strong>
          <span className="game-advisor__rationale">{advisor.rationale}</span>
          <div className="game-advisor__meta">
            <span className={`game-advisor__pill game-advisor__pill--${advisorSnapshot.confidence}`}>{formatAdvisorConfidenceLabel(advisorSnapshot.confidence)} confidence</span>
            <span className="game-advisor__pill">{formatAdvisorCategoryLabel(advisorSnapshot.category)}</span>
            <span className="game-advisor__pill">Next-draw bust risk {Math.round(advisorSnapshot.bustProbability * 100)}%</span>
          </div>
          {advisorSnapshot.alternatives.length > 1 && (
            <div className="game-advisor__alternatives">
              <span className="game-advisor__alternatives-label">Fallbacks</span>
              <div className="game-advisor__alternatives-list">
                {advisorSnapshot.alternatives.slice(1).map((alternative) => (
                  <span key={`${alternative.displayLabel}-${alternative.score}`} className="game-advisor__alternative">
                    {formatAdvisorAlternative(alternative)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Players */}
      <div className="players">
        {opponents.map((opp) => (
          <PlayerPanel
            key={opp.userId}
            player={opp}
            isActive={!isMyTurn && !isCompleted && match.players[match.activePlayerIndex]?.userId === opp.userId}
            label={opponents.length > 1 ? opp.displayName : "Opponent"}
            connectionState={disconnectedSince[opp.userId] ? "disconnected" : aiSeats[opp.userId] ? "ai_takeover" : "connected"}
          />
        ))}
        {myPlayer ? (
          <PlayerPanel
            player={myPlayer}
            isActive={isMyTurn && !isCompleted}
            label="You"
            isMe
            connectionState={disconnectedSince[myPlayer.userId] ? "disconnected" : aiSeats[myPlayer.userId] ? "ai_takeover" : "connected"}
          />
        ) : (
          <SpectatorPanel isGuest={accessToken.startsWith("local-guest-token:")} onSignIn={onSignIn} />
        )}
      </div>

      {/* Main Deck widget */}
      {!isCompleted && (
        <div className="main-deck-widget" aria-label="Main deck">
          <div className="main-deck-widget__card-back" />
          <span className="main-deck-widget__label">Main Deck</span>
          <span className="main-deck-widget__count">{match.mainDeck.length} cards</span>
        </div>
      )}

      <section className="game-log">
        <header className="game-log__header">
          <span>Game Log</span>
          <span>{actionLog.length} entries</span>
        </header>
        {actionLog.length === 0 ? (
          <p className="game-log__empty">Actions will appear here as the set progresses.</p>
        ) : (
          <ul className="game-log__list">
            {actionLog.map((entry) => (
              <li key={entry.id}>
                <span>{new Date(entry.at).toLocaleTimeString()}</span>
                <strong>{entry.text}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Chat panel */}
      {chatOpen && (
        <section className="chat-panel" id={chatRegionId} aria-label="Match chat">
          <header className="chat-panel__header">
            <span>Chat</span>
            <button className="btn btn--ghost btn--sm" onClick={() => setChatOpen(false)} aria-label="Close chat panel">✕</button>
          </header>
          <div className="chat-panel__messages">
            {chatMessages.length === 0 ? (
              <p className="chat-panel__empty">No messages yet. Say something!</p>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-panel__msg${msg.userId === userId ? " chat-panel__msg--mine" : ""}`}>
                  <span className="chat-panel__msg-author">{msg.userId === userId ? "You" : msg.displayName}</span>
                  <span className="chat-panel__msg-text">{msg.text}</span>
                  <span className="chat-panel__msg-time">{new Date(msg.at).toLocaleTimeString()}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <form
            className="chat-panel__form"
            onSubmit={(e) => { e.preventDefault(); handleChatSend(); }}
          >
            <input
              ref={chatInputRef}
              className="chat-panel__input"
              type="text"
              placeholder="Type a message…"
              maxLength={300}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setChatOpen(false);
                }
              }}
            />
            <button className="btn btn--primary btn--sm" type="submit" disabled={!chatInput.trim()}>
              Send
            </button>
          </form>
        </section>
      )}

      {/* Controls */}
      {!isCompleted && myPlayer && (
        <div className="game-controls" role="toolbar" aria-label="Turn actions">
          {isMyTurn && match.phase === "turn" && !myPlayer.stood && (
            <button data-testid="draw-btn" className="btn btn--primary" onClick={handleDraw} disabled={busy}>
              Draw
            </button>
          )}

          {isMyTurn && (match.phase === "after-draw" || match.phase === "after-card") && (
            <>
              <button className="btn btn--secondary" onClick={handleEndTurn} disabled={busy}>
                End Turn
              </button>
              <button data-testid="stand-btn" className="btn btn--secondary" onClick={handleStand} disabled={busy}>
                Stand on {myPlayer.total}
              </button>
            </>
          )}

          {isMyTurn && cardOptions.length > 0 && (
            <div className="side-cards" role="group" aria-label="Play a side card">
              <span className="side-cards__label">Play a side card:</span>
              <div className="side-cards__grid">
                {cardOptions.map((opt, i) => {
                  const tipBase = describeCardTooltip(opt.displayLabel);
                  const tip = `${tipBase} This play applies ${opt.appliedValue >= 0 ? "+" : ""}${opt.appliedValue}.`;
                  const tipId = `side-card-tip-${opt.cardId}-${i}`;
                  return (
                    <button
                      key={`${opt.cardId}-${opt.appliedValue}-${i}`}
                      className="btn btn--card"
                      onClick={() => handlePlayCard(opt)}
                      disabled={busy}
                      title={tip}
                      aria-describedby={tipId}
                    >
                      {opt.displayLabel}
                      <span id={tipId} className="sr-only">{tip}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isMyTurn && (
            <p className="waiting-label">Waiting for opponent…</p>
          )}

          <button data-testid="forfeit-btn" className="btn btn--danger btn--sm" onClick={handleForfeit} disabled={busy}>
            Forfeit
          </button>
        </div>
      )}

      {/* Forfeit confirmation overlay */}
      {forfeitPending && (
        <div
          className="game-board__overlay"
          onKeyDown={handleForfeitModalKeyDown}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancelForfeit();
            }
          }}
        >
          <div ref={forfeitModalRef} className="game-board__confirm-modal" data-testid="forfeit-modal" role="dialog" aria-modal="true" aria-labelledby="forfeit-modal-title" aria-describedby="forfeit-modal-description">
            <p id="forfeit-modal-title">Forfeit this match?</p>
            <p id="forfeit-modal-description">You will immediately concede this match and receive a loss.</p>
            <div className="game-board__confirm-modal__actions">
              <button ref={forfeitConfirmButtonRef} className="btn btn--danger" onClick={confirmForfeit}>Forfeit</button>
              <button className="btn btn--ghost" onClick={cancelForfeit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Completed */}
      {isCompleted && (
        <div className="game-result">
          {!shouldReduceMotion && showRatingsInGame && mmrDeltaDisplay !== null && mmrDeltaDisplay !== 0 ? (
            <div className={`game-result__flare game-result__flare--${mmrDeltaDisplay > 0 ? "gain" : "loss"}`} aria-hidden="true">
              {Array.from({ length: 10 }).map((_, index) => <span key={`flare-${index}`} />)}
            </div>
          ) : null}
          {match.winnerId === userId ? (
            <p className="game-result__win">🏆 You won!</p>
          ) : match.loserId === userId ? (
            <p className="game-result__lose">💀 You lost.</p>
          ) : (
            <p className="game-result__draw">It's a draw.</p>
          )}
          <p className="game-result__status">{match.statusLine}</p>
          {showRatingsInGame && postGameMmr !== null && (() => {
            const delta = mmrDeltaDisplay;
            return (
              <>
                <p className="game-result__mmr">
                  MMR: {animatedMmr ?? postGameMmr}
                  {walletRd !== null ? ` · RD ${Math.round(walletRd)}` : ""}
                  {delta !== null && (
                    <span className={`game-result__mmr-delta ${delta >= 0 ? "game-result__mmr-delta--gain" : "game-result__mmr-delta--loss"}`}>
                      {delta >= 0 ? `+${delta}` : `${delta}`}
                    </span>
                  )}
                </p>
                <div className="game-result__rank-wrap">
                  <div className={`game-result__rank-badge${didRankUp ? " game-result__rank-badge--rankup" : ""}`}>
                    <span aria-hidden="true">{currentTier.icon}</span>
                    <strong>{currentTier.name}</strong>
                    {didRankUp ? <small>Rank Up!</small> : null}
                  </div>
                  {currentTier.max !== Number.POSITIVE_INFINITY ? (
                    <p className="game-result__next-goal">
                      {pointsToNextTier} MMR to {currentTier.nextName}
                    </p>
                  ) : (
                    <p className="game-result__next-goal">Top tier reached</p>
                  )}
                  <div className="game-result__tier-progress" role="progressbar" aria-label="Rank progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tierProgressPct)}>
                    <span style={{ width: `${tierProgressPct}%` }} />
                  </div>
                </div>
                {streakRibbon ? (
                  <p className={`game-result__streak-ribbon game-result__streak-ribbon--${streakRibbon.tone}`}>
                    {streakRibbon.text}
                  </p>
                ) : null}
              </>
            );
          })()}
          <div className="game-result__actions">
            {onReturnToLobby && (
              <button className="btn btn--secondary" onClick={onReturnToLobby}>Return to Lobby</button>
            )}
            <button className="btn btn--ghost" onClick={onExit}>Close Activity</button>
          </div>
        </div>
      )}

      {/* Score legend */}
      <footer className="game-footer">
        First to {targetSetsToWin} set wins · Target: {WIN_SCORE}
      </footer>
    </div>
  );
}

function playUiTone(type: "turn" | "result" | "draw" | "card") {
  const AudioContextCtor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  try {
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const steps = type === "turn"
      ? [392, 523.25]
      : [392, 523.25, 659.25];

    if (type === "draw") {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + 0.1);
      window.setTimeout(() => { void context.close().catch(() => { }); }, 200);
      return;
    }

    if (type === "card") {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      window.setTimeout(() => { void context.close().catch(() => { }); }, 250);
      return;
    }


    steps.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + index * 0.09;
      const stopAt = startAt + 0.08;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(stopAt);
    });

    window.setTimeout(() => {
      void context.close().catch(() => { });
    }, 450);
  } catch {
    // Ignore audio failures; the UI should remain fully usable without sound.
  }
}

function describeAdvisorAction(advisor: AdvisorAction): string {
  switch (advisor.action) {
    case "draw":
      return "Draw main deck";
    case "stand":
      return "Stand";
    case "end_turn":
      return "End turn";
    case "play_side":
      return `Play ${advisor.displayLabel}`;
  }
}

function formatAdvisorDifficultyLabel(difficulty: AdvisorDifficulty): string {
  switch (difficulty) {
    case "easy":
      return "Easy";
    case "hard":
      return "Hard";
    case "professional":
      return "Professional";
  }
}

function formatAdvisorConfidenceLabel(confidence: AdvisorConfidence): string {
  switch (confidence) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
  }
}

function formatAdvisorCategoryLabel(category: AdvisorCategory): string {
  switch (category) {
    case "exact":
      return "Exact Finish";
    case "recovery":
      return "Recovery";
    case "pressure":
      return "Pressure";
    case "setup":
      return "Setup";
    case "neutral":
      return "Neutral";
  }
}

function formatAdvisorAlternative(alternative: AdvisorAlternative): string {
  return `${alternative.displayLabel} · ${formatAdvisorCategoryLabel(alternative.category)}`;
}

type MmrTier = {
  index: number;
  name: string;
  icon: string;
  min: number;
  max: number;
  nextName: string;
};

const MMR_TIERS: readonly MmrTier[] = [
  { index: 0, name: "Bronze", icon: "🥉", min: 0, max: 999, nextName: "Silver" },
  { index: 1, name: "Silver", icon: "🥈", min: 1000, max: 1199, nextName: "Gold" },
  { index: 2, name: "Gold", icon: "🥇", min: 1200, max: 1399, nextName: "Platinum" },
  { index: 3, name: "Platinum", icon: "💎", min: 1400, max: 1599, nextName: "Kyber" },
  { index: 4, name: "Kyber", icon: "🌌", min: 1600, max: Number.POSITIVE_INFINITY, nextName: "Kyber" },
];

function getMmrTier(mmr: number): MmrTier {
  const normalized = Math.max(0, Math.floor(mmr));
  return MMR_TIERS.find((tier) => normalized >= tier.min && normalized <= tier.max) ?? MMR_TIERS[MMR_TIERS.length - 1]!;
}

function getTierProgressPercent(mmr: number, tier: MmrTier): number {
  if (tier.max === Number.POSITIVE_INFINITY) {
    return 100;
  }

  const span = tier.max - tier.min + 1;
  const inTier = Math.max(0, Math.min(span, Math.floor(mmr) - tier.min + 1));
  return (inTier / span) * 100;
}

function getStreakRibbon(preGameStreak: number | null, postGameStreak: number | null): { tone: "gain" | "loss" | "neutral"; text: string } | null {
  if (preGameStreak === null || postGameStreak === null) {
    return null;
  }

  if (postGameStreak >= 5) {
    return { tone: "gain", text: `Hot Streak x${postGameStreak}` };
  }

  if (postGameStreak >= 2) {
    return { tone: "neutral", text: `Streak x${postGameStreak}` };
  }

  if (preGameStreak >= 2 && postGameStreak === 0) {
    return { tone: "loss", text: `Streak Broken (${preGameStreak})` };
  }

  if (preGameStreak === 0 && postGameStreak === 1) {
    return { tone: "neutral", text: "New Streak Started" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// PlayerPanel
// ---------------------------------------------------------------------------

interface PlayerPanelProps {
  player: SerializedPlayerState;
  isActive: boolean;
  label: string;
  isMe?: boolean;
  connectionState?: "connected" | "disconnected" | "ai_takeover";
}

function PlayerPanel({ player, isActive, label, isMe = false, connectionState = "connected" }: PlayerPanelProps) {
  const deckSummary = player.sideDeckLabel
    ? `Deck ${player.sideDeckLabel}${player.sideDeckId !== null ? ` (#${player.sideDeckId})` : ""}`
    : "Deck data unavailable";

  const connectionLabel = connectionState === "connected"
    ? "Connected"
    : connectionState === "ai_takeover"
      ? "Disconnected · AI takeover"
      : "Disconnected";

  return (
    <div className={`player-panel ${isActive ? "player-panel--active" : ""} ${isMe ? "player-panel--me" : ""}`}>
      <div className="player-panel__header">
        <span className="player-panel__name">{player.displayName}</span>
        <span className="player-panel__badge">{label}</span>
        <span className="player-panel__sets">{player.roundWins} sets</span>
        {player.stood && <span className="player-panel__stood">Standing</span>}
        {isActive && <span className="player-panel__turn-dot" aria-label="Active player" />}
      </div>
      <div className="player-panel__meta">{deckSummary}</div>
      <div className={`player-panel__connection player-panel__connection--${connectionState}`}>{connectionLabel}</div>

      {/* Board */}
      <div className="board">
        {player.board.length === 0 ? (
          <span className="board__empty">No cards yet</span>
        ) : (
          player.board.map((card, i) => (
            <div
              key={`${card.source || 'deck'}-${card.value}-${card.frozen}-${i}`}
              className={`board-card ${card.value < 0 ? "board-card--neg" : ""} ${card.frozen ? "board-card--frozen" : ""}`}
            >
              {card.value > 0 && i > 0 ? `+${card.value}` : card.value}
            </div>
          ))
        )}
        <div data-testid="score-display" className="board__total">{player.total}</div>
      </div>

      {/* Hand (only for current player — shows labels, masks for opponent) */}
      {isMe && player.hand.length > 0 && (
        <div className="player-hand">
          {player.hand.map((card) => {
            const used = player.usedCardIds.includes(card.id);
            const tip = describeCardTooltip(card.label);
            const tipId = `hand-card-tip-${card.id}`;
            return (
              <span
                key={card.id}
                className={`hand-card ${used ? "hand-card--used" : ""}`}
                title={tip}
                aria-describedby={tipId}
              >
                {card.label}
                <span id={tipId} className="sr-only">{tip}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SpectatorPanel({ isGuest, onSignIn }: { isGuest?: boolean; onSignIn?: () => void }) {
  return (
    <div className="player-panel player-panel--spectator">
      <p className="spectator-label">You are spectating this match.</p>
      {isGuest && onSignIn && (
        <button className="pazaak-btn pazaak-btn--secondary spectator-signin-btn" onClick={onSignIn}>
          Sign in to play
        </button>
      )}
    </div>
  );
}

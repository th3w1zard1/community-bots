import { useState, useEffect, useCallback } from "react";
import type { AdvisorDifficulty, LeaderboardEntry, MatchmakingQueueRecord, PazaakLobbyRecord, PazaakMatchHistoryRecord, PazaakTableVariant, SerializedMatch, WalletRecord } from "./types.ts";
import { initDiscordAuth, closeActivity, isDiscordActivity } from "./discord.ts";
import {
  addLobbyAi,
  createLobby,
  enqueueMatchmaking,
  fetchMatchmakingStats,
  fetchMatchmakingStatus,
  fetchHistory,
  fetchLeaderboard,
  fetchLobbies,
  fetchMe,
  fetchMyMatch,
  joinLobby,
  joinLobbyByCode,
  leaveLobby,
  leaveMatchmaking,
  loginAccount,
  registerAccount,
  updateLobbyAiDifficulty,
  type MatchSocketConnectionState,
  setLobbyReady,
  setLobbyStatus,
  startLobby,
  subscribeToMatch,
} from "./api.ts";
import { GameBoard } from "./components/GameBoard.tsx";
import { LocalPracticeGame } from "./components/LocalPracticeGame.tsx";
import { QuickSideboardSwitcher } from "./components/QuickSideboardSwitcher.tsx";
import { SideboardWorkshop } from "./components/SideboardWorkshop.tsx";

type ActivitySession = {
  userId: string;
  username: string;
  accessToken: string;
};

// ---------------------------------------------------------------------------
// App states
// ---------------------------------------------------------------------------

type AppState =
  | { stage: "loading" }
  | { stage: "standalone_auth"; message?: string }
  | { stage: "auth_error"; message: string }
  | { stage: "mode_selection"; auth: ActivitySession }
  | { stage: "matchmaking"; auth: ActivitySession; preferredMaxPlayers: number }
  | { stage: "lobby"; auth: ActivitySession }
  | { stage: "local_game"; auth: ActivitySession; difficulty: AdvisorDifficulty }
  | { stage: "workshop"; auth: ActivitySession; returnTo: "lobby" | "game"; match?: SerializedMatch }
  | { stage: "game"; auth: ActivitySession; match: SerializedMatch };

export default function App() {
  const [state, setState] = useState<AppState>({ stage: "loading" });
  const [matchSocketState, setMatchSocketState] = useState<MatchSocketConnectionState>("connecting");

  // On mount: run Discord SDK auth, then poll for an active match.
  useEffect(() => {
    (async () => {
      try {
        const auth = await initDiscordAuth();
        const match = await fetchMyMatch(auth.accessToken);

        const session: ActivitySession = {
          userId: auth.userId,
          username: auth.username,
          accessToken: auth.accessToken,
        };

        if (match) {
          setState({ stage: "game", auth: session, match });
        } else {
          setState({ stage: "mode_selection", auth: session });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isDiscordActivity() && message.includes("not running inside Discord Activity")) {
          setState({ stage: "standalone_auth" });
          return;
        }

        setState({
          stage: "auth_error",
          message,
        });
      }
    })();
  }, []);

  // Subscribe to live WS updates when in game.
  const handleMatchUpdate = useCallback((updated: SerializedMatch) => {
    setState((prev) => {
      if (prev.stage !== "game") return prev;
      return { ...prev, match: updated };
    });
  }, []);

  useEffect(() => {
    if (state.stage !== "game") return;
    const unsubscribe = subscribeToMatch(state.match.id, handleMatchUpdate, {
      reconnect: true,
      onConnectionChange: setMatchSocketState,
    });
    return unsubscribe;
    // Re-subscribe only when the match ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage === "game" ? state.match.id : null]);

  const restoreFromWorkshop = useCallback(async (auth: ActivitySession, returnTo: "lobby" | "game") => {
    try {
      if (returnTo === "game") {
        const latestMatch = await fetchMyMatch(auth.accessToken);

        if (latestMatch) {
          setState({ stage: "game", auth, match: latestMatch });
          return;
        }
      }
    } catch {
      // Fall through to the lobby if the match refresh fails.
    }

    setState({ stage: "lobby", auth });
  }, []);

  if (state.stage === "loading") {
    return <LoadingScreen />;
  }

  if (state.stage === "auth_error") {
    return <ErrorScreen message={state.message} />;
  }

  if (state.stage === "standalone_auth") {
    return (
      <StandaloneAuthScreen
        message={state.message}
        onAuthenticated={async (session) => {
          const match = await fetchMyMatch(session.accessToken);
          if (match) {
            setState({ stage: "game", auth: session, match });
            return;
          }
          setState({ stage: "mode_selection", auth: session });
        }}
        onStartGuestLocal={(difficulty) => {
          setState({
            stage: "local_game",
            auth: {
              userId: "guest-local",
              username: "Guest Pilot",
              accessToken: "",
            },
            difficulty,
          });
        }}
      />
    );
  }

  if (state.stage === "mode_selection") {
    return (
      <ModeSelectionScreen
        username={state.auth.username}
        onOpenLobbies={() => setState({ stage: "lobby", auth: state.auth })}
        onQuickMatch={(preferredMaxPlayers) => setState({ stage: "matchmaking", auth: state.auth, preferredMaxPlayers })}
        onStartLocalGame={(difficulty) => setState({ stage: "local_game", auth: state.auth, difficulty })}
      />
    );
  }

  if (state.stage === "matchmaking") {
    return (
      <MatchmakingScreen
        accessToken={state.auth.accessToken}
        preferredMaxPlayers={state.preferredMaxPlayers}
        onEnterMatch={(match) => setState({ stage: "game", auth: state.auth, match })}
        onBack={() => setState({ stage: "mode_selection", auth: state.auth })}
      />
    );
  }

  if (state.stage === "lobby") {
    return (
      <LobbyScreen
        accessToken={state.auth.accessToken}
        userId={state.auth.userId}
        username={state.auth.username}
        onOpenWorkshop={() => setState({ stage: "workshop", auth: state.auth, returnTo: "lobby" })}
        onEnterMatch={(match) => setState({ stage: "game", auth: state.auth, match })}
        onStartLocalGame={(difficulty) => setState({ stage: "local_game", auth: state.auth, difficulty })}
      />
    );
  }

  if (state.stage === "local_game") {
    return (
      <LocalPracticeGame
        username={state.auth.username}
        difficulty={state.difficulty}
        onExit={() => {
          if (state.auth.accessToken) {
            setState({ stage: "mode_selection", auth: state.auth });
            return;
          }

          setState({ stage: "standalone_auth" });
        }}
      />
    );
  }

  if (state.stage === "workshop") {
    return (
      <SideboardWorkshop
        accessToken={state.auth.accessToken}
        username={state.auth.username}
        onBack={() => restoreFromWorkshop(state.auth, state.returnTo)}
      />
    );
  }

  // stage === "game"
  return (
    <GameBoard
      match={state.match}
      userId={state.auth.userId}
      accessToken={state.auth.accessToken}
      socketState={matchSocketState}
      onMatchUpdate={(match) => setState({ stage: "game", auth: state.auth, match })}
      onOpenWorkshop={() => setState({ stage: "workshop", auth: state.auth, returnTo: "game", match: state.match })}
      onReturnToLobby={() => setState({ stage: "lobby", auth: state.auth })}
      onExit={() => closeActivity("Player exited game")}
    />
  );
}

function ModeSelectionScreen({
  username,
  onOpenLobbies,
  onQuickMatch,
  onStartLocalGame,
}: {
  username: string;
  onOpenLobbies: () => void;
  onQuickMatch: (preferredMaxPlayers: number) => void;
  onStartLocalGame: (difficulty: AdvisorDifficulty) => void;
}) {
  const [preferredQuickMatchPlayers, setPreferredQuickMatchPlayers] = useState(2);

  return (
    <div className="screen screen--lobby">
      <div className="mode-selection-shell">
        <section className="mode-selection-hero">
          <p className="lobby-kicker">Multi-Pazaak</p>
          <h1>Choose Your Mode</h1>
          <p>Welcome {username}. Play online, host private tables, or practice offline against AI.</p>
        </section>

        <section className="mode-selection-grid">
          <article className="mode-card">
            <h2>Quick Match</h2>
            <p>Join matchmaking and automatically find the next open opponent table.</p>
            <div className="mode-card__controls">
              <select value={String(preferredQuickMatchPlayers)} onChange={(event) => setPreferredQuickMatchPlayers(Number(event.target.value) || 2)} aria-label="Quick match max players">
                {[2, 3, 4, 5].map((value) => <option key={value} value={value}>Up to {value} players</option>)}
              </select>
              <button className="btn btn--primary" onClick={() => onQuickMatch(preferredQuickMatchPlayers)}>Find Match</button>
            </div>
          </article>

          <article className="mode-card">
            <h2>Private Lobby</h2>
            <p>Create or join custom tables with table variants, timer controls, and optional AI seats.</p>
            <div className="mode-card__controls">
              <button className="btn btn--secondary" onClick={onOpenLobbies}>Open Lobby Browser</button>
            </div>
          </article>

          <article className="mode-card">
            <h2>Local Practice</h2>
            <p>Play instantly offline against an AI opponent with no network dependency.</p>
            <div className="mode-card__controls mode-card__controls--stack">
              <button className="btn btn--secondary" onClick={() => onStartLocalGame("easy")}>Start Easy AI</button>
              <button className="btn btn--secondary" onClick={() => onStartLocalGame("hard")}>Start Hard AI</button>
              <button className="btn btn--secondary" onClick={() => onStartLocalGame("professional")}>Start Professional AI</button>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

function MatchmakingScreen({
  accessToken,
  preferredMaxPlayers,
  onEnterMatch,
  onBack,
}: {
  accessToken: string;
  preferredMaxPlayers: number;
  onEnterMatch: (match: SerializedMatch) => void;
  onBack: () => void;
}) {
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueLabel, setQueueLabel] = useState("Entering queue...");
  const [stats, setStats] = useState({
    playersInQueue: 0,
    openLobbies: 0,
    activeGames: 0,
    averageWaitSeconds: 0,
    averageWaitTime: "~0s",
    queueUpdatedAt: new Date(0).toISOString(),
  });

  useEffect(() => {
    let active = true;

    const boot = async () => {
      setBusy(true);
      setError(null);
      try {
        await enqueueMatchmaking(accessToken, preferredMaxPlayers);
        if (!active) return;
        setJoined(true);
        setQueueLabel(`Queued for up to ${preferredMaxPlayers} players`);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setBusy(false);
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, [accessToken, preferredMaxPlayers]);

  useEffect(() => {
    if (!joined) return;
    let active = true;

    const poll = async () => {
      try {
        const match = await fetchMyMatch(accessToken);
        if (!active) return;
        if (match) {
          onEnterMatch(match);
          return;
        }

        const queue = await fetchMatchmakingStatus(accessToken);
        const nextStats = await fetchMatchmakingStats(accessToken);
        if (!active) return;
        setStats(nextStats);
        if (queue) {
          setQueueLabel(`Queued at ${new Date(queue.enqueuedAt).toLocaleTimeString()} · up to ${queue.preferredMaxPlayers} players`);
        } else {
          setQueueLabel("Queue ended.");
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [accessToken, joined, onEnterMatch]);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await leaveMatchmaking(accessToken);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen screen--loading">
      <div className="matchmaking-card">
        <h2>Searching For A Match</h2>
        <p>{queueLabel}</p>
        <p>Queue updated {stats.queueUpdatedAt === new Date(0).toISOString() ? "just now" : new Date(stats.queueUpdatedAt).toLocaleTimeString()}</p>
        {error ? <div className="lobby-alert lobby-alert--error">{error}</div> : null}
        <div className="matchmaking-card__meter">
          <div className="matchmaking-card__meter-fill" />
        </div>
        <div className="matchmaking-card__stats">
          <div><span>Players in queue</span><strong>{stats.playersInQueue}</strong></div>
          <div><span>Open lobbies</span><strong>{stats.openLobbies}</strong></div>
          <div><span>Active games</span><strong>{stats.activeGames}</strong></div>
          <div><span>Avg wait</span><strong>{stats.averageWaitTime}</strong></div>
        </div>
        <div className="matchmaking-card__actions">
          <button className="btn btn--ghost" onClick={onBack} disabled={busy}>Back</button>
          <button className="btn btn--secondary" onClick={cancel} disabled={busy}>{busy ? "Working..." : "Cancel Search"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="screen screen--loading">
      <div className="loading-spinner" aria-label="Loading…">
        <div className="spinner-ring" />
      </div>
      <p className="loading-label">Connecting to the pazaak table…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="screen screen--error">
      <div className="error-card">
        <div className="error-icon" aria-hidden="true">⚠</div>
        <h2 className="error-title">Authentication Failed</h2>
        <p className="error-message">{message}</p>
        <button className="btn btn--primary" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    </div>
  );
}

function StandaloneAuthScreen({
  message,
  onAuthenticated,
  onStartGuestLocal,
}: {
  message?: string;
  onAuthenticated: (session: ActivitySession) => Promise<void>;
  onStartGuestLocal: (difficulty: AdvisorDifficulty) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(message ?? null);

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const auth = mode === "login"
        ? await loginAccount(identifier.trim(), password)
        : await registerAccount({
          username: username.trim(),
          displayName: displayName.trim() || undefined,
          email: email.trim() || undefined,
          password,
        });

      await onAuthenticated({
        userId: auth.account.legacyGameUserId ?? auth.account.accountId,
        username: auth.account.displayName,
        accessToken: auth.app_token,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen screen--error">
      <div className="error-card">
        <div className="error-icon" aria-hidden="true">♠</div>
        <h2 className="error-title">Pazaak Account</h2>
        <p className="error-message">Sign in with an app account to play outside Discord Activity mode.</p>
        <div className="auth-switch">
          <button className={`btn btn--sm ${mode === "login" ? "btn--primary" : "btn--ghost"}`} onClick={() => setMode("login")} disabled={busy}>Sign In</button>
          <button className={`btn btn--sm ${mode === "register" ? "btn--primary" : "btn--ghost"}`} onClick={() => setMode("register")} disabled={busy}>Create Account</button>
        </div>
        <div className="auth-form">
          {mode === "login" ? (
            <>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Username or Email"
                aria-label="Username or email"
                disabled={busy}
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Password"
                aria-label="Password"
                disabled={busy}
              />
            </>
          ) : (
            <>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                aria-label="Username"
                disabled={busy}
              />
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Display Name (optional)"
                aria-label="Display name"
                disabled={busy}
              />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email (optional)"
                aria-label="Email"
                disabled={busy}
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Password (10+ chars)"
                aria-label="Password"
                disabled={busy}
              />
            </>
          )}
        </div>
        {error ? <p className="error-message">{error}</p> : null}
        <button className="btn btn--primary" onClick={submit} disabled={busy}>
          {busy ? "Working..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>
        <button className="btn btn--secondary" onClick={() => onStartGuestLocal("professional")} disabled={busy}>
          Play Local Practice As Guest
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lobby (no active match)
// ---------------------------------------------------------------------------

function LobbyScreen({
  accessToken,
  userId,
  username,
  onEnterMatch,
  onStartLocalGame,
  onOpenWorkshop,
}: {
  accessToken: string;
  userId: string;
  username: string;
  onEnterMatch: (match: SerializedMatch) => void;
  onStartLocalGame: (difficulty: AdvisorDifficulty) => void;
  onOpenWorkshop: () => void;
}) {
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [queue, setQueue] = useState<MatchmakingQueueRecord | null>(null);
  const [lobbies, setLobbies] = useState<PazaakLobbyRecord[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<PazaakMatchHistoryRecord[]>([]);
  const [newLobbyName, setNewLobbyName] = useState(`${username}'s Table`);
  const [newLobbyPassword, setNewLobbyPassword] = useState("");
  const [newLobbyVariant, setNewLobbyVariant] = useState<PazaakTableVariant>("canonical");
  const [newLobbyMaxPlayers, setNewLobbyMaxPlayers] = useState(2);
  const [newLobbyMaxRounds, setNewLobbyMaxRounds] = useState(3);
  const [newLobbyTurnTimer, setNewLobbyTurnTimer] = useState(120);
  const [newLobbyRanked, setNewLobbyRanked] = useState(true);
  const [newLobbyAllowAiFill, setNewLobbyAllowAiFill] = useState(true);
  const [preferredQueuePlayers, setPreferredQueuePlayers] = useState(2);
  const [localAiDifficulty, setLocalAiDifficulty] = useState<AdvisorDifficulty>("professional");
  const [joinLobbyCodeValue, setJoinLobbyCodeValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshLobby = useCallback(async () => {
    const [me, openLobbies, leaderboard, recentHistory] = await Promise.all([
      fetchMe(accessToken),
      fetchLobbies(accessToken),
      fetchLeaderboard(accessToken),
      fetchHistory(accessToken, 5),
    ]);

    if (me.match) {
      onEnterMatch(me.match);
      return;
    }

    setWallet(me.wallet);
    setQueue(me.queue);
    setLobbies(openLobbies);
    setLeaders(leaderboard.slice(0, 5));
    setHistory(recentHistory);
  }, [accessToken, onEnterMatch]);

  useEffect(() => {
    refreshLobby().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [refreshLobby]);

  const runLobbyAction = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);

    try {
      await action();
      await refreshLobby();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = () => runLobbyAction("refresh", async () => {
    const match = await fetchMyMatch(accessToken);
    if (match) onEnterMatch(match);
  });

  const handleCreateLobby = () => runLobbyAction("create-lobby", async () => {
    const maxPlayers = newLobbyVariant === "canonical" ? 2 : newLobbyMaxPlayers;
    await createLobby(accessToken, {
      name: newLobbyName,
      maxPlayers,
      ...(newLobbyPassword ? { password: newLobbyPassword } : {}),
      variant: newLobbyVariant,
      maxRounds: newLobbyMaxRounds,
      turnTimerSeconds: newLobbyTurnTimer,
      ranked: newLobbyRanked,
      allowAiFill: newLobbyAllowAiFill,
      tableSettings: {
        variant: newLobbyVariant,
        maxPlayers,
        maxRounds: newLobbyMaxRounds,
        turnTimerSeconds: newLobbyTurnTimer,
        ranked: newLobbyRanked,
        allowAiFill: newLobbyAllowAiFill,
      },
    });
  });

  const handleStartSolo = () => runLobbyAction("solo", async () => {
    const lobby = await createLobby(accessToken, { name: `${username} vs AI`, maxPlayers: 2 });
    await addLobbyAi(accessToken, lobby.id, wallet?.userSettings.preferredAiDifficulty ?? "professional");
    const started = await startLobby(accessToken, lobby.id);
    onEnterMatch(started.match);
  });

  const ownLobby = lobbies.find((lobby) => lobby.players.some((player) => player.userId === userId));
  const canUseLobbyControls = busy === null;

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Never";

  return (
    <div className="screen screen--lobby">
      <div className="lobby-shell">
        <section className="lobby-panel lobby-panel--profile">
          <div>
            <p className="lobby-kicker">Pazaak Table</p>
            <h1 className="lobby-title">{username}</h1>
            <p className="lobby-sub">{wallet ? `${wallet.balance} credits · ${wallet.mmr} MMR · ${wallet.gamesWon}/${wallet.gamesPlayed} games` : "Loading account"}</p>
          </div>
          {error ? <div className="lobby-alert lobby-alert--error">{error}</div> : null}
          <div className="lobby-stat-grid">
            <div><span>Streak</span><strong>{wallet?.streak ?? 0}</strong></div>
            <div><span>Best</span><strong>{wallet?.bestStreak ?? 0}</strong></div>
            <div><span>Last Match</span><strong>{formatDate(wallet?.lastMatchAt ?? null)}</strong></div>
          </div>
          <div className="lobby-actions">
            <button className="btn btn--primary" onClick={handleStartSolo} disabled={!canUseLobbyControls}>
              Start AI Table
            </button>
            <div className="lobby-local-practice">
              <select value={localAiDifficulty} onChange={(event) => setLocalAiDifficulty(event.target.value as AdvisorDifficulty)} aria-label="Local AI difficulty">
                <option value="easy">Local AI Easy</option>
                <option value="hard">Local AI Hard</option>
                <option value="professional">Local AI Professional</option>
              </select>
              <button className="btn btn--secondary" onClick={() => onStartLocalGame(localAiDifficulty)}>
                Start Local Practice
              </button>
            </div>
            {queue ? (
              <button className="btn btn--secondary" onClick={() => runLobbyAction("leave-queue", async () => { await leaveMatchmaking(accessToken); })} disabled={!canUseLobbyControls}>
                Leave Queue
              </button>
            ) : (
              <button className="btn btn--secondary" onClick={() => runLobbyAction("queue", async () => { await enqueueMatchmaking(accessToken, preferredQueuePlayers); })} disabled={!canUseLobbyControls}>
                Join Queue
              </button>
            )}
            <button className="btn btn--secondary" onClick={onOpenWorkshop}>
              Sideboards
            </button>
            <button className="btn btn--ghost" onClick={handleRefresh} disabled={!canUseLobbyControls}>
              {busy === "refresh" ? "Checking" : "Refresh"}
            </button>
          </div>
          {ownLobby ? (
            <div className="lobby-code-row">
              <span>Lobby Code</span>
              <strong>{ownLobby.lobbyCode}</strong>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  void navigator.clipboard.writeText(ownLobby.lobbyCode);
                }}
                disabled={!canUseLobbyControls}
              >
                Copy
              </button>
            </div>
          ) : null}
        </section>

        <section className="lobby-panel lobby-panel--tables">
          <div className="lobby-section-header">
            <div>
              <p className="lobby-kicker">Open Tables</p>
              <h2>Lobby Browser</h2>
            </div>
            <div className="lobby-create">
              <input value={newLobbyName} onChange={(event) => setNewLobbyName(event.target.value)} aria-label="Lobby name" />
              <input
                type="password"
                value={newLobbyPassword}
                onChange={(event) => setNewLobbyPassword(event.target.value)}
                placeholder="Password (optional)"
                aria-label="Lobby password"
                autoComplete="new-password"
              />
              <select
                value={newLobbyVariant}
                onChange={(event) => {
                  const nextVariant = event.target.value === "multi_seat" ? "multi_seat" : "canonical";
                  setNewLobbyVariant(nextVariant);
                  if (nextVariant === "canonical") {
                    setNewLobbyMaxPlayers(2);
                    setNewLobbyRanked(true);
                  }
                }}
                aria-label="Table variant"
              >
                <option value="canonical">Canonical (2-player)</option>
                <option value="multi_seat">Multi-seat (2-5)</option>
              </select>
              <select
                value={String(newLobbyVariant === "canonical" ? 2 : newLobbyMaxPlayers)}
                onChange={(event) => setNewLobbyMaxPlayers(Number(event.target.value) || 2)}
                aria-label="Max players"
                disabled={newLobbyVariant === "canonical"}
              >
                {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} seats</option>)}
              </select>
              <select
                value={String(newLobbyMaxRounds)}
                onChange={(event) => setNewLobbyMaxRounds(Number(event.target.value) || 3)}
                aria-label="Max rounds"
              >
                {[1, 3, 5, 7, 9].map((value) => <option key={value} value={value}>{value} rounds</option>)}
              </select>
              <select
                value={String(newLobbyTurnTimer)}
                onChange={(event) => setNewLobbyTurnTimer(Number(event.target.value) || 120)}
                aria-label="Turn timer"
              >
                {[0, 30, 60, 90, 120, 180].map((value) => <option key={value} value={value}>{value === 0 ? "No timer" : `${value}s`}</option>)}
              </select>
              <label className="lobby-toggle">
                <input type="checkbox" checked={newLobbyRanked} onChange={(event) => setNewLobbyRanked(event.target.checked)} disabled={newLobbyVariant === "canonical"} />
                Ranked
              </label>
              <label className="lobby-toggle">
                <input type="checkbox" checked={newLobbyAllowAiFill} onChange={(event) => setNewLobbyAllowAiFill(event.target.checked)} />
                AI Fill
              </label>
              <button className="btn btn--primary btn--sm" onClick={handleCreateLobby} disabled={!canUseLobbyControls}>Create</button>
            </div>
          </div>

          <div className="lobby-queue-config">
            <span>Queue preference</span>
            <select value={String(preferredQueuePlayers)} onChange={(event) => setPreferredQueuePlayers(Number(event.target.value) || 2)} aria-label="Preferred queue table size">
              {[2, 3, 4, 5].map((value) => <option key={value} value={value}>Up to {value} players</option>)}
            </select>
          </div>

          <div className="lobby-join-code">
            <span>Join by lobby code</span>
            <input
              value={joinLobbyCodeValue}
              onChange={(event) => setJoinLobbyCodeValue(event.target.value.toUpperCase())}
              placeholder="e.g. X4K9P2"
              aria-label="Join by lobby code"
              disabled={!canUseLobbyControls}
            />
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => runLobbyAction("join-code", async () => {
                const trimmed = joinLobbyCodeValue.trim();
                if (!trimmed) {
                  throw new Error("Enter a lobby code first.");
                }
                const lobby = await joinLobbyByCode(accessToken, trimmed);
                setJoinLobbyCodeValue(lobby.lobbyCode);
              })}
              disabled={!canUseLobbyControls || ownLobby !== undefined}
            >
              Join Code
            </button>
          </div>

          <div className="lobby-table-list">
            {lobbies.length === 0 ? <p className="lobby-empty">No open tables.</p> : null}
            {lobbies.map((lobby) => {
              const inLobby = lobby.players.some((player) => player.userId === userId);
              const isHost = lobby.hostUserId === userId;
              const readyPlayer = lobby.players.find((player) => player.userId === userId)?.ready ?? false;
              const readyCount = lobby.players.filter((player) => player.ready).length;
              const seatSlots = Array.from({ length: lobby.maxPlayers }, (_, index) => lobby.players[index] ?? null);
              const canStart = isHost
                && readyCount === 2
                && (lobby.tableSettings.variant === "multi_seat" || lobby.players.length === 2);
              const canAddAi = isHost && lobby.tableSettings.allowAiFill && lobby.players.length < lobby.maxPlayers;

              return (
                <article className="lobby-table" key={lobby.id}>
                  <div>
                    <strong>{lobby.name}</strong>
                    <span>Code {lobby.lobbyCode}</span>
                    <span>Status {lobby.status === "matchmaking" ? "Matchmaking" : lobby.status === "in_game" ? "In Game" : lobby.status === "closed" ? "Closed" : "Waiting"}</span>
                    <span>{lobby.players.length}/{lobby.maxPlayers} seats</span>
                    <span>
                      {lobby.tableSettings.variant === "multi_seat" ? "Multi-seat" : "Canonical"}
                      {" · "}{lobby.tableSettings.maxRounds} rounds
                      {" · "}{lobby.tableSettings.turnTimerSeconds === 0 ? "No timer" : `${lobby.tableSettings.turnTimerSeconds}s turn timer`}
                      {" · "}{lobby.tableSettings.ranked ? "Ranked" : "Casual"}
                      {" · "}{lobby.tableSettings.allowAiFill ? "AI fill on" : "AI fill off"}
                    </span>
                    <div className="lobby-seat-grid">
                      {seatSlots.map((seat, index) => {
                        if (!seat) {
                          return (
                            <div className="lobby-seat lobby-seat--empty" key={`${lobby.id}-seat-${index}`}>
                              <span>Seat {index + 1}</span>
                              <strong>Open</strong>
                            </div>
                          );
                        }

                        const connectionStatus = seat.connectionStatus ?? (seat.isAi ? "ai_takeover" : "connected");
                        const connectionLabel = connectionStatus === "ai_takeover"
                          ? "AI takeover"
                          : connectionStatus === "disconnected"
                            ? "Disconnected"
                            : "Connected";

                        return (
                          <div className="lobby-seat" key={`${lobby.id}-${seat.userId}`}>
                            <span>Seat {index + 1}</span>
                            <strong>{seat.displayName}</strong>
                            <small>
                              {seat.ready ? "Ready" : "Waiting"}
                              {" · "}
                              {connectionLabel}
                            </small>
                            {isHost && seat.isAi ? (
                              <select
                                value={seat.aiDifficulty ?? "professional"}
                                onChange={(event) => {
                                  const difficulty = event.target.value as AdvisorDifficulty;
                                  void runLobbyAction(`ai-difficulty-${lobby.id}-${seat.userId}`, async () => {
                                    await updateLobbyAiDifficulty(accessToken, lobby.id, seat.userId, difficulty);
                                  });
                                }}
                                disabled={!canUseLobbyControls}
                                aria-label={`AI difficulty for seat ${index + 1}`}
                              >
                                <option value="easy">AI Easy</option>
                                <option value="hard">AI Hard</option>
                                <option value="professional">AI Professional</option>
                              </select>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="lobby-table__actions">
                    {inLobby ? (
                      <>
                        <button className="btn btn--card" onClick={() => runLobbyAction(`ready-${lobby.id}`, async () => { await setLobbyReady(accessToken, lobby.id, !readyPlayer); })} disabled={!canUseLobbyControls}>
                          {readyPlayer ? "Unready" : "Ready"}
                        </button>
                        {isHost ? (
                          <button
                            className="btn btn--card"
                            onClick={() => runLobbyAction(`status-${lobby.id}`, async () => {
                              await setLobbyStatus(accessToken, lobby.id, lobby.status === "matchmaking" ? "waiting" : "matchmaking");
                            })}
                            disabled={!canUseLobbyControls}
                          >
                            {lobby.status === "matchmaking" ? "Set Waiting" : "Set Matchmaking"}
                          </button>
                        ) : null}
                        {isHost ? <button className="btn btn--card" onClick={() => runLobbyAction(`ai-${lobby.id}`, async () => { await addLobbyAi(accessToken, lobby.id, wallet?.userSettings.preferredAiDifficulty ?? "professional"); })} disabled={!canUseLobbyControls || !canAddAi}>Add AI</button> : null}
                        {isHost ? <button className="btn btn--primary btn--sm" onClick={() => runLobbyAction(`start-${lobby.id}`, async () => { const result = await startLobby(accessToken, lobby.id); onEnterMatch(result.match); })} disabled={!canUseLobbyControls || !canStart}>Start</button> : null}
                        <button className="btn btn--ghost btn--sm" onClick={() => runLobbyAction(`leave-${lobby.id}`, async () => { await leaveLobby(accessToken, lobby.id); })} disabled={!canUseLobbyControls}>Leave</button>
                      </>
                    ) : (
                      <button className="btn btn--card" onClick={() => runLobbyAction(`join-${lobby.id}`, async () => {
                        const password = lobby.passwordHash ? (window.prompt("This table requires a password.") ?? "") : undefined;
                        await joinLobby(accessToken, lobby.id, password || undefined);
                      })} disabled={!canUseLobbyControls || ownLobby !== undefined || lobby.players.length >= lobby.maxPlayers}>Join</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="lobby-panel">
          <p className="lobby-kicker">Leaderboard</p>
          <div className="lobby-list">
            {leaders.map((leader) => <div key={leader.userId}><span>#{leader.rank} {leader.displayName}</span><strong>{leader.mmr}</strong></div>)}
            {leaders.length === 0 ? <p className="lobby-empty">No ranked games yet.</p> : null}
          </div>
        </section>

        <section className="lobby-panel">
          <p className="lobby-kicker">Recent History</p>
          <div className="lobby-list">
            {history.map((match) => <div key={match.matchId}><span>{match.summary}</span><strong>{formatDate(match.completedAt)}</strong></div>)}
            {history.length === 0 ? <p className="lobby-empty">No completed matches.</p> : null}
          </div>
        </section>

        <QuickSideboardSwitcher accessToken={accessToken} variant="lobby" onOpenWorkshop={onOpenWorkshop} />
      </div>
    </div>
  );
}


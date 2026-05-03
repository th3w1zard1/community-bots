import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { MAIN_MENU_PRESET, type MainMenuIconKey, type MainMenuModeCardPreset, type MainMenuAiOptionPreset, type MainMenuActionPreset, type MainMenuRulePreset } from "@openkotor/pazaak-engine/menu-preset";
import type {
  AdvisorDifficulty,
  LeaderboardEntry,
  MatchmakingQueueRecord,
  PazaakCardBackStyle,
  PazaakChatAudience,
  PazaakGameMode,
  PazaakLobbyRecord,
  PazaakLobbySideboardMode,
  PazaakMatchHistoryRecord,
  PazaakSoundTheme,
  PazaakTableAmbience,
  PazaakTableTheme,
  PazaakTableVariant,
  PazaakUserSettings,
  SerializedMatch,
  WalletRecord,
} from "./types.ts";
import { initDiscordAuth, closeActivity, isDiscordActivity } from "./discord.ts";
import { getDefaultLocalOpponentForDifficulty, localOpponents, type LocalOpponentProfile } from "./localOpponents.ts";
import {
  addLobbyAi,
  createLobby,
  fetchCardWorldConfig,
  fetchMatch,
  fetchPublicPazaakConfig,
  enqueueMatchmaking,
  fetchSocialAuthProviders,
  fetchMatchmakingStats,
  fetchMatchmakingStatus,
  fetchHistory,
  fetchLeaderboard,
  fetchLobbies,
  fetchAuthSession,
  fetchMe,
  fetchMyMatch,
  joinLobby,
  joinLobbyByCode,
  leaveLobby,
  leaveMatchmaking,
  logoutAccount,
  loginAccount,
  registerAccount,
  startSocialAuth,
  type SocialAuthProvider,
  type SocialAuthProviderConfig,
  type PublicPazaakConfig,
  updateLobbyAiDifficulty,
  updateSettings,
  type MatchSocketConnectionState,
  setLobbyReady,
  setLobbyStatus,
  startLobby,
  subscribeToLobbies,
  subscribeToMatch,
  sendChatMessage,
  type ChatMessage,
  probeTraskAvailable,
  bootstrapNakamaActivitySession,
  isNakamaBackend,
} from "./api.ts";
import { GameBoard } from "./components/GameBoard.tsx";
import { LocalBlackjackGame } from "./components/LocalBlackjackGame.tsx";
import { LocalPracticeGame } from "./components/LocalPracticeGame.tsx";
import { QuickSideboardSwitcher } from "./components/QuickSideboardSwitcher.tsx";
import { SideboardWorkshop } from "./components/SideboardWorkshop.tsx";
import { GlobalAccountCorner } from "./components/GlobalAccountCorner.tsx";
import { CommunityBotsDashboard } from "./components/CommunityBotsDashboard.tsx";
import { DiscordBotsHub } from "./components/DiscordBotsHub.tsx";
import { TraskScreen } from "./components/TraskScreen.tsx";
import { TournamentHub } from "./components/TournamentHub.tsx";
import { HowToPlayPanel } from "./components/HowToPlayPanel.tsx";
import { formatWalletRatingLine } from "./utils/ratingLabels.ts";
import { shellPresetFromTableTheme } from "./kotorShell.ts";
import { soundManager } from "./utils/soundManager.ts";
import { ConnectionStatus } from "./components/ConnectionStatus.tsx";
import { subscribeToActivityRelay, type ActivityRelayConnectionState, type ActivityRelayMember } from "./activityRelay.ts";
import type { CardWorldConfig } from "@openkotor/platform";

const STANDALONE_AUTH_TOKEN_KEY = "pazaak-world-standalone-auth-token-v1";
const USER_SETTINGS_STORAGE_KEY = "pazaak-user-settings-v1";
const AUTH_MODE_STORAGE_KEY = "pazaak-world-auth-mode-v1";
const ONBOARDING_STORAGE_KEY = "pazaak-world-onboarding-v1";
const LOCAL_GUEST_ID_KEY = "pazaak-world-local-guest-id-v1";
const CHITIN_PROOF_STORAGE_KEY = "cardworld-chitin-proof-v1";

const DEFAULT_CARDWORLD_CONFIG: CardWorldConfig = {
  botGameType: "pazaak",
  defaultPublicGameType: "blackjack",
  pazaakRequiresOwnershipProof: true,
  acceptedOwnershipProofFilenames: ["chitin.key"],
};

interface OwnershipProofRecord {
  filename: string;
  size: number;
  uploadedAt: string;
}

const loadOwnershipProof = (): OwnershipProofRecord | null => {
  try {
    const raw = window.localStorage.getItem(CHITIN_PROOF_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<OwnershipProofRecord>;
    if (!parsed.filename || typeof parsed.size !== "number" || !parsed.uploadedAt) {
      return null;
    }

    return {
      filename: parsed.filename,
      size: parsed.size,
      uploadedAt: parsed.uploadedAt,
    };
  } catch {
    return null;
  }
};

const saveOwnershipProof = (record: OwnershipProofRecord): void => {
  try {
    window.localStorage.setItem(CHITIN_PROOF_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage write failures.
  }
};

type OnboardingBoardStyle = "classic" | "wood" | "ocean" | "rose";

interface OnboardingState {
  completed: boolean;
  boardStyle: OnboardingBoardStyle;
  notificationChoice: "pending" | "allow" | "skip";
  completedAt?: string;
}

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  boardStyle: "classic",
  notificationChoice: "pending",
};

const loadOnboardingState = (): OnboardingState => {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ONBOARDING_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      ...DEFAULT_ONBOARDING_STATE,
      ...parsed,
    };
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
};

const saveOnboardingState = (state: OnboardingState): void => {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures.
  }
};

const loadUserSettings = (): PazaakUserSettings => {
  try {
    const stored = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      return coercePazaakUserSettings(parsed);
    }
  } catch {
    // Use defaults
  }
  return DEFAULT_USER_SETTINGS;
};

const saveUserSettings = (settings: PazaakUserSettings): void => {
  try {
    window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures
  }
};

const getStoredStandaloneAuthToken = (): string => {
  try {
    return window.localStorage.getItem(STANDALONE_AUTH_TOKEN_KEY)?.trim() || "";
  } catch {
    return "";
  }
};

const setStoredStandaloneAuthToken = (token: string): void => {
  try {
    window.localStorage.setItem(STANDALONE_AUTH_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures (private mode/storage disabled).
  }
};

const clearStoredStandaloneAuthToken = (): void => {
  try {
    window.localStorage.removeItem(STANDALONE_AUTH_TOKEN_KEY);
  } catch {
    // Ignore storage failures (private mode/storage disabled).
  }
};

const getOrCreateLocalGuestId = (): string => {
  try {
    const existing = window.localStorage.getItem(LOCAL_GUEST_ID_KEY)?.trim();
    if (existing) {
      return existing;
    }

    const created = `guest-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(LOCAL_GUEST_ID_KEY, created);
    return created;
  } catch {
    return `guest-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const MENU_ICON_MAP: Record<MainMenuIconKey, string> = {
  rocket: "◆",
  robot: "◈",
  seedling: "◇",
  brain: "◉",
  crown: "★",
  bolt: "⚡",
  search: "⌕",
  users: "◎",
  plus: "+",
  signin: "↦",
  scroll: "▤",
  target: "◎",
  layers: "▦",
  star: "✶",
  settings: "⚙",
  user: "◌",
};

const menuIcon = (icon: MainMenuIconKey): string => MENU_ICON_MAP[icon] ?? "•";

const formatDifficultyLabel = (difficulty: AdvisorDifficulty): string => {
  if (difficulty === "easy") {
    return "Easy";
  }

  if (difficulty === "hard") {
    return "Hard";
  }

  return "Professional";
};

const formatVendorDifficultyLabel = (difficulty: LocalOpponentProfile["vendorDifficulty"]): string => {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
};

const DEFAULT_USER_SETTINGS: PazaakUserSettings = {
  tableTheme: "ebon-hawk",
  cardBackStyle: "classic",
  tableAmbience: "cantina",
  soundEnabled: false,
  soundTheme: "default",
  reducedMotionEnabled: false,
  turnTimerSeconds: 45,
  preferredAiDifficulty: "professional",
  confirmForfeit: true,
  highlightValidPlays: true,
  focusMode: false,
  showRatingsInGame: true,
  showGuildEmblems: true,
  showHolocronStreaks: true,
  showPostMatchDebrief: true,
  chatAudience: "everyone",
};

const PAZAAK_TABLE_THEMES = ["ebon-hawk", "coruscant", "tatooine", "manaan", "dantooine", "malachor"] as const satisfies readonly PazaakTableTheme[];
const PAZAAK_CARD_BACK_STYLES = ["classic", "holographic", "mandalorian", "republic", "sith"] as const satisfies readonly PazaakCardBackStyle[];
const PAZAAK_TABLE_AMBIENCES = ["cantina", "ebon-hawk", "jedi-archives", "outer-rim", "sith-sanctum"] as const satisfies readonly PazaakTableAmbience[];
const PAZAAK_SOUND_THEMES = ["default", "cantina", "droid", "force"] as const satisfies readonly PazaakSoundTheme[];
const PAZAAK_CHAT_AUDIENCES = ["everyone", "guild", "silent"] as const satisfies readonly PazaakChatAudience[];
const ADVISOR_DIFFICULTIES = ["easy", "hard", "professional"] as const satisfies readonly AdvisorDifficulty[];

function isUnionMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function coerceFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, Math.round(value)));
  return clamped;
}

function coercePazaakUserSettings(raw: unknown): PazaakUserSettings {
  const base = DEFAULT_USER_SETTINGS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;
  return {
    tableTheme: isUnionMember(o.tableTheme, PAZAAK_TABLE_THEMES) ? o.tableTheme : base.tableTheme,
    cardBackStyle: isUnionMember(o.cardBackStyle, PAZAAK_CARD_BACK_STYLES) ? o.cardBackStyle : base.cardBackStyle,
    tableAmbience: isUnionMember(o.tableAmbience, PAZAAK_TABLE_AMBIENCES) ? o.tableAmbience : base.tableAmbience,
    soundEnabled: typeof o.soundEnabled === "boolean" ? o.soundEnabled : base.soundEnabled,
    soundTheme: isUnionMember(o.soundTheme, PAZAAK_SOUND_THEMES) ? o.soundTheme : base.soundTheme,
    reducedMotionEnabled: typeof o.reducedMotionEnabled === "boolean" ? o.reducedMotionEnabled : base.reducedMotionEnabled,
    turnTimerSeconds: coerceFiniteNumber(o.turnTimerSeconds, base.turnTimerSeconds, 15, 120),
    preferredAiDifficulty: isUnionMember(o.preferredAiDifficulty, ADVISOR_DIFFICULTIES)
      ? o.preferredAiDifficulty
      : base.preferredAiDifficulty,
    confirmForfeit: typeof o.confirmForfeit === "boolean" ? o.confirmForfeit : base.confirmForfeit,
    highlightValidPlays: typeof o.highlightValidPlays === "boolean" ? o.highlightValidPlays : base.highlightValidPlays,
    focusMode: typeof o.focusMode === "boolean" ? o.focusMode : base.focusMode,
    showRatingsInGame: typeof o.showRatingsInGame === "boolean" ? o.showRatingsInGame : base.showRatingsInGame,
    showGuildEmblems: typeof o.showGuildEmblems === "boolean" ? o.showGuildEmblems : base.showGuildEmblems,
    showHolocronStreaks: typeof o.showHolocronStreaks === "boolean" ? o.showHolocronStreaks : base.showHolocronStreaks,
    showPostMatchDebrief: typeof o.showPostMatchDebrief === "boolean" ? o.showPostMatchDebrief : base.showPostMatchDebrief,
    chatAudience: isUnionMember(o.chatAudience, PAZAAK_CHAT_AUDIENCES) ? o.chatAudience : base.chatAudience,
  };
}

const areUserSettingsEqual = (left: PazaakUserSettings, right: PazaakUserSettings): boolean => {
  return left.tableTheme === right.tableTheme
    && left.cardBackStyle === right.cardBackStyle
    && left.tableAmbience === right.tableAmbience
    && left.soundEnabled === right.soundEnabled
    && left.soundTheme === right.soundTheme
    && left.reducedMotionEnabled === right.reducedMotionEnabled
    && left.turnTimerSeconds === right.turnTimerSeconds
    && left.preferredAiDifficulty === right.preferredAiDifficulty
    && left.confirmForfeit === right.confirmForfeit
    && left.highlightValidPlays === right.highlightValidPlays
    && left.focusMode === right.focusMode
    && left.showRatingsInGame === right.showRatingsInGame
    && left.showGuildEmblems === right.showGuildEmblems
    && left.showHolocronStreaks === right.showHolocronStreaks
    && left.showPostMatchDebrief === right.showPostMatchDebrief
    && left.chatAudience === right.chatAudience;
};

function ProviderMark({ provider }: { provider: SocialAuthProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.3-5.3l-6.5-5.5C29 34.6 26.6 36 24 36c-5.2 0-9.6-3.5-11.2-8.2l-6.6 5.1C9.5 39.5 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3 5.5-5.5 7.2l.1-.1 6.5 5.5C36 41 44 35 44 24c0-1.3-.1-2.3-.4-3.5z" />
      </svg>
    );
  }

  if (provider === "discord") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.769-.553 1.117a18.27 18.27 0 0 0-5.364 0A11.427 11.427 0 0 0 9.415 3a19.736 19.736 0 0 0-4.433 1.369C2.177 8.523 1.41 12.57 1.793 16.562a19.9 19.9 0 0 0 5.293 2.677 13.06 13.06 0 0 0 1.134-1.842 12.955 12.955 0 0 1-1.789-.861c.15-.109.296-.222.438-.338 3.45 1.623 7.196 1.623 10.605 0 .143.116.289.229.439.338-.571.333-1.172.62-1.793.862.32.658.699 1.272 1.133 1.84a19.863 19.863 0 0 0 5.295-2.676c.468-4.627-.798-8.637-3.24-12.193ZM9.954 14.144c-1.03 0-1.874-.947-1.874-2.11 0-1.164.826-2.111 1.874-2.111 1.057 0 1.892.956 1.874 2.11 0 1.164-.826 2.11-1.874 2.11Zm4.092 0c-1.03 0-1.874-.947-1.874-2.11 0-1.164.826-2.111 1.874-2.111 1.057 0 1.892.956 1.874 2.11 0 1.164-.817 2.11-1.874 2.11Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.649.5.5 5.649.5 12A11.5 11.5 0 0 0 8.36 22.06c.575.106.785-.25.785-.556 0-.274-.01-1-.016-1.962-3.184.692-3.855-1.534-3.855-1.534-.52-1.322-1.27-1.674-1.27-1.674-1.037-.709.08-.695.08-.695 1.147.08 1.75 1.178 1.75 1.178 1.02 1.748 2.675 1.243 3.326.95.104-.739.4-1.244.727-1.53-2.542-.289-5.215-1.271-5.215-5.657 0-1.249.446-2.27 1.176-3.07-.118-.289-.51-1.452.111-3.027 0 0 .96-.307 3.145 1.173a10.93 10.93 0 0 1 5.728 0c2.184-1.48 3.143-1.173 3.143-1.173.623 1.575.231 2.738.113 3.027.732.8 1.174 1.821 1.174 3.07 0 4.397-2.677 5.365-5.227 5.648.412.355.779 1.058.779 2.133 0 1.54-.014 2.782-.014 3.16 0 .309.207.668.79.554A11.502 11.502 0 0 0 23.5 12C23.5 5.649 18.351.5 12 .5Z" />
    </svg>
  );
}

type ActivitySession = {
  userId: string;
  username: string;
  accessToken: string;
  instanceId?: string;
  guildId?: string;
  channelId?: string;
};

const createLocalGuestSession = (): ActivitySession => {
  const guestId = getOrCreateLocalGuestId();
  return {
    userId: guestId,
    username: "Guest Pilot",
    accessToken: `local-guest-token:${guestId}`,
  };
};

const maybeBootstrapNakama = async (session: ActivitySession): Promise<ActivitySession> => {
  if (!isNakamaBackend()) return session;
  return bootstrapNakamaActivitySession(session);
};

const PAZAAK_WORLD_PUBLIC_ROUTE = "/bots/pazaakworld";
const DISCORD_BOTS_HUB_ROUTE = "/bots";

const normalizePathname = (): string => window.location.pathname.replace(/\/+$/u, "") || "/";

const isPazaakWorldRoute = (): boolean => {
  if (isDiscordActivity()) {
    return true;
  }

  const pathname = normalizePathname();
  return pathname === PAZAAK_WORLD_PUBLIC_ROUTE
    || pathname.startsWith(`${PAZAAK_WORLD_PUBLIC_ROUTE}/`)
    || pathname === "/pazaakworld"
    || pathname.startsWith("/pazaakworld/");
};

const isDiscordBotsHubRoute = (): boolean => {
  const pathname = normalizePathname();
  return pathname === DISCORD_BOTS_HUB_ROUTE || pathname === `${DISCORD_BOTS_HUB_ROUTE}/`;
};

export default function App() {
  if (isPazaakWorldRoute()) {
    return <PazaakWorldApp />;
  }
  if (isDiscordBotsHubRoute()) {
    return <DiscordBotsHub />;
  }
  return <CommunityBotsDashboard />;
}

// ---------------------------------------------------------------------------
// App states
// ---------------------------------------------------------------------------

type AppState =
  | { stage: "loading" }
  | { stage: "auth_error"; message: string }
  | { stage: "onboarding"; auth: ActivitySession }
  | { stage: "mode_selection"; auth: ActivitySession }
  | { stage: "matchmaking"; auth: ActivitySession; preferredMaxPlayers: number }
  | { stage: "lobby"; auth: ActivitySession }
  | { stage: "local_game"; auth: ActivitySession; difficulty: AdvisorDifficulty; opponentId?: string }
  | { stage: "blackjack_game"; auth: ActivitySession }
  | { stage: "workshop"; auth: ActivitySession; returnTo: "lobby" | "game"; match?: SerializedMatch }
  | { stage: "game"; auth: ActivitySession; match: SerializedMatch }
  | { stage: "tournament"; auth: ActivitySession; tournamentId?: string | null }
  | { stage: "trask"; auth: ActivitySession };

function getSessionFromAppState(state: AppState): ActivitySession | null {
  switch (state.stage) {
    case "loading":
    case "auth_error":
      return null;
    case "onboarding":
    case "mode_selection":
    case "matchmaking":
    case "lobby":
    case "local_game":
    case "blackjack_game":
    case "workshop":
    case "game":
    case "tournament":
    case "trask":
      return state.auth;
  }
}

function PazaakWorldApp() {
  const [state, setState] = useState<AppState>({ stage: "loading" });
  const [matchSocketState, setMatchSocketState] = useState<MatchSocketConnectionState>("disconnected");
  const [activityRelayState, setActivityRelayState] = useState<ActivityRelayConnectionState>("disabled");
  const [activityRelayMembers, setActivityRelayMembers] = useState<ActivityRelayMember[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [cornerWallet, setCornerWallet] = useState<WalletRecord | null>(null);
  const [cornerBusy, setCornerBusy] = useState(false);
  const activeSession = getSessionFromAppState(state);
  const [userSettings, setUserSettings] = useState<PazaakUserSettings>(loadUserSettings);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(loadOnboardingState);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authDialogMessage, setAuthDialogMessage] = useState<string | undefined>();
  const [traskAvailable, setTraskAvailable] = useState(false);
  const [cardWorldConfig, setCardWorldConfig] = useState<CardWorldConfig>(DEFAULT_CARDWORLD_CONFIG);
  const [ownershipProof, setOwnershipProof] = useState<OwnershipProofRecord | null>(loadOwnershipProof);

  const isPazaakUnlocked = useMemo(() => {
    if (!cardWorldConfig.pazaakRequiresOwnershipProof) {
      return true;
    }

    if (isDiscordActivity()) {
      return true;
    }

    return Boolean(ownershipProof);
  }, [cardWorldConfig.pazaakRequiresOwnershipProof, ownershipProof]);

  const shouldRequireOnboarding = useCallback(() => {
    return !isDiscordActivity() && !onboardingState.completed;
  }, [onboardingState.completed]);

  const routePostAuth = useCallback((session: ActivitySession, match: SerializedMatch | null) => {
    if (match) {
      setState({ stage: "game", auth: session, match });
      return;
    }

    if (shouldRequireOnboarding()) {
      setState({ stage: "onboarding", auth: session });
      return;
    }

    setState({ stage: "mode_selection", auth: session });
  }, [shouldRequireOnboarding]);

  const handleSettingsSave = useCallback(async (settings: PazaakUserSettings) => {
    setUserSettings(settings);
    saveUserSettings(settings);
    soundManager.setEnabled(settings.soundEnabled);

    if (activeSession?.accessToken) {
      try {
        await updateSettings(activeSession.accessToken, settings);
      } catch (error) {
        console.error("Failed to save settings to server:", error);
      }
    }
  }, [activeSession?.accessToken]);

  useEffect(() => {
    if (!activeSession?.accessToken) {
      setCornerWallet(null);
      setMatchSocketState("disconnected");
      setActivityRelayState("disabled");
      setActivityRelayMembers([]);
      return;
    }

    let cancelled = false;
    fetchMe(activeSession.accessToken)
      .then((data) => {
        if (!cancelled) {
          setCornerWallet(data.wallet);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCornerWallet(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSession?.accessToken]);

  useEffect(() => {
    const preset = shellPresetFromTableTheme(userSettings.tableTheme);
    document.documentElement.dataset.kotorShell = preset;
    return () => {
      delete document.documentElement.dataset.kotorShell;
    };
  }, [userSettings.tableTheme]);

  useEffect(() => {
    if (!activeSession) {
      setActivityRelayState("disabled");
      setActivityRelayMembers([]);
      return;
    }

    return subscribeToActivityRelay(activeSession, {
      reconnect: true,
      onConnectionChange: setActivityRelayState,
      onPresence: setActivityRelayMembers,
    });
  }, [activeSession?.instanceId, activeSession?.userId, activeSession?.username]);

  useEffect(() => {
    if (activityRelayState === "connected" && activityRelayMembers.length > 0) {
      console.debug("PazaakWorld Activity relay presence", activityRelayMembers);
    }
  }, [activityRelayMembers, activityRelayState]);

  const handleCornerRefresh = useCallback(async () => {
    if (!activeSession?.accessToken) {
      return;
    }

    setCornerBusy(true);
    try {
      const data = await fetchMe(activeSession.accessToken);
      setCornerWallet(data.wallet);
    } finally {
      setCornerBusy(false);
    }
  }, [activeSession?.accessToken]);

  const handleCornerLogout = useCallback(async () => {
    if (!activeSession?.accessToken) {
      return;
    }

    setCornerBusy(true);
    try {
      await logoutAccount(activeSession.accessToken);
    } catch {
      // Continue local cleanup even if remote logout fails.
    } finally {
      clearStoredStandaloneAuthToken();
      setCornerWallet(null);
      setCornerBusy(false);
    }

    if (isDiscordActivity()) {
      try {
        const auth = await initDiscordAuth();
        const match = await fetchMyMatch(auth.accessToken);
        const session: ActivitySession = {
          userId: auth.userId,
          username: auth.username,
          accessToken: auth.accessToken,
          ...(auth.instanceId ? { instanceId: auth.instanceId } : {}),
          ...(auth.guildId ? { guildId: auth.guildId } : {}),
          ...(auth.channelId ? { channelId: auth.channelId } : {}),
        };
        routePostAuth(session, match);
        return;
      } catch {
        setState({ stage: "auth_error", message: "Signed out. Reconnect to continue." });
        return;
      }
    }

    const signedOutGuest = createLocalGuestSession();
    setStoredStandaloneAuthToken(signedOutGuest.accessToken);
    routePostAuth(signedOutGuest, null);
  }, [activeSession?.accessToken, routePostAuth]);

  const withGlobalAccountCorner = useCallback((content: React.ReactNode) => (
    <>
      {content}
      <GlobalAccountCorner
        username={activeSession?.username ?? "Guest Pilot"}
        mmr={cornerWallet?.mmr ?? (activeSession ? 1000 : null)}
        mmrRd={cornerWallet?.mmrRd ?? null}
        isOnline={isOnline}
        canLogout={Boolean(activeSession?.accessToken)}
        canJumpToLobby={Boolean(activeSession?.accessToken) && state.stage !== "lobby"}
        busy={cornerBusy}
        currentSettings={userSettings}
        socketState={matchSocketState}
        accessToken={activeSession?.accessToken ?? null}
        onRefresh={handleCornerRefresh}
        onJumpToLobby={() => {
          if (!activeSession) return;
          setState({ stage: "lobby", auth: activeSession });
        }}
        onLogout={handleCornerLogout}
        onSettingsSave={handleSettingsSave}
        onSignIn={() => {
          if (isDiscordActivity()) {
            window.location.reload();
            return;
          }
          setShowAuthDialog(true);
        }}
      />
      <AuthDialog
        isOpen={showAuthDialog}
        initialMessage={authDialogMessage}
        onClose={() => { setShowAuthDialog(false); setAuthDialogMessage(undefined); }}
        onAuthenticated={async (session) => {
          setStoredStandaloneAuthToken(session.accessToken);
          setShowAuthDialog(false);
          setAuthDialogMessage(undefined);
          let match: SerializedMatch | null = null;
          try {
            match = await fetchMyMatch(session.accessToken);
          } catch {
            match = null;
          }
          routePostAuth(session, match);
        }}
      />
    </>
  ), [activeSession, authDialogMessage, cornerBusy, cornerWallet?.mmr, cornerWallet?.mmrRd, handleCornerLogout, handleCornerRefresh, isOnline, routePostAuth, showAuthDialog, state.stage, userSettings, matchSocketState, handleSettingsSave]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchCardWorldConfig()
      .then((config) => {
        if (!cancelled) {
          setCardWorldConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCardWorldConfig(DEFAULT_CARDWORLD_CONFIG);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Probe Trask sidecar availability when entering mode_selection.
  useEffect(() => {
    if (state.stage !== "mode_selection") return;
    const token = state.auth.accessToken;
    let cancelled = false;
    probeTraskAvailable(token).then((available) => {
      if (!cancelled) setTraskAvailable(available);
    }).catch(() => {
      if (!cancelled) setTraskAvailable(false);
    });
    return () => { cancelled = true; };
  // Re-probe each time the user enters mode_selection (stage change covers token rotation too).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage]);

  // Update browser tab title based on current stage.
  useEffect(() => {
    const stageTitles: Partial<Record<AppState["stage"], string>> = {
      loading: "PazaakWorld — Loading",
      auth_error: "PazaakWorld — Error",
      onboarding: "PazaakWorld - Onboarding",
      mode_selection: "PazaakWorld — Choose Mode",
      matchmaking: "PazaakWorld — Finding Match…",
      lobby: "PazaakWorld — Lobby",
      local_game: "PazaakWorld — Practice",
      blackjack_game: "PazaakWorld — Blackjack Practice",
      workshop: "PazaakWorld — Sideboard Workshop",
      game: "PazaakWorld — Match",
      trask: "PazaakWorld — Ask Trask",
    };
    document.title = stageTitles[state.stage] ?? "PazaakWorld";
  }, [state.stage]);

  // On mount: run Discord SDK auth, then poll for an active match.
  useEffect(() => {
    (async () => {
      try {
        if (!isDiscordActivity()) {
          const params = new URLSearchParams(window.location.search);
          const oauthToken = params.get("oauth_app_token")?.trim() || "";
          const oauthError = params.get("oauth_error")?.trim() || "";
          const clearOauthQuery = () => {
            params.delete("oauth_app_token");
            params.delete("oauth_user_id");
            params.delete("oauth_username");
            params.delete("oauth_provider");
            params.delete("oauth_error");
            params.delete("oauth_error_description");
            window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
          };

          if (oauthError) {
            clearOauthQuery();
            const oauthGuest = await maybeBootstrapNakama(createLocalGuestSession());
            setStoredStandaloneAuthToken(oauthGuest.accessToken);
            setAuthDialogMessage(decodeURIComponent(oauthError));
            setShowAuthDialog(true);
            routePostAuth(oauthGuest, null);
            return;
          }

          const accessToken = oauthToken || getStoredStandaloneAuthToken();
          const requestedMatchId = params.get("matchId")?.trim() || "";
          
          if (accessToken) {
            try {
              const sessionInfo = await fetchAuthSession(accessToken);
              const username = sessionInfo.account.displayName;
              const userId = sessionInfo.account.legacyGameUserId ?? sessionInfo.account.accountId;
              let authSession: ActivitySession = {
                userId,
                username,
                accessToken,
              };
              authSession = await maybeBootstrapNakama(authSession);

              setStoredStandaloneAuthToken(authSession.accessToken);
              const requestedMatch = requestedMatchId
                ? await fetchMatch(requestedMatchId, authSession.accessToken)
                : null;
              const match = requestedMatch ?? await fetchMyMatch(authSession.accessToken);
              routePostAuth(authSession, match);
              clearOauthQuery();
              return;
            } catch {
              clearStoredStandaloneAuthToken();
              clearOauthQuery();
            }
          }

          if (requestedMatchId) {
            try {
              // Try to fetch the match as a guest/spectator
              const spectateGuest = await maybeBootstrapNakama(createLocalGuestSession());
              const requestedMatch = await fetchMatch(requestedMatchId, spectateGuest.accessToken);
              if (requestedMatch) {
                setState({ stage: "game", auth: spectateGuest, match: requestedMatch });
                return;
              }
            } catch {
              // Fall through to guest mode selection
            }
          }

          const bootGuest = await maybeBootstrapNakama(createLocalGuestSession());
          setStoredStandaloneAuthToken(bootGuest.accessToken);
          routePostAuth(bootGuest, null);
          return;
        }

        const discordRaw = await initDiscordAuth();
        const session: ActivitySession = await maybeBootstrapNakama({
          userId: discordRaw.userId,
          username: discordRaw.username,
          accessToken: discordRaw.accessToken,
          ...(discordRaw.instanceId ? { instanceId: discordRaw.instanceId } : {}),
          ...(discordRaw.guildId ? { guildId: discordRaw.guildId } : {}),
          ...(discordRaw.channelId ? { channelId: discordRaw.channelId } : {}),
        });
        const match = await fetchMyMatch(session.accessToken);

        if (match) {
          setState({ stage: "game", auth: session, match });
        } else {
          routePostAuth(session, null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isDiscordActivity() && message.includes("not running inside Discord Activity")) {
          const sdkGuest = await maybeBootstrapNakama(createLocalGuestSession());
          setStoredStandaloneAuthToken(sdkGuest.accessToken);
          routePostAuth(sdkGuest, null);
          return;
        }

        setState({
          stage: "auth_error",
          message,
        });
      }
    })();
  }, [routePostAuth]);

  // Subscribe to live WS updates when in game.
  const handleMatchUpdate = useCallback((updated: SerializedMatch) => {
    setState((prev) => {
      if (prev.stage !== "game") return prev;
      return { ...prev, match: updated };
    });
  }, []);

  useEffect(() => {
    if (state.stage !== "game") return;
    setChatMessages([]);
    const unsubscribe = subscribeToMatch(state.match.id, state.auth.accessToken, handleMatchUpdate, {
      reconnect: true,
      nakamaMatchId: state.match.nakamaMatchId,
      onConnectionChange: setMatchSocketState,
      onChatMessage: (msg) => setChatMessages((prev) => [...prev, msg].slice(-100)),
    });
    return unsubscribe;
    // Re-subscribe when the match or Nakama realtime id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage === "game" ? `${state.match.id}:${state.match.nakamaMatchId ?? ""}` : null, state.stage === "game" ? state.auth.accessToken : null]);

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
    return withGlobalAccountCorner(<LoadingScreen />);
  }

  if (state.stage === "auth_error") {
    return withGlobalAccountCorner(<ErrorScreen message={state.message} />);
  }

  if (state.stage === "onboarding") {
    return withGlobalAccountCorner(
      <OnboardingScreen
        username={state.auth.username}
        onComplete={(next) => {
          setOnboardingState(next);
          saveOnboardingState(next);
          setState({ stage: "mode_selection", auth: state.auth });
        }}
      />
    );
  }

  if (state.stage === "mode_selection") {
    return withGlobalAccountCorner(
      <ModeSelectionScreen
        socketState={matchSocketState}
        isPazaakUnlocked={isPazaakUnlocked}
        ownershipProof={ownershipProof}
        acceptedOwnershipProofFilenames={cardWorldConfig.acceptedOwnershipProofFilenames}
        onUploadOwnershipProof={(file) => {
          const accepted = cardWorldConfig.acceptedOwnershipProofFilenames.map((name) => name.toLowerCase());
          if (!accepted.includes(file.name.toLowerCase()) || file.size <= 0) {
            throw new Error(`Upload ${cardWorldConfig.acceptedOwnershipProofFilenames.join(" or ")} to unlock Pazaak.`);
          }

          const nextProof: OwnershipProofRecord = {
            filename: file.name,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          };

          saveOwnershipProof(nextProof);
          setOwnershipProof(nextProof);
        }}
        onOpenLobbies={() => setState(isPazaakUnlocked ? { stage: "lobby", auth: state.auth } : { stage: "blackjack_game", auth: state.auth })}
        onQuickMatch={(preferredMaxPlayers) => setState(isPazaakUnlocked
          ? { stage: "matchmaking", auth: state.auth, preferredMaxPlayers }
          : { stage: "blackjack_game", auth: state.auth })}
        onStartLocalGame={(difficulty, opponentId) => setState(isPazaakUnlocked
          ? {
              stage: "local_game",
              auth: state.auth,
              difficulty,
              ...(opponentId ? { opponentId } : {}),
            }
          : { stage: "blackjack_game", auth: state.auth })}
        onStartBlackjackGame={() => setState({ stage: "blackjack_game", auth: state.auth })}
        onOpenTrask={() => setState({ stage: "trask", auth: state.auth })}
        onOpenTournaments={() => setState({ stage: "tournament", auth: state.auth, tournamentId: null })}
        traskAvailable={traskAvailable}
        isOnline={isOnline}
      />
    );
  }

  if (state.stage === "matchmaking") {
    return withGlobalAccountCorner(
      <MatchmakingScreen
        accessToken={state.auth.accessToken}
        preferredMaxPlayers={state.preferredMaxPlayers}
        onEnterMatch={(match) => setState({ stage: "game", auth: state.auth, match })}
        onBack={() => setState({ stage: "mode_selection", auth: state.auth })}
      />
    );
  }

  if (state.stage === "lobby") {
    return withGlobalAccountCorner(
      <LobbyScreen
        accessToken={state.auth.accessToken}
        userId={state.auth.userId}
        username={state.auth.username}
        onOpenWorkshop={() => setState({ stage: "workshop", auth: state.auth, returnTo: "lobby" })}
        onEnterMatch={(match) => setState({ stage: "game", auth: state.auth, match })}
        onStartLocalGame={(difficulty, opponentId) => setState({
          ...(isPazaakUnlocked
            ? {
                stage: "local_game" as const,
                auth: state.auth,
                difficulty,
                ...(opponentId ? { opponentId } : {}),
              }
            : {
                stage: "blackjack_game" as const,
                auth: state.auth,
              }),
        })}
      />
    );
  }

  if (state.stage === "local_game") {
    return withGlobalAccountCorner(
      <LocalPracticeGame
        username={state.auth.username}
        difficulty={state.difficulty}
        opponentId={state.opponentId}
        onExit={() => {
          if (state.auth.accessToken) {
            setState({ stage: "mode_selection", auth: state.auth });
            return;
          }

          const fallbackGuest = createLocalGuestSession();
          setStoredStandaloneAuthToken(fallbackGuest.accessToken);
          routePostAuth(fallbackGuest, null);
        }}
      />
    );
  }

  if (state.stage === "blackjack_game") {
    return withGlobalAccountCorner(
      <LocalBlackjackGame
        username={state.auth.username}
        onExit={() => setState({ stage: "mode_selection", auth: state.auth })}
      />
    );
  }

  if (state.stage === "workshop") {
    return withGlobalAccountCorner(
      <SideboardWorkshop
        accessToken={state.auth.accessToken}
        username={state.auth.username}
        onBack={() => restoreFromWorkshop(state.auth, state.returnTo)}
      />
    );
  }

  if (state.stage === "trask") {
    return (
      <TraskScreen
        accessToken={state.auth.accessToken}
        onBack={() => setState({ stage: "mode_selection", auth: state.auth })}
      />
    );
  }

  if (state.stage === "tournament") {
    return withGlobalAccountCorner(
      <TournamentHub
        accessToken={state.auth.accessToken}
        currentUserId={state.auth.userId}
        initialTournamentId={state.tournamentId ?? null}
        onBack={() => setState({ stage: "mode_selection", auth: state.auth })}
      />
    );
  }

  // stage === "game"
  return withGlobalAccountCorner(
    <GameBoard
      match={state.match}
      userId={state.auth.userId}
      accessToken={state.auth.accessToken}
      socketState={matchSocketState}
      chatMessages={chatMessages}
      onSendChat={(text) => { void sendChatMessage(state.match.id, state.auth.accessToken, text); }}
      onMatchUpdate={(match) => setState({ stage: "game", auth: state.auth, match })}
      onOpenWorkshop={() => setState({ stage: "workshop", auth: state.auth, returnTo: "game", match: state.match })}
      onReturnToLobby={() => setState({ stage: "lobby", auth: state.auth })}
      onSignIn={() => { if (!isDiscordActivity()) { setShowAuthDialog(true); } else { window.location.reload(); } }}
      onExit={() => closeActivity("Player exited game")}
      visualSettings={{
        tableTheme: userSettings.tableTheme,
        cardBackStyle: userSettings.cardBackStyle,
        tableAmbience: userSettings.tableAmbience,
        showRatingsInGame: userSettings.showRatingsInGame,
      }}
    />
  );
}

function OnboardingScreen({
  username,
  onComplete,
}: {
  username: string;
  onComplete: (next: OnboardingState) => void;
}) {
  const [step, setStep] = useState(1);
  const [boardStyle, setBoardStyle] = useState<OnboardingBoardStyle>("classic");
  const [notificationChoice, setNotificationChoice] = useState<OnboardingState["notificationChoice"]>("pending");
  const maxStep = 6;

  const completeOnboarding = () => {
    onComplete({
      completed: true,
      boardStyle,
      notificationChoice,
      completedAt: new Date().toISOString(),
    });
  };

  const nextStep = () => {
    if (step >= maxStep) {
      completeOnboarding();
      return;
    }
    setStep((current) => Math.min(maxStep, current + 1));
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationChoice("skip");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationChoice(permission === "granted" ? "allow" : "skip");
    } catch {
      setNotificationChoice("skip");
    }
  };

  const canContinue = step !== 5 || notificationChoice !== "pending";

  return (
    <div className="pazaak-world-page">
      <main className="pazaak-world-main pazaak-onboarding">
        <section className="pazaak-onboarding__card">
          <p className="pazaak-onboarding__step">Step {step} / {maxStep}</p>
          {step === 1 ? (
            <>
              <h1>Welcome to PazaakWorld, {username}</h1>
              <p>We will set up your match hub in under a minute.</p>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <h1>Choose your default focus</h1>
              <p>All match types stay available; this just tunes your initial hub suggestions.</p>
              <div className="pazaak-onboarding__chips">
                <span>Online Ranked</span>
                <span>Private Lobbies</span>
                <span>AI Practice</span>
              </div>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <h1>Match setup stays flexible</h1>
              <p>Player count, queue target, and bot difficulty can all be changed directly from your matchmaking hub.</p>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <h1>Which board fits your style?</h1>
              <div className="pazaak-onboarding__boards">
                {([
                  ["classic", "Classic"],
                  ["wood", "Cantina Wood"],
                  ["ocean", "Republic Blue"],
                  ["rose", "Sith Rose"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`pazaak-onboarding__board ${boardStyle === value ? "pazaak-onboarding__board--active" : ""}`}
                    onClick={() => setBoardStyle(value)}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {step === 5 ? (
            <>
              <h1>Get notified when it is your move</h1>
              <p>Optional: allow browser notifications for turns, invites, and direct messages.</p>
              <div className="pazaak-onboarding__actions pazaak-onboarding__actions--stack">
                <button className="btn btn--primary" type="button" onClick={() => { void requestNotifications(); }}>Allow notifications</button>
                <button className="btn btn--ghost" type="button" onClick={() => setNotificationChoice("skip")}>No thanks</button>
              </div>
            </>
          ) : null}
          {step === 6 ? (
            <>
              <h1>You are ready</h1>
              <p>Your hub is configured. Discord Activity users are not blocked by web notification setup.</p>
            </>
          ) : null}

          <div className="pazaak-onboarding__footer">
            <div className="pazaak-onboarding__progress" role="progressbar" aria-valuemin={1} aria-valuemax={maxStep} aria-valuenow={step}>
              <span style={{ width: `${(step / maxStep) * 100}%` }} />
            </div>
            <button className="btn btn--primary" type="button" disabled={!canContinue} onClick={nextStep}>{step === maxStep ? "Enter Match Hub" : "Continue"}</button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ModeSelectionScreen({
  socketState,
  onOpenLobbies,
  onQuickMatch,
  onStartLocalGame,
  onStartBlackjackGame,
  onUploadOwnershipProof,
  acceptedOwnershipProofFilenames,
  ownershipProof,
  isPazaakUnlocked,
  onOpenTrask,
  onOpenTournaments,
  traskAvailable = false,
  isOnline = true,
}: {
  socketState?: MatchSocketConnectionState;
  onOpenLobbies: () => void;
  onQuickMatch: (preferredMaxPlayers: number) => void;
  onStartLocalGame: (difficulty: AdvisorDifficulty, opponentId?: string) => void;
  onStartBlackjackGame: () => void;
  onUploadOwnershipProof: (file: File) => void;
  acceptedOwnershipProofFilenames: readonly string[];
  ownershipProof: OwnershipProofRecord | null;
  isPazaakUnlocked: boolean;
  onOpenTrask: () => void;
  onOpenTournaments: () => void;
  traskAvailable?: boolean;
  isOnline?: boolean;
}) {
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [showRulebook, setShowRulebook] = useState(false);
  const [localDifficulty, setLocalDifficulty] = useState<AdvisorDifficulty>(() => {
    try {
      const stored = window.localStorage.getItem("pazaak-world-local-difficulty-v1");
      if (stored === "easy" || stored === "hard" || stored === "professional") {
        return stored;
      }
    } catch {
      // Ignore storage read failures.
    }
    return "professional";
  });
  const [localOpponentId, setLocalOpponentId] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem("pazaak-world-local-opponent-id-v1");
      if (stored && localOpponents.some((opponent) => opponent.id === stored)) {
        return stored;
      }
    } catch {
      // Ignore storage read failures.
    }
    return getDefaultLocalOpponentForDifficulty("professional").id;
  });
  const [matchIntent, setMatchIntent] = useState<"quick_match" | "private_lobby" | "ai_practice">("quick_match");
  const [quickQueuePlayers, setQuickQueuePlayers] = useState(2);
  const lastOpponentClickRef = useRef<{ id: string; timestamp: number } | null>(null);

  const availableOpponents = localOpponents;
  // Read per-opponent local practice stats from localStorage (written by LocalPracticeGame).
  const localPracticeStats = useMemo<Record<string, { played: number; won: number; lost: number }>>(() => {
    try {
      const raw = window.localStorage.getItem("pazaak-world-local-practice-stats-v1");
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { byOpponent?: Record<string, { played: number; won: number; lost: number }> };
      return parsed?.byOpponent ?? {};
    } catch { return {}; }
  }, []);

  const opponentsByVendorDifficulty = useMemo(() => {
    const tiers: LocalOpponentProfile["vendorDifficulty"][] = ["novice", "easy", "normal", "hard", "expert", "master"];
    return tiers
      .map((tier) => ({ tier, opponents: availableOpponents.filter((opponent) => opponent.vendorDifficulty === tier) }))
      .filter((entry) => entry.opponents.length > 0);
  }, [availableOpponents]);

  const selectedOpponent = availableOpponents.find((opponent) => opponent.id === localOpponentId)
    ?? getDefaultLocalOpponentForDifficulty(localDifficulty);
  const selectedLocalOpponentId = selectedOpponent?.id ?? getDefaultLocalOpponentForDifficulty(localDifficulty).id;
  const handleLocalDifficultyChange = (difficulty: AdvisorDifficulty) => {
    setLocalDifficulty(difficulty);
    setLocalOpponentId(getDefaultLocalOpponentForDifficulty(difficulty).id);
  };
  const handleLocalOpponentChange = (opponentId: string) => {
    const opponent = localOpponents.find((entry) => entry.id === opponentId);
    setLocalOpponentId(opponentId);
    if (opponent) {
      setLocalDifficulty(opponent.difficulty);
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem("pazaak-world-local-difficulty-v1", localDifficulty);
    } catch {
      // Ignore storage write failures.
    }
  }, [localDifficulty]);

  useEffect(() => {
    try {
      window.localStorage.setItem("pazaak-world-local-opponent-id-v1", selectedLocalOpponentId);
    } catch {
      // Ignore storage write failures.
    }
  }, [selectedLocalOpponentId]);

  const aiCard = MAIN_MENU_PRESET.modeCards.find((card: MainMenuModeCardPreset) => card.key === "ai");
  const quickMatchCard = MAIN_MENU_PRESET.modeCards.find((card: MainMenuModeCardPreset) => card.key === "quick_match");
  const lobbyCard = MAIN_MENU_PRESET.modeCards.find((card: MainMenuModeCardPreset) => card.key === "private_lobby");

  const launchConfiguredMatch = () => {
    if (matchIntent === "quick_match") {
      onQuickMatch(quickQueuePlayers);
      return;
    }

    if (matchIntent === "private_lobby") {
      onOpenLobbies();
      return;
    }

    onStartLocalGame(localDifficulty, selectedLocalOpponentId);
  };

  const handleLocalOpponentClick = (opponent: LocalOpponentProfile) => {
    handleLocalOpponentChange(opponent.id);

    const now = window.performance.now();
    const previousClick = lastOpponentClickRef.current;
    const isSecondClickSameOpponent = previousClick
      && previousClick.id === opponent.id
      && now - previousClick.timestamp <= 380;

    if (isSecondClickSameOpponent) {
      lastOpponentClickRef.current = null;
      onStartLocalGame(opponent.difficulty, opponent.id);
      return;
    }

    lastOpponentClickRef.current = {
      id: opponent.id,
      timestamp: now,
    };
  };

  return (
    <div className="pazaak-world-page">
      <nav className="pazaak-world-nav">
        <div className="pazaak-world-brand">
          <span aria-hidden="true">{menuIcon("rocket")}</span>
          {MAIN_MENU_PRESET.brandTitle}
        </div>
        <div className="pazaak-world-nav__right" style={{ display: "flex", gap: 8 }}>
          {isPazaakUnlocked && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onOpenTournaments}
            >
              <span aria-hidden="true">◈</span> Tournaments
            </button>
          )}
          {traskAvailable && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onOpenTrask}
            >
              <span aria-hidden="true">◉</span> Ask Trask
            </button>
          )}
        </div>
      </nav>

      <main className="pazaak-world-main">
        <section className="pazaak-world-hero">
          <h1><span aria-hidden="true">{menuIcon("rocket")}</span>{MAIN_MENU_PRESET.heroTitle}</h1>
          <p>{MAIN_MENU_PRESET.heroSubtitle}</p>
          <p>{MAIN_MENU_PRESET.heroTagline}</p>
        </section>

        <section className="pazaak-world-card pazaak-world-card--ai" aria-live="polite">
          <h2><span aria-hidden="true">{menuIcon("scroll")}</span>CardWorld Access</h2>
          {isPazaakUnlocked ? (
            <p>Pazaak unlocked{ownershipProof ? ` via ${ownershipProof.filename}` : ""}. You can queue, join lobbies, and challenge AI opponents.</p>
          ) : (
            <p>Upload chitin.key to unlock Pazaak. Until then, local blackjack is available as the default card mode.</p>
          )}
          <div className="pazaak-world-card__actions">
            {!isPazaakUnlocked ? (
              <label className="pazaak-world-button pazaak-world-button--outline" style={{ cursor: "pointer" }}>
                <span aria-hidden="true">{menuIcon("plus")}</span>
                Upload Ownership Proof
                <input
                  type="file"
                  accept={acceptedOwnershipProofFilenames.join(",")}
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }

                    try {
                      onUploadOwnershipProof(file);
                      setUploadMessage(`Accepted ${file.name}. Pazaak unlocked.`);
                    } catch (error) {
                      setUploadMessage(error instanceof Error ? error.message : String(error));
                    } finally {
                      event.currentTarget.value = "";
                    }
                  }}
                />
              </label>
            ) : null}
            <button className="pazaak-world-button pazaak-world-button--galaxy" onClick={onStartBlackjackGame}>
              <span aria-hidden="true">{menuIcon("target")}</span>
              Play Blackjack Practice
            </button>
            {uploadMessage ? <p className="pazaak-world-card__notice">{uploadMessage}</p> : null}
          </div>
        </section>

        <section className="pazaak-world-mode-grid">
          {aiCard ? (
            <article className="pazaak-world-card pazaak-world-card--ai">
              <h2><span aria-hidden="true">{menuIcon(aiCard.icon)}</span>{aiCard.title}</h2>
              <p>{aiCard.description}</p>
              <div className="pazaak-world-card__actions">
                {(aiCard.aiOptions ?? []).map((option: MainMenuAiOptionPreset) => (
                  <button
                    key={option.difficulty}
                    className={`pazaak-world-button pazaak-world-button--${option.tone}`}
                    onClick={() => onStartLocalGame(option.difficulty, getDefaultLocalOpponentForDifficulty(option.difficulty).id)}
                  >
                    <span aria-hidden="true">{menuIcon(option.icon)}</span>
                    {option.label}
                    <span>{option.tierLabel}</span>
                  </button>
                ))}
                <div className="pazaak-world-selectors">
                  <select value={localDifficulty} onChange={(event) => handleLocalDifficultyChange(event.target.value as AdvisorDifficulty)} aria-label="Local AI difficulty">
                    <option value="easy">Easy</option>
                    <option value="hard">Hard</option>
                    <option value="professional">Professional</option>
                  </select>
                  <select value={selectedLocalOpponentId} onChange={(event) => handleLocalOpponentChange(event.target.value)} aria-label="Local AI opponent">
                    {opponentsByVendorDifficulty.map((group) => (
                      <optgroup key={group.tier} label={formatVendorDifficultyLabel(group.tier)}>
                        {group.opponents.map((opponent) => (
                          <option key={opponent.id} value={opponent.id}>{`${opponent.name} · ${formatDifficultyLabel(opponent.difficulty)}`}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selectedOpponent ? <small>{selectedOpponent.description}</small> : null}
                  <button className="pazaak-world-button pazaak-world-button--outline" onClick={() => onStartLocalGame(localDifficulty, selectedLocalOpponentId)}>
                    <span aria-hidden="true">{menuIcon("target")}</span>
                    Challenge Selected
                  </button>
                </div>
              </div>
            </article>
          ) : null}

          {quickMatchCard ? (
            <article className={`pazaak-world-card pazaak-world-card--online ${isOnline ? "" : "pazaak-world-card--disabled"}`}>
              <h2>
                <span aria-hidden="true">{menuIcon(quickMatchCard.icon)}</span>
                {quickMatchCard.title}
                {!isOnline ? <small>Offline</small> : null}
              </h2>
              <p>{quickMatchCard.description}</p>
              <div className="pazaak-world-card__actions">
                <button className="pazaak-world-button pazaak-world-button--galaxy" onClick={() => onQuickMatch(quickQueuePlayers)} disabled={!isOnline || !isPazaakUnlocked}>
                  <span aria-hidden="true">{menuIcon(quickMatchCard.primaryAction?.icon ?? "search")}</span>
                  {quickMatchCard.primaryAction?.label ?? "Find Match"}
                </button>
                {!isOnline ? <p className="pazaak-world-card__notice">{quickMatchCard.offlineNotice}</p> : null}
                {isOnline && !isPazaakUnlocked ? <p className="pazaak-world-card__notice">Pazaak queue unlock requires chitin.key.</p> : null}
              </div>
            </article>
          ) : null}

          {lobbyCard ? (
            <article className={`pazaak-world-card pazaak-world-card--lobby ${isOnline ? "" : "pazaak-world-card--disabled"}`}>
              <h2>
                <span aria-hidden="true">{menuIcon(lobbyCard.icon)}</span>
                {lobbyCard.title}
                {!isOnline ? <small>Offline</small> : null}
              </h2>
              <p>{lobbyCard.description}</p>
              <div className="pazaak-world-card__actions">
                <button className="pazaak-world-button pazaak-world-button--hyperspace" onClick={onOpenLobbies} disabled={!isOnline || !isPazaakUnlocked}>
                  <span aria-hidden="true">{menuIcon(lobbyCard.primaryAction?.icon ?? "plus")}</span>
                  {lobbyCard.primaryAction?.label ?? "Create Lobby"}
                </button>
                <button className="pazaak-world-button pazaak-world-button--outline" onClick={onOpenLobbies} disabled={!isOnline || !isPazaakUnlocked}>
                  <span aria-hidden="true">{menuIcon(lobbyCard.secondaryAction?.icon ?? "signin")}</span>
                  {lobbyCard.secondaryAction?.label ?? "Join Lobby"}
                </button>
                {!isOnline ? <p className="pazaak-world-card__notice">{lobbyCard.offlineNotice}</p> : null}
                {isOnline && !isPazaakUnlocked ? <p className="pazaak-world-card__notice">Lobby access unlock requires chitin.key.</p> : null}
              </div>
            </article>
          ) : null}
        </section>

        <section className="pazaak-world-opponents" aria-labelledby="pazaak-opponent-catalogue-title">
          <div className="pazaak-world-opponents__header">
            <div>
              <h2 id="pazaak-opponent-catalogue-title"><span aria-hidden="true">{menuIcon("user")}</span>Opponent Catalogue</h2>
              <p>{availableOpponents.length} merged profiles from HoloPazaak, PazaakWorld, and Activity practice.</p>
              <p className="pazaak-world-opponents__hint">Double-click any opponent card to challenge instantly.</p>
            </div>
            <button className="pazaak-world-button pazaak-world-button--galaxy" onClick={() => onStartLocalGame(selectedOpponent.difficulty, selectedOpponent.id)}>
              <span aria-hidden="true">{menuIcon("target")}</span>
              Challenge {selectedOpponent.name}
            </button>
          </div>

          <div className="pazaak-world-opponents__layout">
            <div className="pazaak-world-opponent-list" aria-label="Opponent roster">
              {opponentsByVendorDifficulty.map((group) => (
                <section className="pazaak-world-opponent-tier" key={group.tier} aria-label={`${formatVendorDifficultyLabel(group.tier)} opponents`}>
                  <h3>{formatVendorDifficultyLabel(group.tier)}</h3>
                  <div className="pazaak-world-opponent-tier__grid">
                    {group.opponents.map((opponent) => (
                      <button
                        key={opponent.id}
                        className={`pazaak-world-opponent-chip ${opponent.id === selectedOpponent.id ? "pazaak-world-opponent-chip--active" : ""}`}
                        onClick={() => handleLocalOpponentClick(opponent)}
                        aria-pressed={opponent.id === selectedOpponent.id}
                        title="Double-click to challenge instantly"
                      >
                        <span>{opponent.name}</span>
                        <small>{opponent.archetype}</small>
                        {(() => {
                          const rec = localPracticeStats[opponent.id];
                          return rec && rec.played > 0
                            ? <small className="pazaak-world-opponent-chip__record">{rec.won}W-{rec.lost}L</small>
                            : null;
                        })()}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <article className="pazaak-world-opponent-profile">
              <div className="pazaak-world-opponent-profile__title">
                <div>
                  <p>{formatVendorDifficultyLabel(selectedOpponent.vendorDifficulty)} · {formatDifficultyLabel(selectedOpponent.difficulty)}</p>
                  <h3>{selectedOpponent.name}</h3>
                </div>
                <strong>{selectedOpponent.skillLevel}</strong>
              </div>
              <p>{selectedOpponent.description}</p>
              <div className="pazaak-world-opponent-profile__facts">
                <span>{selectedOpponent.species}</span>
                <span>{selectedOpponent.origin}</span>
                <span>{selectedOpponent.archetype}</span>
                <span>Stand {selectedOpponent.standAt}</span>
                <span>Tie {selectedOpponent.tieChance}%</span>
              </div>
              <div className="pazaak-world-opponent-profile__deck" aria-label="Opponent side deck">
                {selectedOpponent.sideDeckTokens.map((token: string, index: number) => <span key={`${selectedOpponent.id}-${token}-${index}`}>{token}</span>)}
              </div>
              <div className="pazaak-world-opponent-profile__quote">
                <span aria-hidden="true">{menuIcon("scroll")}</span>
                <p>{selectedOpponent.phrases.chosen[0] ?? selectedOpponent.description}</p>
              </div>
              <div className="pazaak-world-opponent-profile__sources">
                {selectedOpponent.sources.map((source: string) => <span key={source}>{source}</span>)}
                {(() => {
                  const rec = localPracticeStats[selectedOpponent.id];
                  if (!rec || rec.played === 0) return null;
                  const pct = Math.round((rec.won / rec.played) * 100);
                  return (
                    <div className="pazaak-world-opponent-profile__record">
                      <span>Your record vs {selectedOpponent.name}</span>
                      <strong>{rec.won}W – {rec.lost}L ({pct}% win rate)</strong>
                    </div>
                  );
                })()}
              </div>
            </article>
          </div>
        </section>

        <section className="pazaak-world-rules">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}><span aria-hidden="true">{menuIcon("scroll")}</span>{MAIN_MENU_PRESET.rulesTitle}</h2>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowRulebook((prev) => !prev)}
              aria-expanded={showRulebook}
            >
              {showRulebook ? "Hide full rulebook" : "Open full rulebook"}
            </button>
          </div>
          <div className="pazaak-world-rules__grid">
            {MAIN_MENU_PRESET.rules.map((rule: MainMenuRulePreset) => (
              <article key={rule.title}>
                <div className={`pazaak-world-rule-icon pazaak-world-rule-icon--${rule.accent}`} aria-hidden="true">{menuIcon(rule.icon)}</div>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </article>
            ))}
          </div>
          {showRulebook && (
            <div style={{ marginTop: 16 }}>
              <HowToPlayPanel onClose={() => setShowRulebook(false)} />
            </div>
          )}
        </section>
      </main>

      <div className="pazaak-world-floating-status">
        <ConnectionStatus isOnline={isOnline} socketState={socketState} />
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
        const { queue, match } = await enqueueMatchmaking(accessToken, preferredMaxPlayers);
        if (!active) return;
        if (match) {
          onEnterMatch(match);
          return;
        }
        setJoined(true);
        setQueueLabel(queue ? `Queued for up to ${queue.preferredMaxPlayers} players` : `Queued for up to ${preferredMaxPlayers} players`);
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
  }, [accessToken, preferredMaxPlayers, onEnterMatch]);

  useEffect(() => {
    if (!joined) return;
    let active = true;

    const poll = async () => {
      try {
        const match = await fetchMyMatch(accessToken);
        if (!active) return;
        if (match) {
          await leaveMatchmaking(accessToken);
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
        <div className="matchmaking-card__stages">
          <div className="matchmaking-card__stage matchmaking-card__stage--done">
            <span className="matchmaking-card__stage-name">Scanning hyperspace routes</span>
            <span className="matchmaking-card__stage-status">Complete ✓</span>
            <div className="matchmaking-card__stage-bar"><div className="matchmaking-card__stage-fill" style={{ width: "100%" }} /></div>
          </div>
          <div className="matchmaking-card__stage matchmaking-card__stage--active">
            <span className="matchmaking-card__stage-name">Matching skill levels</span>
            <span className="matchmaking-card__stage-status">In Progress…</span>
            <div className="matchmaking-card__stage-bar"><div className="matchmaking-card__stage-fill matchmaking-card__stage-fill--pulse" /></div>
          </div>
          <div className="matchmaking-card__stage matchmaking-card__stage--pending">
            <span className="matchmaking-card__stage-name">Establishing connection</span>
            <span className="matchmaking-card__stage-status">Pending</span>
            <div className="matchmaking-card__stage-bar"><div className="matchmaking-card__stage-fill" style={{ width: "0%" }} /></div>
          </div>
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

type PasswordStrengthTone = "idle" | "weak" | "fair" | "strong" | "very-strong";

interface PasswordStrengthState {
  score: number;
  label: string;
  hint: string;
  tone: PasswordStrengthTone;
}

const getPasswordStrengthState = (value: string): PasswordStrengthState => {
  if (value.length === 0) {
    return {
      score: 0,
      label: "Add a password",
      hint: "Use 10 or more characters. Longer passphrases are stronger.",
      tone: "idle",
    };
  }

  if (value.length < 10) {
    return {
      score: 1,
      label: "Weak",
      hint: "Use at least 10 characters.",
      tone: "weak",
    };
  }

  const characterGroups = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^\p{L}\d\s]/u, /\s/u].reduce(
    (count, pattern) => count + (pattern.test(value) ? 1 : 0),
    0,
  );

  let score = 1;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;
  if (characterGroups >= 2) score += 1;
  if (characterGroups >= 4) score += 1;

  if (score <= 2) {
    return {
      score,
      label: "Weak",
      hint: "Add length or mix in more character variety.",
      tone: "weak",
    };
  }

  if (score === 3) {
    return {
      score,
      label: "Fair",
      hint: "Decent start. A longer passphrase would be stronger.",
      tone: "fair",
    };
  }

  if (score === 4) {
    return {
      score,
      label: "Strong",
      hint: "Good. More length makes it harder to guess.",
      tone: "strong",
    };
  }

  return {
    score: 5,
    label: "Very strong",
    hint: "Excellent length and variety.",
    tone: "very-strong",
  };
};

function AuthDialog({
  isOpen,
  initialMessage,
  onClose,
  onAuthenticated,
}: {
  isOpen: boolean;
  initialMessage?: string;
  onClose: () => void;
  onAuthenticated: (session: ActivitySession) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">(() => {
    try {
      const saved = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY);
      if (saved === "login" || saved === "register") {
        return saved;
      }
    } catch {
      // Ignore storage read failures.
    }
    return "login";
  });
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialMessage ?? null);
  const [providers, setProviders] = useState<SocialAuthProviderConfig[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const authDialogRef = useRef<HTMLDivElement | null>(null);
  const loginTabRef = useRef<HTMLButtonElement | null>(null);
  const registerTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write failures.
    }
  }, [mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = authDialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !active || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const dialog = authDialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, busy, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setShowPassword(false);
  }, [mode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let active = true;
    setProvidersLoading(true);
    const load = async () => {
      try {
        const result = await fetchSocialAuthProviders();
        if (!active) return;
        setProviders(result.providers);
      } catch {
        if (!active) return;
        setProviders([
          { provider: "google", enabled: false },
          { provider: "discord", enabled: false },
          { provider: "github", enabled: false },
        ]);
      } finally {
        if (!active) return;
        setProvidersLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [isOpen]);

  const providerEnabled = (provider: SocialAuthProvider): boolean => {
    const config = providers.find((entry) => entry.provider === provider);
    return config?.enabled ?? false;
  };

  const signInWithProvider = async (provider: SocialAuthProvider) => {
    setBusy(true);
    setError(null);
    try {
      const matchId = new URLSearchParams(window.location.search).get("matchId")?.trim() || undefined;
      const result = await startSocialAuth(provider, matchId);
      window.location.assign(result.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const providerButtonMeta: Array<{
    provider: SocialAuthProvider;
    buttonClass: string;
    label: string;
  }> = [
      {
        provider: "google",
        buttonClass: "pazaak-world-social-btn--google",
        label: "Sign in with Google",
      },
      {
        provider: "discord",
        buttonClass: "pazaak-world-social-btn--discord",
        label: "Sign in with Discord",
      },
      {
        provider: "github",
        buttonClass: "pazaak-world-social-btn--github",
        label: "Sign in with GitHub",
      },
    ];
  const credentialsTabPanelId = "pazaak-auth-credentials-panel";
  const loginTabId = "pazaak-auth-tab-login";
  const registerTabId = "pazaak-auth-tab-register";
  const passwordStrength = useMemo(() => getPasswordStrengthState(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const registerValidationHint = username.trim().length < 3
    ? "Username must be at least 3 characters."
    : password.length < 10
      ? "Password must be at least 10 characters."
      : confirmPassword.length === 0
        ? "Confirm your password to continue."
        : !passwordsMatch
          ? "Passwords do not match yet."
          : passwordStrength.score <= 2
            ? "Password is valid but still weak. Consider a longer passphrase."
            : "Create your account when ready.";
  const canSubmit = mode === "login"
    ? identifier.trim().length > 0 && password.length > 0
    : username.trim().length >= 3 && password.length >= 10 && passwordsMatch;
  const validationHint = mode === "login"
    ? "Enter your username/email and password to continue."
    : registerValidationHint;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

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
      onClose();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const guestId = getOrCreateLocalGuestId();
      await onAuthenticated({
        userId: guestId,
        username: "Guest Pilot",
        accessToken: `local-guest-token:${guestId}`,
      });
      onClose();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleAuthSubmitShortcut = (event: KeyboardEvent) => {
      if (busy || !canSubmit) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    };

    window.addEventListener("keydown", handleAuthSubmitShortcut);
    return () => {
      window.removeEventListener("keydown", handleAuthSubmitShortcut);
    };
  }, [busy, canSubmit, isOpen]);

  const handleAuthBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) {
      return;
    }
    onClose();
  };

  const moveAuthMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setError(null);
    requestAnimationFrame(() => {
      if (nextMode === "login") {
        loginTabRef.current?.focus();
        return;
      }
      registerTabRef.current?.focus();
    });
  };

  const handleAuthModeTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (busy) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveAuthMode("login");
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveAuthMode("register");
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      moveAuthMode("login");
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      moveAuthMode("register");
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="pazaak-world-auth-backdrop" onMouseDown={handleAuthBackdropMouseDown}>
      <div ref={authDialogRef} className="pazaak-world-auth-card" role="dialog" aria-modal="true" aria-labelledby="pazaak-auth-title" aria-describedby="pazaak-auth-subtitle" tabIndex={-1}>
        <div className="pazaak-world-auth-card__header">
          <div>
            <p>Account</p>
            <h2 id="pazaak-auth-title">Sign in to PazaakWorld</h2>
            <p id="pazaak-auth-subtitle" className="pazaak-world-auth-subtitle">Choose a provider, or sign in with your PazaakWorld account.</p>
          </div>
          <button className="pazaak-world-icon-btn pazaak-world-auth-card__close" onClick={onClose} disabled={busy} aria-label="Close account dialog">×</button>
        </div>

        <div className="pazaak-world-social-grid" aria-busy={providersLoading}>
              {providerButtonMeta.map((providerMeta) => {
                const enabled = providerEnabled(providerMeta.provider);
                return (
                  <button
                    key={providerMeta.provider}
                    className={`pazaak-world-social-btn ${providerMeta.buttonClass}`}
                    onClick={() => signInWithProvider(providerMeta.provider)}
                    disabled={busy || providersLoading || !enabled}
                    aria-label={providerMeta.label}
                  >
                    <span className="pazaak-world-social-btn__icon" aria-hidden="true"><ProviderMark provider={providerMeta.provider} /></span>
                    <span className="pazaak-world-social-btn__content">
                      <span className="pazaak-world-social-btn__row">
                        <span className="pazaak-world-social-btn__label">{providerMeta.label}</span>
                        {!providersLoading && !enabled ? <span className="pazaak-world-social-btn__pill">Unavailable</span> : null}
                      </span>
                      <span className="pazaak-world-social-btn__status">
                        {providersLoading ? "Checking availability..." : enabled ? "Secure OAuth redirect" : "Not enabled in this environment"}
                      </span>
                    </span>
                  </button>
                );
              })}
        </div>
        {providersLoading ? (
          <p className="sr-only" role="status" aria-live="polite">Checking provider availability.</p>
        ) : null}

        <div className="pazaak-world-auth-divider" role="separator" aria-label="Or continue with credentials">
          <span>Or use your email</span>
        </div>

        <div className="auth-credential-panel">
              <div className="auth-switch" role="tablist" aria-label="Choose account action" aria-orientation="horizontal">
                <button ref={loginTabRef} type="button" id={loginTabId} role="tab" tabIndex={mode === "login" ? 0 : -1} aria-selected={mode === "login"} aria-controls={credentialsTabPanelId} className={`btn btn--sm auth-switch__btn ${mode === "login" ? "btn--primary auth-switch__btn--active" : "btn--ghost"}`} onClick={() => setMode("login")} onKeyDown={handleAuthModeTabKeyDown} disabled={busy}>Sign In</button>
                <button ref={registerTabRef} type="button" id={registerTabId} role="tab" tabIndex={mode === "register" ? 0 : -1} aria-selected={mode === "register"} aria-controls={credentialsTabPanelId} className={`btn btn--sm auth-switch__btn ${mode === "register" ? "btn--primary auth-switch__btn--active" : "btn--ghost"}`} onClick={() => setMode("register")} onKeyDown={handleAuthModeTabKeyDown} disabled={busy}>Create Account</button>
              </div>
              <form id={credentialsTabPanelId} role="tabpanel" aria-labelledby={mode === "login" ? loginTabId : registerTabId} className="auth-form auth-form--modal" aria-describedby="pazaak-auth-footnote" onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}>
                <div className="auth-form__section-title">{mode === "login" ? "Use your PazaakWorld account" : "Create your PazaakWorld account"}</div>
                {mode === "login" ? (
                  <>
                    <label className="auth-field">
                      <span className="auth-field__label">Username or email</span>
                      <input value={identifier} onChange={(event) => {
                        setIdentifier(event.target.value);
                        if (error) setError(null);
                      }} placeholder="Enter your username or email" aria-label="Username or email" autoComplete="username" autoFocus required disabled={busy} />
                    </label>
                    <label className="auth-field">
                      <span className="auth-field__label">Password</span>
                      <span className="auth-input-wrap">
                        <input value={password} onChange={(event) => {
                          setPassword(event.target.value);
                          if (error) setError(null);
                        }} type={showPassword ? "text" : "password"} placeholder="Enter your password" aria-label="Password" autoComplete="current-password" required disabled={busy} />
                        <button type="button" className="auth-input-wrap__toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={busy}>
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="auth-field">
                      <span className="auth-field__label">Username</span>
                      <input value={username} onChange={(event) => {
                        setUsername(event.target.value);
                        if (error) setError(null);
                      }} placeholder="Choose a username" aria-label="Username" autoComplete="username" autoFocus required disabled={busy} />
                    </label>
                    <label className="auth-field">
                      <span className="auth-field__label">Display name</span>
                      <input value={displayName} onChange={(event) => {
                        setDisplayName(event.target.value);
                        if (error) setError(null);
                      }} placeholder="Optional display name" aria-label="Display name" autoComplete="nickname" disabled={busy} />
                    </label>
                    <label className="auth-field">
                      <span className="auth-field__label">Email</span>
                      <input value={email} onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) setError(null);
                      }} placeholder="Optional email address" aria-label="Email" autoComplete="email" type="email" disabled={busy} />
                    </label>
                    <label className="auth-field">
                      <span className="auth-field__label">Password</span>
                      <span className="auth-input-wrap">
                        <input value={password} onChange={(event) => {
                          setPassword(event.target.value);
                          if (error) setError(null);
                        }} type={showPassword ? "text" : "password"} placeholder="Create a password (10+ chars)" aria-label="Password" autoComplete="new-password" required minLength={10} disabled={busy} />
                        <button type="button" className="auth-input-wrap__toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={busy}>
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </span>
                      <span className="auth-password-strength" aria-live="polite">
                        <span className="auth-password-strength__label-row">
                          <span className="auth-password-strength__label">Password strength</span>
                          <span className={`auth-password-strength__value auth-password-strength__value--${passwordStrength.tone}`}>{passwordStrength.label}</span>
                        </span>
                        <span className="auth-password-strength__track" aria-hidden="true">
                          <span
                            className={`auth-password-strength__fill auth-password-strength__fill--${passwordStrength.tone}`}
                            style={{ width: `${Math.max(passwordStrength.score, 0) * 20}%` }}
                          />
                        </span>
                        <span className="auth-password-strength__hint">{passwordStrength.hint}</span>
                      </span>
                    </label>
                    <label className="auth-field">
                      <span className="auth-field__label">Confirm password</span>
                      <span className="auth-input-wrap">
                        <input value={confirmPassword} onChange={(event) => {
                          setConfirmPassword(event.target.value);
                          if (error) setError(null);
                        }} type={showPassword ? "text" : "password"} placeholder="Re-enter your password" aria-label="Confirm password" autoComplete="new-password" required minLength={10} disabled={busy} />
                        <button type="button" className="auth-input-wrap__toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide passwords" : "Show passwords"} aria-pressed={showPassword} disabled={busy}>
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </span>
                      {confirmPassword.length > 0 ? (
                        <span className={`auth-field__hint ${passwordsMatch ? "auth-field__hint--success" : "auth-field__hint--error"}`} role="status" aria-live="polite">
                          {passwordsMatch ? "Passwords match." : "Passwords must match exactly."}
                        </span>
                      ) : null}
                    </label>
                  </>
                )}
                <div className="pazaak-world-auth-footnote" id="pazaak-auth-footnote">
                  {providersLoading
                    ? "Checking provider configuration for this environment..."
                    : "Social sign-in appears here when provider credentials are configured for this environment."}
                </div>
                {!canSubmit ? <p className="auth-validation-hint" role="status" aria-live="polite">{validationHint}</p> : null}
                {error ? <p className="error-message" role="alert" aria-live="assertive">{error}</p> : null}
                <button type="submit" className="btn btn--primary auth-form__submit" disabled={busy || !canSubmit}>
                  {busy ? "Working..." : mode === "login" ? "Sign In" : "Create Account"}
                </button>
                <button type="button" className="btn btn--ghost auth-form__submit" onClick={() => { void continueAsGuest(); }} disabled={busy}>
                  Continue as Guest (Offline Practice)
                </button>
              </form>
        </div>
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
  onStartLocalGame: (difficulty: AdvisorDifficulty, opponentId?: string) => void;
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
  const [newLobbySideboardMode, setNewLobbySideboardMode] = useState<PazaakLobbySideboardMode>("runtime_random");
  const [newLobbyGameMode, setNewLobbyGameMode] = useState<PazaakGameMode>("canonical");
  const [preferredQueuePlayers, setPreferredQueuePlayers] = useState(2);
  const [publicOpsConfig, setPublicOpsConfig] = useState<PublicPazaakConfig | null>(null);
  const [queueRegions, setQueueRegions] = useState<string[]>(["auto"]);
  const [localAiDifficulty, setLocalAiDifficulty] = useState<AdvisorDifficulty>("professional");
  const [localOpponentId, setLocalOpponentId] = useState<string>(() => getDefaultLocalOpponentForDifficulty("professional").id);
  const [joinLobbyCodeValue, setJoinLobbyCodeValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinPasswordLobbyId, setJoinPasswordLobbyId] = useState<string | null>(null);
  const [joinPasswordValue, setJoinPasswordValue] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<PazaakUserSettings>(DEFAULT_USER_SETTINGS);
  const hydratedSettingsRef = useRef(false);

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

  useEffect(() => {
    void fetchPublicPazaakConfig().then((cfg) => {
      setPublicOpsConfig(cfg);
    }).catch(() => {
      setPublicOpsConfig(null);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToLobbies(() => {
      void refreshLobby().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, { reconnect: true });

    return unsubscribe;
  }, [refreshLobby]);

  useEffect(() => {
    if (!wallet) {
      return;
    }

    setSettingsDraft(wallet.userSettings);

    if (!hydratedSettingsRef.current) {
      setNewLobbyTurnTimer(wallet.userSettings.turnTimerSeconds);
      setLocalAiDifficulty(wallet.userSettings.preferredAiDifficulty);
      hydratedSettingsRef.current = true;
    }
  }, [wallet]);

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
    const effectiveGameMode: PazaakGameMode = newLobbyRanked ? "canonical" : newLobbyGameMode;
    await createLobby(accessToken, {
      name: newLobbyName,
      maxPlayers,
      ...(newLobbyPassword ? { password: newLobbyPassword } : {}),
      variant: newLobbyVariant,
      maxRounds: newLobbyMaxRounds,
      turnTimerSeconds: newLobbyTurnTimer,
      ranked: newLobbyRanked,
      allowAiFill: newLobbyAllowAiFill,
      sideboardMode: newLobbySideboardMode,
      gameMode: effectiveGameMode,
      tableSettings: {
        variant: newLobbyVariant,
        maxPlayers,
        maxRounds: newLobbyMaxRounds,
        turnTimerSeconds: newLobbyTurnTimer,
        ranked: newLobbyRanked,
        allowAiFill: newLobbyAllowAiFill,
        sideboardMode: newLobbySideboardMode,
        gameMode: effectiveGameMode,
      },
    });
  });

  const handleStartSolo = () => runLobbyAction("solo", async () => {
    const lobby = await createLobby(accessToken, {
      name: `${username} vs AI`,
      maxPlayers: 2,
      variant: "canonical",
      turnTimerSeconds: settingsDraft.turnTimerSeconds,
      tableSettings: {
        variant: "canonical",
        maxPlayers: 2,
        maxRounds: 3,
        turnTimerSeconds: settingsDraft.turnTimerSeconds,
        ranked: true,
        allowAiFill: true,
        sideboardMode: "runtime_random",
      },
    });
    await addLobbyAi(accessToken, lobby.id, settingsDraft.preferredAiDifficulty);
    const started = await startLobby(accessToken, lobby.id);
    onEnterMatch(started.match);
  });

  const ownLobby = lobbies.find((lobby) => lobby.players.some((player) => player.userId === userId));
  const canUseLobbyControls = busy === null;
  const availableLocalOpponents = localOpponents;
  const selectedLocalOpponent = availableLocalOpponents.find((opponent) => opponent.id === localOpponentId)
    ?? getDefaultLocalOpponentForDifficulty(localAiDifficulty);

  useEffect(() => {
    if (!availableLocalOpponents.some((opponent) => opponent.id === localOpponentId)) {
      setLocalOpponentId(getDefaultLocalOpponentForDifficulty(localAiDifficulty).id);
    }
  }, [availableLocalOpponents, localAiDifficulty, localOpponentId]);

  const handleLocalOpponentChange = (opponentId: string) => {
    const opponent = localOpponents.find((entry) => entry.id === opponentId);
    setLocalOpponentId(opponentId);
    if (opponent) {
      setLocalAiDifficulty(opponent.difficulty);
    }
  };

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Never";
  const settingsDirty = wallet ? !areUserSettingsEqual(settingsDraft, wallet.userSettings) : false;

  return (
    <div className="screen screen--lobby">
      <div className="lobby-shell">
        <section className="lobby-panel lobby-panel--profile">
          <div>
            <p className="lobby-kicker">Pazaak Table</p>
            <h1 className="lobby-title">{username}</h1>
            <p className="lobby-sub">
              {wallet
                ? `${wallet.balance} credits · ${formatWalletRatingLine(wallet.mmr, wallet.mmrRd)} · ${wallet.gamesWon}/${wallet.gamesPlayed} games`
                : "Loading account"}
            </p>
          </div>
          {error ? <div className="lobby-alert lobby-alert--error">{error}</div> : null}
          <div className="lobby-stat-grid">
            <div><span>Streak</span><strong>{wallet?.streak ?? 0}</strong></div>
            <div><span>Best</span><strong>{wallet?.bestStreak ?? 0}</strong></div>
            <div><span>Last Match</span><strong>{formatDate(wallet?.lastMatchAt ?? null)}</strong></div>
          </div>
          <div className="lobby-settings-card">
            <div className="lobby-settings-card__header">
              <div>
                <p className="lobby-kicker">Preferences</p>
                <h2>Match QoL</h2>
              </div>
              {settingsDirty ? <span className="lobby-settings-card__status">Unsaved</span> : <span className="lobby-settings-card__status lobby-settings-card__status--saved">Saved</span>}
            </div>
            <div className="lobby-settings-grid">
              <label>
                <span>Turn timer default</span>
                <select
                  value={String(settingsDraft.turnTimerSeconds)}
                  onChange={(event) => {
                    const turnTimerSeconds = Number(event.target.value) || 45;
                    setSettingsDraft((previous) => ({ ...previous, turnTimerSeconds }));
                    setNewLobbyTurnTimer(turnTimerSeconds);
                  }}
                  disabled={!canUseLobbyControls}
                >
                  {[0, 30, 45, 60, 90, 120, 180].map((value) => <option key={value} value={value}>{value === 0 ? "No timer" : `${value}s`}</option>)}
                </select>
              </label>
              <label>
                <span>Preferred AI difficulty</span>
                <select
                  value={settingsDraft.preferredAiDifficulty}
                  onChange={(event) => {
                    const preferredAiDifficulty = event.target.value as AdvisorDifficulty;
                    setSettingsDraft((previous) => ({ ...previous, preferredAiDifficulty }));
                    setLocalAiDifficulty(preferredAiDifficulty);
                  }}
                  disabled={!canUseLobbyControls}
                >
                  <option value="easy">Easy</option>
                  <option value="hard">Hard</option>
                  <option value="professional">Professional</option>
                </select>
              </label>
              <label className="lobby-settings-toggle">
                <input
                  type="checkbox"
                  checked={settingsDraft.soundEnabled}
                  onChange={(event) => setSettingsDraft((previous) => ({ ...previous, soundEnabled: event.target.checked }))}
                  disabled={!canUseLobbyControls}
                />
                <span>Enable turn beeps in live matches</span>
              </label>
              <label className="lobby-settings-toggle">
                <input
                  type="checkbox"
                  checked={settingsDraft.reducedMotionEnabled}
                  onChange={(event) => setSettingsDraft((previous) => ({ ...previous, reducedMotionEnabled: event.target.checked }))}
                  disabled={!canUseLobbyControls}
                />
                <span>Reduce motion effects</span>
              </label>
            </div>
            <div className="lobby-settings-actions">
              <button
                className="btn btn--secondary btn--sm"
                onClick={() => setSettingsDraft(wallet?.userSettings ?? DEFAULT_USER_SETTINGS)}
                disabled={!wallet || !settingsDirty || !canUseLobbyControls}
              >
                Reset
              </button>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => runLobbyAction("save-settings", async () => {
                  await updateSettings(accessToken, settingsDraft);
                })}
                disabled={!wallet || !settingsDirty || !canUseLobbyControls}
              >
                Save Preferences
              </button>
            </div>
          </div>
          {publicOpsConfig ? (
            <div className="lobby-ops-strip" aria-label="Live ops defaults from server">
              <div className="lobby-ops-strip__block">
                <p className="lobby-ops-strip__label">Matchmaking region</p>
                <div className="lobby-ops-strip__row" role="group">
                  {publicOpsConfig.matchmaking.regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      className={`btn btn--sm ${queueRegions[0] === region.id ? "btn--primary" : "btn--ghost"}`}
                      onClick={() => setQueueRegions([region.id])}
                      disabled={!canUseLobbyControls}
                    >
                      {region.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lobby-ops-strip__block">
                <p className="lobby-ops-strip__label">Clock presets</p>
                <div className="lobby-ops-strip__row" role="group">
                  {publicOpsConfig.timeControls.presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`btn btn--sm ${settingsDraft.turnTimerSeconds === preset.turnSeconds ? "btn--primary" : "btn--ghost"}`}
                      onClick={() => {
                        const turnTimerSeconds = preset.turnSeconds;
                        setSettingsDraft((previous) => ({ ...previous, turnTimerSeconds }));
                        setNewLobbyTurnTimer(turnTimerSeconds);
                      }}
                      disabled={!canUseLobbyControls}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
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
              <select value={localOpponentId} onChange={(event) => handleLocalOpponentChange(event.target.value)} aria-label="Local opponent">
                {availableLocalOpponents.map((opponent) => (
                  <option key={opponent.id} value={opponent.id}>{`${opponent.name} · ${formatDifficultyLabel(opponent.difficulty)}`}</option>
                ))}
              </select>
              <button className="btn btn--secondary" onClick={() => onStartLocalGame(localAiDifficulty, localOpponentId)}>
                Start Local Practice
              </button>
            </div>
            {selectedLocalOpponent ? <p className="mode-card__hint">{selectedLocalOpponent.description}</p> : null}
            {queue ? (
              <button className="btn btn--secondary" onClick={() => runLobbyAction("leave-queue", async () => { await leaveMatchmaking(accessToken); })} disabled={!canUseLobbyControls}>
                Leave Queue
              </button>
            ) : (
              <button className="btn btn--secondary" onClick={() => runLobbyAction("queue", async () => { await enqueueMatchmaking(accessToken, preferredQueuePlayers, queueRegions); })} disabled={!canUseLobbyControls}>
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
                aria-label="Sets to win"
              >
                {[1, 3, 5, 7, 9].map((value) => <option key={value} value={value}>{value} sets to win</option>)}
              </select>
              <select
                value={String(newLobbyTurnTimer)}
                onChange={(event) => setNewLobbyTurnTimer(Number(event.target.value) || 120)}
                aria-label="Turn timer"
              >
                {[0, 30, 45, 60, 90, 120, 180].map((value) => <option key={value} value={value}>{value === 0 ? "No timer" : `${value}s`}</option>)}
              </select>
              <label className="lobby-toggle">
                <input type="checkbox" checked={newLobbyRanked} onChange={(event) => setNewLobbyRanked(event.target.checked)} disabled={newLobbyVariant === "canonical"} />
                Ranked
              </label>
              <label className="lobby-toggle">
                <input type="checkbox" checked={newLobbyAllowAiFill} onChange={(event) => setNewLobbyAllowAiFill(event.target.checked)} />
                AI Fill
              </label>
              <select
                value={newLobbySideboardMode}
                onChange={(event) => {
                  const nextMode = event.target.value === "player_active_custom"
                    ? "player_active_custom"
                    : event.target.value === "host_mirror_custom"
                      ? "host_mirror_custom"
                      : "runtime_random";
                  setNewLobbySideboardMode(nextMode);
                }}
                aria-label="Sideboard mode"
              >
                <option value="runtime_random">Sideboards: Runtime random</option>
                <option value="player_active_custom">Sideboards: Each player active custom</option>
                <option value="host_mirror_custom">Sideboards: Host mirrored custom</option>
              </select>
              <select
                value={newLobbyRanked ? "canonical" : newLobbyGameMode}
                onChange={(event) => setNewLobbyGameMode(event.target.value === "wacky" ? "wacky" : "canonical")}
                aria-label="Game mode"
                disabled={newLobbyRanked}
                title={newLobbyRanked ? "Ranked lobbies must use canonical rules." : "Choose canonical TSL or the experimental Wacky card set."}
              >
                <option value="canonical">Mode: Canonical TSL</option>
                <option value="wacky">Mode: Wacky (%N, /2, 00)</option>
              </select>
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
                && readyCount >= 2
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
                      {" · "}{lobby.tableSettings.ranked ? "Ranked" : "Casual"}
                      {" · "}{(lobby.tableSettings.gameMode ?? "canonical") === "wacky" ? "Wacky mode" : "Canonical TSL"}
                      {" · "}{lobby.tableSettings.allowAiFill ? "AI fill on" : "AI fill off"}
                      {" · "}{lobby.tableSettings.sideboardMode === "player_active_custom"
                        ? "Active custom sideboards"
                        : lobby.tableSettings.sideboardMode === "host_mirror_custom"
                          ? "Host mirrored custom"
                          : "Runtime random sideboards"}
                    </span>
                    <div className="lobby-seat-grid">
                      {seatSlots.map((seat, index) => {
                        if (!seat) {
                          return (
                            <div className="lobby-seat lobby-seat--empty" key={`${lobby.id}-seat-${index}`}>
                              <span><span className="seat-icon" aria-hidden="true">○</span> Seat {index + 1}</span>
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
                            <span>
                              <span className="seat-icon" aria-hidden="true">
                                {seat.userId === lobby.hostUserId ? "👑" : seat.isAi ? "🤖" : "👤"}
                              </span>
                              {" "}Seat {index + 1}
                            </span>
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
                        {isHost ? <button className="btn btn--card" onClick={() => runLobbyAction(`ai-${lobby.id}`, async () => { await addLobbyAi(accessToken, lobby.id, settingsDraft.preferredAiDifficulty); })} disabled={!canUseLobbyControls || !canAddAi}>Add AI</button> : null}
                        {isHost ? <button className="btn btn--primary btn--sm" onClick={() => runLobbyAction(`start-${lobby.id}`, async () => { const result = await startLobby(accessToken, lobby.id); onEnterMatch(result.match); })} disabled={!canUseLobbyControls || !canStart}>Start</button> : null}
                        <button className="btn btn--ghost btn--sm" onClick={() => runLobbyAction(`leave-${lobby.id}`, async () => { await leaveLobby(accessToken, lobby.id); })} disabled={!canUseLobbyControls}>Leave</button>
                      </>
                    ) : (
                      joinPasswordLobbyId === lobby.id ? (
                        <span className="lobby-join-pw-form">
                          <input
                            type="password"
                            className="lobby-join-pw-input"
                            placeholder="Enter password…"
                            value={joinPasswordValue}
                            onChange={(e) => setJoinPasswordValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void runLobbyAction(`join-${lobby.id}`, async () => {
                                  await joinLobby(accessToken, lobby.id, joinPasswordValue || undefined);
                                  setJoinPasswordLobbyId(null);
                                  setJoinPasswordValue("");
                                });
                              }
                            }}
                            autoFocus
                          />
                          <button className="btn btn--primary btn--sm" onClick={() => runLobbyAction(`join-${lobby.id}`, async () => {
                            await joinLobby(accessToken, lobby.id, joinPasswordValue || undefined);
                            setJoinPasswordLobbyId(null);
                            setJoinPasswordValue("");
                          })} disabled={!canUseLobbyControls}>Join</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => { setJoinPasswordLobbyId(null); setJoinPasswordValue(""); }}>Cancel</button>
                        </span>
                      ) : (
                        <button
                          className="btn btn--card"
                          disabled={!canUseLobbyControls || ownLobby !== undefined || lobby.players.length >= lobby.maxPlayers}
                          onClick={() => {
                            if (lobby.passwordHash) {
                              setJoinPasswordLobbyId(lobby.id);
                              setJoinPasswordValue("");
                            } else {
                              void runLobbyAction(`join-${lobby.id}`, async () => {
                                await joinLobby(accessToken, lobby.id, undefined);
                              });
                            }
                          }}
                        >Join</button>
                      )
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


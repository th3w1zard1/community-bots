import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatchmakingStatsResponse, MeResponse, SocialAuthProviderConfig } from "../api.ts";
import type { LeaderboardEntry, PazaakLobbyRecord, PazaakMatchHistoryRecord, PazaakOpponentProfileRecord } from "../types.ts";

type DashboardBotId = "pazaak" | "trask" | "hk" | "ingest";
type DashboardAccent = "gold" | "blue" | "green" | "violet";
type DashboardMethod = "GET" | "POST" | "PUT" | "DELETE" | "WS" | "CMD" | "CLI";
type DashboardRestMethod = "GET" | "POST" | "PUT" | "DELETE";
type DashboardView = "overview" | "api" | "setup" | "maintenance";
type DashboardHealth = "checking" | "online" | "offline";
type ProbeStatus = "idle" | "checking" | "ok" | "error";
type OnboardingTrack = "play" | "local" | "publish";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface DashboardBotSummary {
  id: DashboardBotId;
  name: string;
  role: string;
  status: string;
  route: string;
  apiCount: number;
  commandCount: number;
  metric: string;
  accent: DashboardAccent;
}

interface DashboardEndpoint {
  method: DashboardMethod;
  path: string;
  scope: string;
  auth: string;
  availability: string;
  description: string;
  request: string;
  response: string;
  operations: string;
}

interface DashboardEndpointGroup {
  botId: DashboardBotId;
  title: string;
  summary: string;
  endpoints: DashboardEndpoint[];
}

interface DashboardProbeTarget {
  id: string;
  label: string;
  method: DashboardRestMethod;
  path: string;
  description: string;
  requiresAuth: boolean;
  sampleBody?: string;
}

interface DashboardProbeResult {
  status: ProbeStatus;
  detail: string;
  payload?: string;
  statusCode?: number;
  latencyMs?: number;
}

interface DashboardCommand {
  label: string;
  command: string;
  detail: string;
}

interface DashboardRunbook {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  commands: DashboardCommand[];
  checks: string[];
}

interface DashboardSolution {
  title: string;
  fit: string;
  tradeoff: string;
  action: string;
}

interface DashboardChecklistItem {
  id: string;
  label: string;
  detail: string;
}

interface DashboardPrefs {
  apiBase: string;
  fallbackBases: string;
  compactEndpoints: boolean;
  highContrast: boolean;
  showAdvanced: boolean;
}

interface DashboardHttpResult {
  ok: boolean;
  status: number;
  statusText: string;
  latencyMs: number;
  url: string;
  text: string;
  body: JsonValue | null;
}

interface DashboardLiveData {
  opponents: PazaakOpponentProfileRecord[];
  me: MeResponse | null;
  stats: MatchmakingStatsResponse | null;
  lobbies: PazaakLobbyRecord[];
  leaderboard: LeaderboardEntry[];
  history: PazaakMatchHistoryRecord[];
  signedError: string | null;
  lastRefreshedAt: string | null;
}

interface DashboardSurfaceCard {
  title: string;
  eyebrow: string;
  description: string;
  value: string;
  href?: string;
  copyValue?: string;
}

interface DashboardOnboardingGuide {
  id: OnboardingTrack;
  label: string;
  title: string;
  summary: string;
  steps: string[];
  commands: DashboardCommand[];
}

interface TraskQuestionOfTheDay {
  id: string;
  title: string;
  summary: string;
  author: string;
  tags: string[];
  channel: string;
  sourceNames: string[];
  askedAt: string;
  baseVotes: number;
  trend: "rising" | "steady" | "new";
}

interface TraskObservedGuild {
  id: string;
  name: string;
  installState: string;
  memberCount: number;
  activePresenceCount: number;
  channelCount: number;
  scopeBadges: string[];
  notes: string[];
}

interface TraskTopicSignal {
  id: string;
  label: string;
  description: string;
  confusionPattern: string;
  examplePrompt: string;
  weight: number;
  trend: string;
}

interface TraskUsagePoint {
  label: string;
  asks: number;
  answered: number;
  scopeRequests: number;
}

const DASHBOARD_PREFS_KEY = "openkotor-bots-dashboard-prefs-v1";
const DASHBOARD_CHECKLIST_KEY = "openkotor-bots-dashboard-checklist-v1";
const STANDALONE_AUTH_TOKEN_KEY = "pazaak-world-standalone-auth-token-v1";
const TRASK_VOTER_HANDLE_KEY = "openkotor-trask-voter-handle-v1";
const TRASK_VOTES_KEY = "openkotor-trask-votes-v1";
/** Operator console (API probes, runbooks). Public Discord invite hub lives at `/bots`. */
const OPERATOR_CONSOLE_ROUTE = "/community-bots";
const PAZAAK_WORLD_PUBLIC_ROUTE = "/bots/pazaakworld";
/** Same-origin path to the static Discord bots landing (`App` switches on `/bots`). */
const discordBotsHubPath = import.meta.env.BASE.replace(/\/$/, "") || "/bots";
const PAZAAK_WORLD_PUBLIC_URL = "https://openkotor.github.io/bots/pazaakworld";
const QA_TRASK_WEBUI_PUBLIC_ROUTE = "/bots/qa-webui/";
const QA_TRASK_WEBUI_PUBLIC_URL = "https://openkotor.github.io/bots/qa-webui/";
const TRASK_DISCORD_APP_ID = String(import.meta.env.VITE_TRASK_DISCORD_APP_ID ?? "1305793207036022784").trim();
const TRASK_INSTALL_PERMISSIONS = "84992";

const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
  apiBase: "",
  fallbackBases: "",
  compactEndpoints: false,
  highContrast: false,
  showAdvanced: false,
};

const DASHBOARD_VIEWS: { id: DashboardView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "api", label: "API Console" },
  { id: "setup", label: "Setup" },
  { id: "maintenance", label: "Maintenance" },
];

const DASHBOARD_BOTS: DashboardBotSummary[] = [
  {
    id: "pazaak",
    name: "Pazaak Bot",
    role: "Authoritative game API, queues, lobbies, sideboards, wallets, and Activity routes",
    status: "Embedded API + Activity",
    route: PAZAAK_WORLD_PUBLIC_ROUTE,
    apiCount: 38,
    commandCount: 18,
    metric: "4001 default API port",
    accent: "gold",
  },
  {
    id: "trask",
    name: "Trask",
    role: "Approved-source KOTOR Q&A, source policy, and ingest queue handoff",
    status: "Discord commands",
    route: "/ask",
    apiCount: 3,
    commandCount: 3,
    metric: "Queue-backed reindex",
    accent: "blue",
  },
  {
    id: "hk",
    name: "HK Bot",
    role: "Curated self-role designations, onboarding, and guild role sync",
    status: "Guild interaction API",
    route: "/designations",
    apiCount: 5,
    commandCount: 5,
    metric: "Role hierarchy guarded",
    accent: "green",
  },
  {
    id: "ingest",
    name: "Ingest Worker",
    role: "Source refresh queue, retrieval index maintenance, and diagnostics",
    status: "Operator CLI API",
    route: "corepack pnpm dev:ingest -- <command>",
    apiCount: 7,
    commandCount: 7,
    metric: "Atomic file queue",
    accent: "violet",
  },
];

const DASHBOARD_ENDPOINT_GROUPS: DashboardEndpointGroup[] = [
  {
    botId: "pazaak",
    title: "Runtime Health & Public Metadata",
    summary: "Safe probes for availability, menu payloads, and public opponent data.",
    endpoints: [
      { method: "GET", path: "/api/health", scope: "Runtime", auth: "None", availability: "Embedded API", description: "Returns embedded server health, service identity, and clock metadata.", request: "No body.", response: "JSON status payload with server time.", operations: "Use first when diagnosing Activity connection or CORS failures." },
      { method: "GET", path: "/api/ping", scope: "Runtime", auth: "None", availability: "Embedded API, Worker", description: "Minimal availability probe for static previews and worker checks.", request: "No body.", response: "Small JSON or text ping response.", operations: "Useful for uptime checks because it avoids account state." },
      { method: "GET", path: "/api/ui/main-menu", scope: "Frontend", auth: "None", availability: "Embedded API", description: "Main-menu preset consumed by PazaakWorld.", request: "No body.", response: "PazaakWorld menu copy, mode cards, actions, and rules.", operations: "If this fails, the app falls back to bundled menu data." },
      { method: "GET", path: "/api/pazaak/opponents", scope: "Game", auth: "None", availability: "Embedded API, Worker", description: "Local practice opponent catalog and server timestamp.", request: "No body.", response: "Opponent profile list and server time.", operations: "Good public probe for frontend/API compatibility." },
    ],
  },
  {
    botId: "pazaak",
    title: "Auth, Session & Account",
    summary: "Standalone credentials, social OAuth, account profiles, settings, history, and leaderboard data.",
    endpoints: [
      { method: "POST", path: "/api/auth/register", scope: "Account", auth: "None", availability: "Embedded API, Worker", description: "Create a standalone PazaakWorld account.", request: "{ username, displayName?, email?, password }", response: "Bearer app token, safe account, session, linked identities.", operations: "Passwords stay server-side; this page never persists bearer tokens." },
      { method: "POST", path: "/api/auth/login", scope: "Account", auth: "None", availability: "Embedded API, Worker", description: "Exchange username/email plus password for an app bearer token.", request: "{ identifier, password }", response: "Bearer app token and session summary.", operations: "Use the returned token only in local operator probes or the app session." },
      { method: "GET", path: "/api/auth/oauth/providers", scope: "OAuth", auth: "None", availability: "Embedded API, Worker", description: "Lists Google, Discord, and GitHub OAuth provider enablement.", request: "No body.", response: "Provider names with enabled flags.", operations: "After .env edits, restart the API process before checking this." },
      { method: "POST", path: "/api/auth/oauth/:provider/start", scope: "OAuth", auth: "Optional", availability: "Embedded API", description: "Starts Google, Discord, or GitHub OAuth using the public Pages callback URL.", request: "Provider in the path. Optional existing bearer token links identity.", response: "Provider redirect URL.", operations: "Provider callbacks default to /bots/pazaakworld unless explicitly configured otherwise." },
      { method: "GET", path: "/api/auth/oauth/:provider/callback", scope: "OAuth", auth: "Provider", availability: "Embedded API", description: "Provider callback that lands back on PazaakWorld with an app token.", request: "Provider query parameters.", response: "Redirect to the frontend OAuth landing flow.", operations: "Register this URL in each provider console exactly as deployed." },
      { method: "GET", path: "/api/auth/session", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Inspect the current app session and linked identities.", request: "Authorization bearer token.", response: "Safe account and linked identity summary.", operations: "Useful to confirm cross-platform identity mapping." },
      { method: "POST", path: "/api/auth/logout", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Revokes the current app session.", request: "Authorization bearer token.", response: "{ ok: true }.", operations: "The browser should also clear its stored app token." },
      { method: "GET", path: "/api/me", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Wallet, profile, queue, and active-match summary for the caller.", request: "Authorization bearer token.", response: "User profile, wallet, queue record, and active match if present.", operations: "This is the best all-in-one signed-in health check." },
      { method: "GET", path: "/api/settings", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Reads persisted PazaakWorld preferences.", request: "Authorization bearer token.", response: "Theme, audio, motion, timer, and AI defaults.", operations: "Settings are also cached locally by the frontend." },
      { method: "PUT", path: "/api/settings", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Persists theme, sound, reduced motion, timer, and AI preferences.", request: "Partial PazaakUserSettings JSON.", response: "Updated settings payload.", operations: "Send only changed fields from operator probes." },
      { method: "GET", path: "/api/leaderboard", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Returns ranked wallet/MMR leaders.", request: "Authorization bearer token.", response: "Leaderboard rows.", operations: "Contains public display names and game stats only." },
      { method: "GET", path: "/api/me/history?limit=25", scope: "Account", auth: "Bearer", availability: "Embedded API, Worker", description: "Returns recent caller match history.", request: "Optional limit query parameter.", response: "Match history records.", operations: "Use small limits for diagnostics." },
    ],
  },
  {
    botId: "pazaak",
    title: "Matchmaking, Lobbies & Sideboards",
    summary: "Queue, lobby, table configuration, ready-state, AI seat, and saved sideboard routes.",
    endpoints: [
      { method: "POST", path: "/api/matchmaking/enqueue", scope: "Queue", auth: "Bearer", availability: "Embedded API, Worker", description: "Enter matchmaking with a preferred table size.", request: "{ preferredMaxPlayers: 2..5 }", response: "Current queue record.", operations: "Identity must be the linked account game id, not raw Discord id." },
      { method: "POST", path: "/api/matchmaking/leave", scope: "Queue", auth: "Bearer", availability: "Embedded API, Worker", description: "Remove the caller from the queue.", request: "Authorization bearer token.", response: "{ removed: boolean }.", operations: "Use on disconnect or when switching into private lobbies." },
      { method: "GET", path: "/api/matchmaking/status", scope: "Queue", auth: "Bearer", availability: "Embedded API, Worker", description: "Reads the caller's current queue entry.", request: "Authorization bearer token.", response: "Queue record or null.", operations: "Pairs with stats for queue debugging." },
      { method: "GET", path: "/api/matchmaking/stats", scope: "Queue", auth: "Bearer", availability: "Embedded API, Worker", description: "Queue population, open lobbies, active games, and wait-time summary.", request: "Authorization bearer token.", response: "playersInQueue, openLobbies, activeGames, averageWaitTime.", operations: "Safe non-sensitive metric for the dashboard when signed in." },
      { method: "GET", path: "/api/lobbies", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "List visible waiting lobbies.", request: "Authorization bearer token.", response: "Lobby records with table settings and player summaries.", operations: "Passwords are never returned." },
      { method: "POST", path: "/api/lobbies", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "Create a private table with variant, timer, AI-fill, and sideboard policy.", request: "{ name?, maxPlayers?, password?, tableSettings? }", response: "Created lobby record.", operations: "Use sideboardMode guardrails for custom-board tables." },
      { method: "POST", path: "/api/lobbies/join-by-code", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "Join a lobby using its short lobby code.", request: "{ lobbyCode, password? }", response: "Updated lobby record.", operations: "Best route for invite-code UX." },
      { method: "POST", path: "/api/lobbies/:lobbyId/join", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "Join a lobby by internal id.", request: "{ password? }", response: "Updated lobby record.", operations: "Use when the UI already has a lobby id." },
      { method: "POST", path: "/api/lobbies/:lobbyId/ready", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "Toggle caller ready state.", request: "{ ready: boolean }", response: "Updated lobby record.", operations: "The host starts only when readiness and sideboard policy pass." },
      { method: "POST", path: "/api/lobbies/:lobbyId/status", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "Switch waiting lobby into or out of matchmaking mode.", request: "{ status: 'waiting' | 'matchmaking' }", response: "Updated lobby record.", operations: "Use for host-controlled queueing." },
      { method: "POST", path: "/api/lobbies/:lobbyId/leave", scope: "Lobby", auth: "Bearer", availability: "Embedded API, Worker", description: "Leave the table and close/reassign if needed.", request: "Authorization bearer token.", response: "Updated lobby or null when closed.", operations: "Call during page unload when possible." },
      { method: "POST", path: "/api/lobbies/:lobbyId/addAi", scope: "Lobby", auth: "Bearer", availability: "Embedded API", description: "Adds an AI seat to a lobby.", request: "{ difficulty: 'easy' | 'hard' | 'professional' }", response: "Updated lobby record.", operations: "Embedded authoritative server only." },
      { method: "POST", path: "/api/lobbies/:lobbyId/ai/:aiUserId/difficulty", scope: "Lobby", auth: "Bearer", availability: "Embedded API", description: "Changes AI seat difficulty.", request: "{ difficulty }", response: "Updated lobby record.", operations: "Use before match start." },
      { method: "POST", path: "/api/lobbies/:lobbyId/start", scope: "Lobby", auth: "Bearer", availability: "Embedded API", description: "Starts a lobby match once table rules are satisfied.", request: "Authorization bearer token.", response: "Lobby plus live match snapshot.", operations: "Worker fallback intentionally does not run authoritative match simulation." },
      { method: "GET", path: "/api/sideboards", scope: "Sideboard", auth: "Bearer", availability: "Embedded API", description: "Load named saved custom sideboards.", request: "Authorization bearer token.", response: "Saved sideboard collection.", operations: "Backed by PAZAAK_DATA_DIR/custom-sideboards.json." },
      { method: "PUT", path: "/api/sideboards/:name", scope: "Sideboard", auth: "Bearer", availability: "Embedded API", description: "Save or update a named ten-card custom board.", request: "{ tokens: string[10], makeActive?: boolean }", response: "Updated sideboard collection.", operations: "Server enforces token normalization and duplicate limits." },
      { method: "POST", path: "/api/sideboards/active", scope: "Sideboard", auth: "Bearer", availability: "Embedded API", description: "Sets the active saved sideboard.", request: "{ name }", response: "Updated sideboard collection.", operations: "Affects future challenges and rematches, not already-seeded matches." },
      { method: "DELETE", path: "/api/sideboards/:name", scope: "Sideboard", auth: "Bearer", availability: "Embedded API", description: "Deletes a named saved sideboard.", request: "Name path parameter.", response: "Updated sideboard collection.", operations: "At least one remaining board is made active automatically." },
    ],
  },
  {
    botId: "pazaak",
    title: "Live Match & Realtime",
    summary: "Authoritative match actions, chat, and WebSocket streams served by the embedded bot process.",
    endpoints: [
      { method: "GET", path: "/api/match/me", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Resume the caller's active match.", request: "Authorization bearer token.", response: "Serialized match snapshot.", operations: "Returns a no-active-match error when idle." },
      { method: "GET", path: "/api/match/:matchId", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Fetch a match by id.", request: "Match id path parameter.", response: "Serialized match snapshot.", operations: "Use for reconnects or spectator links." },
      { method: "POST", path: "/api/match/:matchId/draw", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Draw the mandatory turn card.", request: "No body.", response: "Updated match snapshot.", operations: "Coordinator remains the single source of truth." },
      { method: "POST", path: "/api/match/:matchId/play", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Play a side card with optional selected value.", request: "{ cardId, selectedValue? }", response: "Updated match snapshot.", operations: "Server validates side-card ownership and timing." },
      { method: "POST", path: "/api/match/:matchId/stand", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Stand on the current total.", request: "No body.", response: "Updated match snapshot.", operations: "Cannot stand before the mandatory draw." },
      { method: "POST", path: "/api/match/:matchId/end-turn", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "End the current turn without standing.", request: "No body.", response: "Updated match snapshot.", operations: "Applies bust/recovery windows in coordinator." },
      { method: "POST", path: "/api/match/:matchId/forfeit", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Forfeit the caller's live match.", request: "No body.", response: "Updated or completed match state.", operations: "Use for explicit leave flows." },
      { method: "POST", path: "/api/match/:matchId/rematch", scope: "Match", auth: "Bearer", availability: "Embedded API", description: "Request a rematch from a completed match.", request: "No body.", response: "Pending challenge or match state.", operations: "Deck seeds are reconstructed from the completed match snapshot." },
      { method: "POST", path: "/api/match/:matchId/chat", scope: "Realtime", auth: "Bearer", availability: "Embedded API", description: "Post match chat to REST and WebSocket subscribers.", request: "{ text }", response: "Chat message payload.", operations: "Keep moderation expectations in Discord channel context." },
      { method: "WS", path: "/ws?stream=match&matchId=:matchId", scope: "Realtime", auth: "Bearer", availability: "Embedded API", description: "Live match snapshots and chat updates.", request: "WebSocket connection with stream and matchId query.", response: "match_update and chat payloads.", operations: "Use same API origin as HTTP; static Pages cannot host this directly." },
      { method: "WS", path: "/ws?stream=lobbies", scope: "Realtime", auth: "Bearer", availability: "Embedded API", description: "Lobby list updates.", request: "WebSocket connection with stream=lobbies.", response: "Lobby update payloads.", operations: "Reconnect on close and re-fetch lobbies." },
    ],
  },
  {
    botId: "trask",
    title: "Trask Slash Commands",
    summary: "Discord-native interaction surface for approved-source answers and source refresh requests.",
    endpoints: [
      { method: "CMD", path: "/ask query:<topic>", scope: "Answer", auth: "Discord", availability: "Trask bot", description: "Answer a KOTOR question with approved sources and visible citations.", request: "Slash command query string.", response: "Discord reply with answer and sources.", operations: "Keep approved-source policy tight; this is not open web chat." },
      { method: "CMD", path: "/sources kind:<website|github|discord>", scope: "Policy", auth: "Discord", availability: "Trask bot", description: "Inspect approved source policy by kind.", request: "Optional source kind.", response: "Configured approved sources.", operations: "Useful before queueing reindex jobs." },
      { method: "CMD", path: "/queue-reindex source:<id>", scope: "Admin", auth: "Manage Guild", availability: "Trask bot + ingest worker", description: "Queue one source or all sources for ingest-worker refresh.", request: "Source id or all.", response: "Queued job status.", operations: "Jobs persist to INGEST_STATE_DIR/reindex-queue.json." },
    ],
  },
  {
    botId: "hk",
    title: "HK Designation Commands",
    summary: "Role designation controls are Discord-native and intentionally narrow.",
    endpoints: [
      { method: "CMD", path: "/designations panel", scope: "Roles", auth: "Guild member", availability: "HK bot", description: "Open the private multi-select role sync panel.", request: "Slash command.", response: "Ephemeral role selector.", operations: "Bot role must stay above managed roles." },
      { method: "CMD", path: "/designations onboarding ephemeral:<bool>", scope: "Roles", auth: "Guild member", availability: "HK bot", description: "Show the guided designation onboarding surface.", request: "Optional ephemeral flag.", response: "Onboarding panel.", operations: "Use ephemeral mode for testing." },
      { method: "CMD", path: "/designations list", scope: "Catalog", auth: "Guild member", availability: "HK bot", description: "List projects, community, event, and sector designations.", request: "Slash command.", response: "Designation catalog.", operations: "Catalog should mirror the approved role map." },
      { method: "CMD", path: "/designations assign designation:<role>", scope: "Roles", auth: "Guild member", availability: "HK bot", description: "Assign one approved designation.", request: "Designation option.", response: "Role sync result.", operations: "Hierarchy and allowlist checks protect unmanaged roles." },
      { method: "CMD", path: "/designations remove designation:<role>", scope: "Roles", auth: "Guild member", availability: "HK bot", description: "Remove one approved designation.", request: "Designation option.", response: "Role sync result.", operations: "Use panel for bulk changes." },
    ],
  },
  {
    botId: "ingest",
    title: "Ingest Worker CLI",
    summary: "Queue-backed source refresh, immediate reindex, and diagnostics for retrieval data.",
    endpoints: [
      { method: "CLI", path: "list-sources", scope: "Catalog", auth: "Operator", availability: "Local CLI", description: "Show configured sources, kind, and freshness policy.", request: "No args.", response: "Source table.", operations: "Run before queueing broad refreshes." },
      { method: "CLI", path: "queue-reindex [sourceIds...]", scope: "Queue", auth: "Operator", availability: "Local CLI", description: "Append source refresh jobs to the shared queue.", request: "Optional source ids.", response: "Queued source ids.", operations: "Queue writes are lock-file guarded and atomic." },
      { method: "CLI", path: "reindex-now [sourceIds...]", scope: "Index", auth: "Operator", availability: "Local CLI", description: "Fetch and index selected sources immediately.", request: "Optional source ids.", response: "Refresh results.", operations: "Use for one-off maintenance windows." },
      { method: "CLI", path: "drain-queue", scope: "Queue", auth: "Operator", availability: "Local CLI", description: "Process currently queued refresh jobs once.", request: "No args.", response: "Processed/requeued job summary.", operations: "Good for cron-style runs." },
      { method: "CLI", path: "run-queue-worker [pollMs]", scope: "Queue", auth: "Operator", availability: "Local CLI", description: "Continuously drain queued source refresh jobs.", request: "Optional poll interval.", response: "Long-running worker logs.", operations: "Default polling is 15 seconds." },
      { method: "CLI", path: "show-indexed", scope: "Diagnostics", auth: "Operator", availability: "Local CLI", description: "Display indexed source counts and timestamps.", request: "No args.", response: "Indexed source summary.", operations: "Use after Trask answer regressions." },
      { method: "CLI", path: "show-config", scope: "Diagnostics", auth: "Operator", availability: "Local CLI", description: "Print non-secret bootstrap flags and model names.", request: "No args.", response: "Redacted config summary.", operations: "Never paste secrets into public issue threads." },
    ],
  },
];

const DASHBOARD_METRICS = [
  { label: "Repository", value: "OpenKotOR/bots", detail: "Renamed GitHub project" },
  { label: "Pages base", value: "/bots/", detail: "GitHub Pages mount (hub + nested routes)" },
  { label: "Pazaak route", value: "/bots/pazaakworld", detail: "Dedicated game route" },
  { label: "API port", value: "4001", detail: "Embedded matchmaking server" },
  { label: "Worker mode", value: "Fallback", detail: "Auth, queues, lobbies" },
  { label: "Export sample", value: "12,828", detail: "Public guild messages" },
];

const DASHBOARD_PROBE_TARGETS: DashboardProbeTarget[] = [
  { id: "ping", label: "Ping", method: "GET", path: "/api/ping", description: "Smallest public availability probe.", requiresAuth: false },
  { id: "health", label: "Health", method: "GET", path: "/api/health", description: "Embedded API identity and health check.", requiresAuth: false },
  { id: "providers", label: "OAuth Providers", method: "GET", path: "/api/auth/oauth/providers", description: "Provider enablement without exposing secrets.", requiresAuth: false },
  { id: "opponents", label: "Opponents", method: "GET", path: "/api/pazaak/opponents", description: "Public practice opponent payload.", requiresAuth: false },
  { id: "me", label: "Current User", method: "GET", path: "/api/me", description: "Signed-in profile, wallet, queue, and match summary.", requiresAuth: true },
  { id: "queue-stats", label: "Queue Stats", method: "GET", path: "/api/matchmaking/stats", description: "Queue, lobby, and active-game metrics.", requiresAuth: true },
  { id: "enqueue", label: "Enqueue", method: "POST", path: "/api/matchmaking/enqueue", description: "Enter matchmaking with a preferred table size.", requiresAuth: true, sampleBody: "{\n  \"preferredMaxPlayers\": 2\n}" },
  { id: "create-lobby", label: "Create Lobby", method: "POST", path: "/api/lobbies", description: "Create a private table with practical defaults.", requiresAuth: true, sampleBody: "{\n  \"name\": \"Operator test table\",\n  \"maxPlayers\": 2,\n  \"tableSettings\": {\n    \"variant\": \"canonical\",\n    \"maxPlayers\": 2,\n    \"maxRounds\": 3,\n    \"turnTimerSeconds\": 45,\n    \"ranked\": false,\n    \"allowAiFill\": true,\n    \"sideboardMode\": \"runtime_random\"\n  }\n}" },
];

const DASHBOARD_RUNBOOKS: DashboardRunbook[] = [
  {
    id: "local-matchmaking",
    title: "Local Matchmaking Server",
    summary: "Run the authoritative bot API and the web UI together for real queue, lobby, sideboard, and match flows.",
    steps: [
      "Install workspace dependencies with pnpm through Corepack.",
      "Copy .env.example to .env and fill Discord app id, bot token, guild id, and client secret.",
      "Keep PAZAAK_ACTIVITY_URL and PAZAAK_PUBLIC_WEB_ORIGIN pointed at https://openkotor.github.io/bots/pazaakworld for production-style callbacks.",
      "Start the Pazaak bot process first; it owns the embedded HTTP and WebSocket server on port 4001.",
      "Start the Vite frontend and open /community-bots for this operator console, /bots for the Discord invite hub, or /bots/pazaakworld for the game.",
    ],
    commands: [
      { label: "Install", command: "corepack pnpm install --frozen-lockfile", detail: "Use after clone or lockfile changes." },
      { label: "API server", command: "corepack pnpm dev:pazaak", detail: "Starts Discord bot plus embedded API on PAZAAK_API_PORT." },
      { label: "Frontend", command: "corepack pnpm dev:pazaak-world", detail: "Starts Vite on localhost:5173." },
      { label: "OAuth check", command: "corepack pnpm check:pazaak-oauth", detail: "Reports missing provider vars and live provider status." },
    ],
    checks: [
      "GET /api/health returns online from the selected API target.",
      "GET /api/auth/oauth/providers shows each intended provider as enabled.",
      "Discord Developer Portal URL mappings include the public PazaakWorld URL.",
      "CORS allows localhost/127.0.0.1 on 3000, 4173, and 5173 for previews.",
    ],
  },
  {
    id: "pages-oauth",
    title: "Pages, Routes & OAuth",
    summary: "Deploy the static app at /bots while keeping PazaakWorld at /bots/pazaakworld and callbacks aligned.",
    steps: [
      "Use the Deploy PazaakWorld workflow; it pins Vite BASE to /bots/ and creates a 404.html SPA fallback.",
      "Register https://openkotor.github.io/bots/pazaakworld as the public Activity/browser route.",
      "Register provider callbacks at https://openkotor.github.io/bots/pazaakworld/api/auth/oauth/<provider>/callback unless a deployed API origin requires a provider-specific callback.",
      "Set the repository homepage to https://openkotor.github.io/bots/pazaakworld; /bots is the public Discord hub and /community-bots keeps this operator console.",
    ],
    commands: [
      { label: "Frontend build", command: "corepack pnpm --filter pazaak-world build", detail: "Builds the Pages artifact." },
      { label: "Repo homepage", command: "gh repo edit OpenKotOR/bots --homepage https://openkotor.github.io/bots/pazaakworld", detail: "Keeps GitHub metadata aligned." },
      { label: "Repo verify", command: "gh repo view OpenKotOR/bots --json nameWithOwner,url,homepageUrl", detail: "Confirms rename and homepage." },
    ],
    checks: [
      "/community-bots shows this operator console; /bots is the public Discord bots landing.",
      "/bots/pazaakworld shows PazaakWorld, including direct reloads through 404.html.",
      "OAuth callback URLs do not point at localhost in production env files.",
      "Repository variable PAZAAK_API_BASES contains deployed API origins when using remote APIs.",
    ],
  },
  {
    id: "worker-fallback",
    title: "Cloudflare Worker Fallback",
    summary: "Use a free Worker + Durable Object API when the embedded bot API is not publicly reachable.",
    steps: [
      "Create Cloudflare API token and account id repository secrets for the worker deployment workflow.",
      "Deploy infra/pazaak-matchmaking-worker with wrangler; it implements auth, sessions, settings, queues, lobbies, history, leaderboard, and opponents.",
      "Set PAZAAK_API_BASES to the worker URL, optionally followed by secondary API origins.",
      "Keep authoritative match actions on the embedded bot API; the Worker intentionally returns explicit errors for live match simulation.",
    ],
    commands: [
      { label: "Local Worker", command: "corepack pnpm dlx wrangler dev --config infra/pazaak-matchmaking-worker/wrangler.toml", detail: "Runs the fallback API locally." },
      { label: "Deploy Worker", command: "corepack pnpm dlx wrangler deploy --config infra/pazaak-matchmaking-worker/wrangler.toml", detail: "Publishes the fallback API." },
      { label: "Pages API bases", command: "gh variable set PAZAAK_API_BASES --body \"https://your-worker.workers.dev\" --repo OpenKotOR/bots", detail: "Feeds VITE_API_BASES during Pages build." },
    ],
    checks: [
      "Worker GET /api/ping responds before adding it to PAZAAK_API_BASES.",
      "Queue and lobby endpoints work with an app bearer token.",
      "Live match actions are routed to the embedded API when authoritative multiplayer is needed.",
      "Pages build logs show VITE_API_BASES populated when remote APIs are intended.",
    ],
  },
  {
    id: "maintenance",
    title: "Maintenance & Recovery",
    summary: "Keep state files healthy, preserve queues, and diagnose common bot/API failures quickly.",
    steps: [
      "Back up PAZAAK_DATA_DIR before deployments that change account, wallet, sideboard, lobby, or match history shape.",
      "Restart the Pazaak process after any OAuth, URL, token, timer, or CORS env change.",
      "Use /api/health, /api/auth/oauth/providers, and /api/me as progressively deeper probes.",
      "Drain or inspect queues before planned downtime; stale queue files are JSON and can be reviewed without secrets.",
      "Run ingest-worker drain-queue or run-queue-worker after Trask queues source refreshes.",
    ],
    commands: [
      { label: "Full TS check", command: "corepack pnpm check", detail: "Workspace TypeScript build check." },
      { label: "Pazaak build", command: "corepack pnpm --filter @openkotor/pazaak-bot build", detail: "Builds embedded API and Discord bot." },
      { label: "Drain ingest queue", command: "corepack pnpm dev:ingest -- drain-queue", detail: "Processes queued source refresh jobs once." },
      { label: "Show ingest config", command: "corepack pnpm dev:ingest -- show-config", detail: "Prints non-secret ingest configuration." },
    ],
    checks: [
      "No production callback URL is localhost unless intentionally testing locally.",
      "PAZAAK_DATA_DIR is outside deploy artifacts and excluded from git.",
      "Trask queued jobs eventually leave INGEST_STATE_DIR/reindex-queue.json.",
      "Bot roles and Discord application command scopes still match the docs after portal changes.",
    ],
  },
];

const DASHBOARD_SOLUTIONS: DashboardSolution[] = [
  { title: "Embedded Bot API", fit: "Best for full multiplayer, WebSockets, match actions, sideboards, and Discord parity.", tradeoff: "Needs a long-running Node process and Discord bot credentials.", action: "Run corepack pnpm dev:pazaak locally or host the bot/API process on a persistent server." },
  { title: "Cloudflare Worker Fallback", fit: "Best for free public auth, profile, settings, queue, and lobby availability.", tradeoff: "Does not run authoritative match simulation or WebSocket match streams.", action: "Deploy wrangler config and set PAZAAK_API_BASES to the worker URL." },
  { title: "Static Pages + Offline Practice", fit: "Best as the no-secrets baseline; PazaakWorld remains playable without any backend.", tradeoff: "No shared queue, lobby, wallet, or social OAuth state.", action: "Leave VITE_API_BASES empty and rely on local practice fallback paths." },
  { title: "Primary + Fallback API Chain", fit: "Best production posture: embedded authoritative API first, Worker second, offline last.", tradeoff: "Requires careful CORS and callback registration for every public origin.", action: "Use comma-separated VITE_API_BASES with the authoritative API before the Worker." },
];

const DASHBOARD_CHECKLIST: DashboardChecklistItem[] = [
  { id: "routes", label: "Routes verified", detail: "/bots is the Discord hub; /community-bots is this console; /bots/pazaakworld shows the game." },
  { id: "api", label: "API probe passes", detail: "The selected target responds to /api/ping or /api/health." },
  { id: "oauth", label: "OAuth callbacks aligned", detail: "Provider callbacks target the public Pages PazaakWorld URL or the intended API origin." },
  { id: "worker", label: "Fallback decided", detail: "Worker fallback is either deployed and in PAZAAK_API_BASES, or intentionally unused." },
  { id: "data", label: "State backed up", detail: "PAZAAK_DATA_DIR and INGEST_STATE_DIR are backed up before risky deploys." },
  { id: "commands", label: "Discord commands refreshed", detail: "Guild command scopes and bot role hierarchy have been checked after portal changes." },
];

const COMMON_PROBLEMS = [
  { symptom: "Dashboard shows API offline", cause: "Selected API target is wrong, the bot API is not running, or CORS blocks the browser origin.", fix: "Run corepack pnpm dev:pazaak, set the API target to http://localhost:4001 for local checks, then run Ping and Health probes." },
  { symptom: "OAuth buttons are unavailable", cause: "Provider client id/secret is missing, or the API process was not restarted after .env edits.", fix: "Run corepack pnpm check:pazaak-oauth, fill provider vars, restart the API, then probe /api/auth/oauth/providers." },
  { symptom: "Direct /bots/pazaakworld reload 404s", cause: "Static host is missing SPA fallback.", fix: "Ensure the Pages workflow copies dist/index.html to dist/404.html and deploys with BASE=/bots/." },
  { symptom: "Worker queues work but matches fail", cause: "Expected fallback limitation: the Worker does not run authoritative match actions.", fix: "Put the embedded API first in VITE_API_BASES for live multiplayer, and keep Worker as fallback for account/queue/lobby continuity." },
  { symptom: "Trask answers stale content", cause: "Queued source refresh jobs were not drained or source credentials are missing.", fix: "Run corepack pnpm dev:ingest -- drain-queue, then show-indexed to confirm refreshed source counts." },
];

const DASHBOARD_ONBOARDING_GUIDES: DashboardOnboardingGuide[] = [
  {
    id: "play",
    label: "Use What Works",
    title: "Use the working parts first",
    summary: "This console should help you reach live, already-working surfaces quickly, then show setup only when needed.",
    steps: [
      "Open PazaakWorld and sign in if you want wallet, queue, lobby, and match data to appear here automatically.",
      "If you only need a public check, run the public probes for ping, health, OAuth providers, and opponents.",
      "Use the hub cards below to jump into the game, inspect queue/lobby activity, or copy working Discord and CLI entry points for other bots.",
    ],
    commands: [
      { label: "PazaakWorld", command: "https://openkotor.github.io/bots/pazaakworld", detail: "Game route and sign-in surface." },
      { label: "Public probes", command: "Run Public Probes", detail: "Checks ping, health, providers, and opponents from this page." },
      { label: "Trask", command: "/ask query:<topic>", detail: "Working Discord slash command for research answers." },
    ],
  },
  {
    id: "local",
    label: "Run Locally",
    title: "Run the real local stack",
    summary: "Use the authoritative embedded API first when you want queues, lobbies, WebSockets, and live matches.",
    steps: [
      "Install dependencies and copy .env.example to .env.",
      "Fill Discord app id, bot token, guild id, and client secret so the API server can enable OAuth and Activity mapping.",
      "Start the Pazaak bot first, then start the Vite frontend and point this dashboard at localhost:4001.",
      "If OAuth still looks disabled, run the readiness script and restart the bot after .env edits.",
    ],
    commands: [
      { label: "Install", command: "corepack pnpm install --frozen-lockfile", detail: "Workspace bootstrap." },
      { label: "API server", command: "corepack pnpm dev:pazaak", detail: "Embedded bot + API + WebSocket server." },
      { label: "Frontend", command: "corepack pnpm dev:pazaak-world", detail: "Vite app on localhost:5173." },
      { label: "OAuth readiness", command: "corepack pnpm check:pazaak-oauth", detail: "Shows missing vars and live provider status." },
    ],
  },
  {
    id: "publish",
    label: "Publish / Extend",
    title: "Publish public Pages and optional public APIs",
    summary: "Keep static Pages, then layer in a remote API only for the capabilities you actually need.",
    steps: [
      "Deploy Pages to /bots with the workflow in this repo; it already pins the correct base path and SPA fallback.",
      "If you need public auth, queue, lobby, and profile continuity, deploy the Cloudflare Worker fallback and set PAZAAK_API_BASES.",
      "If you need live authoritative multiplayer, put a public embedded API in front of the Worker fallback and keep the Worker second in VITE_API_BASES.",
      "Verify the final public URLs and provider callback URLs after each change.",
    ],
    commands: [
      { label: "Pages deploy", command: "gh workflow run deploy-pazaakworld.yml --repo OpenKotOR/bots --ref main", detail: "Manual Pages deploy trigger." },
      { label: "Worker deploy", command: "corepack pnpm dlx wrangler deploy --config infra/pazaak-matchmaking-worker/wrangler.toml", detail: "Fallback API deploy." },
      { label: "Set API bases", command: "gh variable set PAZAAK_API_BASES --body \"https://your-worker.workers.dev\" --repo OpenKotOR/bots", detail: "Feeds VITE_API_BASES during Pages build." },
      { label: "Repo verify", command: "gh repo view OpenKotOR/bots --json nameWithOwner,url,homepageUrl", detail: "Confirm public metadata." },
    ],
  },
];

const TRASK_QUESTIONS_OF_THE_DAY: TraskQuestionOfTheDay[] = [
  {
    id: "mdlops-models",
    title: "How do I convert models with MDLOps without breaking animations?",
    summary: "This keeps surfacing because people want the shortest path from raw assets to a stable in-game result.",
    author: "Toolchain Curious",
    tags: ["tooling", "models", "assets"],
    channel: "discord-bot-testing",
    sourceNames: ["MDLOps", "PyKotor Wiki"],
    askedAt: "2026-04-25T14:12:00Z",
    baseVotes: 16,
    trend: "rising",
  },
  {
    id: "widescreen-crashes",
    title: "What is the cleanest fix path for widescreen crashes and compatibility issues?",
    summary: "High-demand support lane because it mixes platform quirks, patching, and user expectation mismatches.",
    author: "Compatibility Cadet",
    tags: ["troubleshooting", "setup", "patches"],
    channel: "discord-bot-testing",
    sourceNames: ["PCGamingWiki", "Deadly Stream"],
    askedAt: "2026-04-26T08:40:00Z",
    baseVotes: 21,
    trend: "steady",
  },
  {
    id: "nss-ncs-workflow",
    title: "What is the practical workflow for compiling scripts and checking game-specific differences?",
    summary: "These questions cluster around scripting setup, decompilation, and which docs are current enough to trust.",
    author: "Script Apprentice",
    tags: ["scripting", "tooling", "reference"],
    channel: "discord-bot-testing",
    sourceNames: ["PyKotor Wiki", "KOTOR Neocities"],
    askedAt: "2026-04-26T18:05:00Z",
    baseVotes: 13,
    trend: "new",
  },
  {
    id: "forge-play-sw",
    title: "How do the browser builds and play deployments actually work for swkotor.net tooling?",
    summary: "People want repo, build, and deployment explanations in plain language instead of action internals.",
    author: "Web Forge Watcher",
    tags: ["deployment", "web", "tooling"],
    channel: "kotor-js",
    sourceNames: ["kotor.js", "Northern Lights"],
    askedAt: "2026-04-24T22:20:00Z",
    baseVotes: 18,
    trend: "rising",
  },
  {
    id: "texture-modding",
    title: "Which resource, texture, and archive tools should a newcomer trust first?",
    summary: "A recurring ask from newcomers who are overwhelmed by overlapping tool names and outdated guides.",
    author: "New Modder",
    tags: ["onboarding", "assets", "reference"],
    channel: "discord-bot-testing",
    sourceNames: ["Deadly Stream", "PyKotor Wiki"],
    askedAt: "2026-04-23T16:55:00Z",
    baseVotes: 11,
    trend: "steady",
  },
];

const TRASK_OBSERVED_GUILDS: TraskObservedGuild[] = [
  {
    id: "739590575359262792",
    name: "OpenKotOR",
    installState: "Observed installed",
    memberCount: 366,
    activePresenceCount: 72,
    channelCount: 63,
    scopeBadges: [
      "Slash Q&A",
      "Approved sources",
      "Queue reindex admin",
      "discord-bot-testing",
      "resources reference lane",
      "84992 install permissions",
    ],
    notes: [
      "Observed via guild export manifest dated 2026-04-24.",
      "Managed bot role is present as OpenKotOR Trask.",
      "Runtime allowlist is currently open in local config; approved channel list is not set.",
    ],
  },
];

const TRASK_TOPIC_SIGNALS: TraskTopicSignal[] = [
  {
    id: "setup",
    label: "Setup & Compatibility",
    description: "Launch blockers, widescreen fixes, runtime installs, and patch order questions.",
    confusionPattern: "Users often know the symptom but not whether the fix belongs to the game, the mod, or the toolchain.",
    examplePrompt: "Why does my widescreen or patch setup still crash even after following a guide?",
    weight: 34,
    trend: "+6 this week",
  },
  {
    id: "tooling",
    label: "Tooling & Asset Pipelines",
    description: "MDLOps, PyKotor, editors, archives, textures, and model conversion flows.",
    confusionPattern: "Most confusion comes from stale tutorials and not knowing which tool is authoritative for a file type.",
    examplePrompt: "Which tool should I use first for models, textures, or ERF/RIM edits?",
    weight: 29,
    trend: "+4 this week",
  },
  {
    id: "scripting",
    label: "Scripting & Formats",
    description: "NSS/NCS compilation, GFF structures, dialog editing, and automation docs.",
    confusionPattern: "People struggle with terminology differences between game data, scripts, and editor abstractions.",
    examplePrompt: "How do I compile or inspect scripts without guessing which format I need?",
    weight: 22,
    trend: "+2 this week",
  },
  {
    id: "web-tooling",
    label: "Browser Tooling & Deploys",
    description: "Web builds, deploy pipelines, browser runtimes, and how public tooling is hosted.",
    confusionPattern: "Questions skew toward architecture and deployment visibility instead of gameplay issues.",
    examplePrompt: "How do the browser builds and deploys work, and what can I actually use today?",
    weight: 15,
    trend: "+5 this week",
  },
];

const TRASK_USAGE_SERIES: TraskUsagePoint[] = [
  { label: "Nov", asks: 24, answered: 21, scopeRequests: 2 },
  { label: "Dec", asks: 31, answered: 28, scopeRequests: 3 },
  { label: "Jan", asks: 38, answered: 35, scopeRequests: 4 },
  { label: "Feb", asks: 43, answered: 39, scopeRequests: 5 },
  { label: "Mar", asks: 47, answered: 43, scopeRequests: 6 },
  { label: "Apr", asks: 59, answered: 54, scopeRequests: 8 },
];

function loadTraskVoteState(): Record<string, string[]> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(TRASK_VOTES_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as JsonValue;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as JsonObject).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [],
      ]),
    );
  } catch {
    return {};
  }
}

function saveTraskVoteState(state: Record<string, string[]>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TRASK_VOTES_KEY, JSON.stringify(state));
}

function loadTraskVoterHandle(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(TRASK_VOTER_HANDLE_KEY)?.trim() ?? "";
}

function saveTraskVoterHandle(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TRASK_VOTER_HANDLE_KEY, value);
}

function normalizeVoterHandle(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 32);
}

function buildDiscordInstallUrl(appId: string, permissions: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", permissions);
  return url.toString();
}

function readStoredAppToken(): string {
  try {
    return window.localStorage.getItem(STANDALONE_AUTH_TOKEN_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function formatRelativeTimestamp(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    return value;
  }

  const deltaMs = Date.now() - target;
  const absSeconds = Math.round(Math.abs(deltaMs) / 1000);
  if (absSeconds < 60) {
    return deltaMs >= 0 ? `${absSeconds}s ago` : `in ${absSeconds}s`;
  }

  const absMinutes = Math.round(absSeconds / 60);
  if (absMinutes < 60) {
    return deltaMs >= 0 ? `${absMinutes}m ago` : `in ${absMinutes}m`;
  }

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 48) {
    return deltaMs >= 0 ? `${absHours}h ago` : `in ${absHours}h`;
  }

  const absDays = Math.round(absHours / 24);
  return deltaMs >= 0 ? `${absDays}d ago` : `in ${absDays}d`;
}

function summarizeLobby(lobby: PazaakLobbyRecord): string {
  return `${lobby.players.length}/${lobby.maxPlayers} seats · ${lobby.tableSettings.variant} · ${lobby.tableSettings.turnTimerSeconds}s timer`;
}

function getDefaultApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, port } = window.location;
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port !== "4001") {
    return `${protocol}//${hostname}:4001`;
  }

  return "";
}

function loadDashboardPrefs(): DashboardPrefs {
  if (typeof window === "undefined") {
    return { ...DEFAULT_DASHBOARD_PREFS };
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<DashboardPrefs> : {};
    return {
      ...DEFAULT_DASHBOARD_PREFS,
      ...parsed,
      apiBase: typeof parsed.apiBase === "string" && parsed.apiBase.trim().length > 0 ? parsed.apiBase : getDefaultApiBase(),
      fallbackBases: typeof parsed.fallbackBases === "string" ? parsed.fallbackBases : "",
      compactEndpoints: Boolean(parsed.compactEndpoints),
      highContrast: Boolean(parsed.highContrast),
      showAdvanced: Boolean(parsed.showAdvanced),
    };
  } catch {
    return { ...DEFAULT_DASHBOARD_PREFS, apiBase: getDefaultApiBase() };
  }
}

function saveDashboardPrefs(prefs: DashboardPrefs): void {
  try {
    window.localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage failures.
  }
}

function loadChecklistState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CHECKLIST_KEY);
    return raw ? JSON.parse(raw) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function saveChecklistState(state: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(DASHBOARD_CHECKLIST_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}

function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

function buildDashboardApiUrl(apiBase: string, path: string): string {
  const normalizedBase = normalizeApiBase(apiBase);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
}

function splitFallbackBases(value: string): string[] {
  return value.split(/[\n,]+/u).map((entry) => entry.trim()).filter(Boolean);
}

function formatPayload(body: JsonValue | null | undefined, text: string): string {
  const raw = body === undefined || body === null ? text : JSON.stringify(body, null, 2);
  if (!raw.trim()) {
    return "No response body.";
  }
  return raw.length > 5000 ? `${raw.slice(0, 5000)}\n... truncated ...` : raw;
}

function isJsonRecord(body: JsonValue | null): body is JsonObject {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

/** After runtime key/shape checks, align parsed JSON with API types. */
function dashboardParsedJsonAs<T>(value: JsonValue): T {
  return value as T;
}

function readDashboardOAuthProviders(body: JsonValue | null): SocialAuthProviderConfig[] | null {
  if (!isJsonRecord(body) || !("providers" in body)) return null;
  const providers = body.providers;
  if (!Array.isArray(providers)) return null;
  return dashboardParsedJsonAs<SocialAuthProviderConfig[]>(providers);
}

function readDashboardOpponents(body: JsonValue | null): PazaakOpponentProfileRecord[] | null {
  if (!isJsonRecord(body) || !("opponents" in body)) return null;
  const opponents = body.opponents;
  if (!Array.isArray(opponents)) return null;
  return dashboardParsedJsonAs<PazaakOpponentProfileRecord[]>(opponents);
}

function readDashboardMe(body: JsonValue | null): MeResponse | null {
  if (!isJsonRecord(body) || !("user" in body)) return null;
  return dashboardParsedJsonAs<MeResponse>(body);
}

function readDashboardMatchmakingStats(body: JsonValue | null): MatchmakingStatsResponse | null {
  if (!isJsonRecord(body) || !("playersInQueue" in body)) return null;
  return dashboardParsedJsonAs<MatchmakingStatsResponse>(body);
}

function readDashboardLobbies(body: JsonValue | null): PazaakLobbyRecord[] | null {
  if (!isJsonRecord(body) || !("lobbies" in body)) return null;
  const lobbies = body.lobbies;
  if (!Array.isArray(lobbies)) return null;
  return dashboardParsedJsonAs<PazaakLobbyRecord[]>(lobbies);
}

function readDashboardLeaders(body: JsonValue | null): LeaderboardEntry[] | null {
  if (!isJsonRecord(body) || !("leaders" in body)) return null;
  const leaders = body.leaders;
  if (!Array.isArray(leaders)) return null;
  return dashboardParsedJsonAs<LeaderboardEntry[]>(leaders);
}

function readDashboardHistory(body: JsonValue | null): PazaakMatchHistoryRecord[] | null {
  if (!isJsonRecord(body) || !("history" in body)) return null;
  const history = body.history;
  if (!Array.isArray(history)) return null;
  return dashboardParsedJsonAs<PazaakMatchHistoryRecord[]>(history);
}

async function requestDashboardJson(
  apiBase: string,
  path: string,
  init: RequestInit,
  timeoutMs = 4000,
): Promise<DashboardHttpResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(buildDashboardApiUrl(apiBase, path), {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: JsonValue | null = null;
    if (text.trim()) {
      try {
        body = JSON.parse(text) as JsonValue;
      } catch {
        body = null;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      latencyMs: Math.round(performance.now() - startedAt),
      url: response.url,
      text,
      body,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function replaceRouteParameters(path: string): string {
  return path
    .replace(/:provider/gu, "discord")
    .replace(/:matchId/gu, "MATCH_ID")
    .replace(/:lobbyId/gu, "LOBBY_ID")
    .replace(/:aiUserId/gu, "AI_USER_ID")
    .replace(/:name/gu, "default");
}

function getEndpointBodyExample(endpoint: DashboardEndpoint): string {
  if (endpoint.method === "GET" || endpoint.method === "DELETE" || endpoint.method === "WS" || endpoint.method === "CMD" || endpoint.method === "CLI") {
    return "";
  }

  if (endpoint.path.includes("matchmaking/enqueue")) {
    return '{"preferredMaxPlayers":2}';
  }

  if (endpoint.path === "/api/lobbies") {
    return '{"name":"Operator test table","maxPlayers":2,"tableSettings":{"variant":"canonical","maxPlayers":2,"maxRounds":3,"turnTimerSeconds":45,"ranked":false,"allowAiFill":true,"sideboardMode":"runtime_random"}}';
  }

  if (endpoint.path.includes("/ready")) {
    return '{"ready":true}';
  }

  if (endpoint.path.includes("/status")) {
    return '{"status":"waiting"}';
  }

  if (endpoint.path.includes("/chat")) {
    return '{"text":"hello table"}';
  }

  if (endpoint.path.includes("/sideboards/")) {
    return '{"tokens":["+1","-2","*3","$$","TT","F1","F2","VV","+4","-5"],"makeActive":true}';
  }

  return "{}";
}

function createEndpointSnippet(endpoint: DashboardEndpoint, apiBase: string): string {
  if (endpoint.method === "CLI") {
    return `corepack pnpm dev:ingest -- ${endpoint.path}`;
  }

  if (endpoint.method === "CMD") {
    return endpoint.path;
  }

  if (endpoint.method === "WS") {
    const wsBase = normalizeApiBase(apiBase).replace(/^http/u, "ws") || "ws://localhost:4001";
    return `${wsBase}${replaceRouteParameters(endpoint.path)}`;
  }

  const url = buildDashboardApiUrl(apiBase, replaceRouteParameters(endpoint.path));
  const parts = ["curl", "-i", "-X", endpoint.method, JSON.stringify(url)];
  if (endpoint.auth.toLowerCase().includes("bearer")) {
    parts.push("-H", JSON.stringify("Authorization: Bearer <token>"));
  }
  const body = getEndpointBodyExample(endpoint);
  if (body) {
    parts.push("-H", JSON.stringify("Content-Type: application/json"), "--data", JSON.stringify(body));
  }
  return parts.join(" ");
}

function createOpenApiSketch(apiBase: string): string {
  const restEndpoints = DASHBOARD_ENDPOINT_GROUPS
    .flatMap((group) => group.endpoints)
    .filter((endpoint) => ["GET", "POST", "PUT", "DELETE"].includes(endpoint.method));
  const paths: Record<string, Record<string, JsonValue>> = {};

  for (const endpoint of restEndpoints) {
    const openApiPath = endpoint.path.replace(/:([A-Za-z0-9_]+)/gu, "{$1}").replace(/\?.*$/u, "");
    const method = endpoint.method.toLowerCase();
    paths[openApiPath] = {
      ...(paths[openApiPath] ?? {}),
      [method]: {
        summary: endpoint.description,
        tags: [endpoint.scope],
        description: `${endpoint.operations}\n\nAvailability: ${endpoint.availability}`,
        security: endpoint.auth.toLowerCase().includes("bearer") ? [{ bearerAuth: [] }] : [],
        responses: {
          "200": { description: endpoint.response },
        },
      },
    };
  }

  return JSON.stringify({
    openapi: "3.1.0",
    info: {
      title: "OpenKOTOR Bots API Sketch",
      version: "0.1.0",
    },
    servers: [{ url: normalizeApiBase(apiBase) || "/" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    paths,
  }, null, 2);
}

export function CommunityBotsDashboard() {
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [activeBotId, setActiveBotId] = useState<DashboardBotId>("pazaak");
  const [activeRunbookId, setActiveRunbookId] = useState(DASHBOARD_RUNBOOKS[0]?.id ?? "local-matchmaking");
  const [onboardingTrack, setOnboardingTrack] = useState<OnboardingTrack>("play");
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadDashboardPrefs());
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(() => loadChecklistState());
  const [apiHealth, setApiHealth] = useState<DashboardHealth>("checking");
  const [healthDetail, setHealthDetail] = useState("Waiting for probe.");
  const [oauthProviders, setOauthProviders] = useState<SocialAuthProviderConfig[] | null>(null);
  const [bearerToken, setBearerToken] = useState(() => readStoredAppToken());
  const [selectedProbeId, setSelectedProbeId] = useState(DASHBOARD_PROBE_TARGETS[0]?.id ?? "ping");
  const [requestBody, setRequestBody] = useState(DASHBOARD_PROBE_TARGETS[0]?.sampleBody ?? "");
  const [probeResults, setProbeResults] = useState<Record<string, DashboardProbeResult>>({});
  const [endpointSearch, setEndpointSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | DashboardMethod>("all");
  const [authFilter, setAuthFilter] = useState<"all" | "public" | "auth">("all");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [traskVoterHandle, setTraskVoterHandle] = useState(() => loadTraskVoterHandle());
  const [traskVotes, setTraskVotes] = useState<Record<string, string[]>>(() => loadTraskVoteState());
  const [traskSort, setTraskSort] = useState<"hot" | "top" | "new">("hot");
  const [traskTagFilter, setTraskTagFilter] = useState<string>("all");
  const [liveData, setLiveData] = useState<DashboardLiveData>({
    opponents: [],
    me: null,
    stats: null,
    lobbies: [],
    leaderboard: [],
    history: [],
    signedError: null,
    lastRefreshedAt: null,
  });
  const [runtimeBusy, setRuntimeBusy] = useState(false);

  useEffect(() => {
    document.title = "OpenKOTOR Bots - API Console";
  }, []);

  useEffect(() => {
    saveTraskVoterHandle(traskVoterHandle);
  }, [traskVoterHandle]);

  useEffect(() => {
    saveTraskVoteState(traskVotes);
  }, [traskVotes]);

  const persistPrefs = useCallback((nextPrefs: DashboardPrefs) => {
    setPrefs(nextPrefs);
    saveDashboardPrefs(nextPrefs);
  }, []);

  const updatePrefs = useCallback((patch: Partial<DashboardPrefs>) => {
    persistPrefs({ ...prefs, ...patch });
  }, [persistPrefs, prefs]);

  const selectedProbe = useMemo(
    () => DASHBOARD_PROBE_TARGETS.find((probe) => probe.id === selectedProbeId) ?? DASHBOARD_PROBE_TARGETS[0]!,
    [selectedProbeId],
  );

  useEffect(() => {
    setRequestBody(selectedProbe.sampleBody ?? "");
  }, [selectedProbe]);

  const generatedApiBases = useMemo(() => {
    return [prefs.apiBase, ...splitFallbackBases(prefs.fallbackBases)]
      .map(normalizeApiBase)
      .filter(Boolean)
      .join(",");
  }, [prefs.apiBase, prefs.fallbackBases]);

  const activeBot = useMemo(
    () => DASHBOARD_BOTS.find((bot) => bot.id === activeBotId) ?? DASHBOARD_BOTS[0]!,
    [activeBotId],
  );

  const activeRunbook = useMemo(
    () => DASHBOARD_RUNBOOKS.find((runbook) => runbook.id === activeRunbookId) ?? DASHBOARD_RUNBOOKS[0]!,
    [activeRunbookId],
  );

  const activeGuide = useMemo(
    () => DASHBOARD_ONBOARDING_GUIDES.find((guide) => guide.id === onboardingTrack) ?? DASHBOARD_ONBOARDING_GUIDES[0]!,
    [onboardingTrack],
  );

  const methodOptions = useMemo(() => {
    return Array.from(new Set(DASHBOARD_ENDPOINT_GROUPS.flatMap((group) => group.endpoints.map((endpoint) => endpoint.method))));
  }, []);

  const filteredEndpointGroups = useMemo(() => {
    const query = endpointSearch.trim().toLowerCase();
    return DASHBOARD_ENDPOINT_GROUPS
      .filter((group) => group.botId === activeBotId)
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) => {
          const matchesMethod = methodFilter === "all" || endpoint.method === methodFilter;
          const matchesAuth = authFilter === "all"
            || (authFilter === "public" && endpoint.auth.toLowerCase() === "none")
            || (authFilter === "auth" && endpoint.auth.toLowerCase() !== "none");
          const searchable = `${endpoint.method} ${endpoint.path} ${endpoint.scope} ${endpoint.auth} ${endpoint.availability} ${endpoint.description} ${endpoint.operations}`.toLowerCase();
          return matchesMethod && matchesAuth && (!query || searchable.includes(query));
        }),
      }))
      .filter((group) => group.endpoints.length > 0);
  }, [activeBotId, authFilter, endpointSearch, methodFilter]);

  const totalEndpointCount = useMemo(
    () => DASHBOARD_ENDPOINT_GROUPS.reduce((sum, group) => sum + group.endpoints.length, 0),
    [],
  );

  const oauthSummary = useMemo(() => {
    if (!oauthProviders) {
      return "Provider probe pending";
    }

    const enabled = oauthProviders.filter((provider) => provider.enabled).map((provider) => provider.provider);
    return enabled.length > 0 ? enabled.join(", ") : "No social providers enabled";
  }, [oauthProviders]);

  const enabledProviderCount = oauthProviders?.filter((provider) => provider.enabled).length ?? 0;
  const hasBearerToken = bearerToken.trim().length > 0;
  const openApiSketch = useMemo(() => createOpenApiSketch(prefs.apiBase), [prefs.apiBase]);
  const normalizedVoterHandle = normalizeVoterHandle(traskVoterHandle)
    || liveData.me?.user.displayName
    || liveData.me?.user.username
    || "Operator";
  const traskInstallUrl = useMemo(
    () => buildDiscordInstallUrl(TRASK_DISCORD_APP_ID, TRASK_INSTALL_PERMISSIONS),
    [],
  );
  const traskTags = useMemo(
    () => ["all", ...Array.from(new Set(TRASK_QUESTIONS_OF_THE_DAY.flatMap((question) => question.tags)))],
    [],
  );

  const getTraskVoteCount = useCallback((question: TraskQuestionOfTheDay) => {
    return question.baseVotes + (traskVotes[question.id]?.length ?? 0);
  }, [traskVotes]);

  const toggleTraskVote = useCallback((questionId: string) => {
    const handle = normalizeVoterHandle(traskVoterHandle)
      || liveData.me?.user.displayName
      || liveData.me?.user.username
      || "Operator";

    setTraskVoterHandle(handle);
    setTraskVotes((current) => {
      const currentVotes = current[questionId] ?? [];
      const hasVote = currentVotes.includes(handle);
      return {
        ...current,
        [questionId]: hasVote
          ? currentVotes.filter((entry) => entry !== handle)
          : [...currentVotes, handle],
      };
    });
  }, [liveData.me?.user.displayName, liveData.me?.user.username, traskVoterHandle]);

  const traskQuestions = useMemo(() => {
    const filtered = TRASK_QUESTIONS_OF_THE_DAY.filter((question) => traskTagFilter === "all" || question.tags.includes(traskTagFilter));
    return [...filtered].sort((left, right) => {
      if (traskSort === "new") {
        return new Date(right.askedAt).getTime() - new Date(left.askedAt).getTime();
      }

      const leftVotes = getTraskVoteCount(left);
      const rightVotes = getTraskVoteCount(right);

      if (traskSort === "top") {
        return rightVotes - leftVotes;
      }

      const trendWeight = (value: TraskQuestionOfTheDay["trend"]): number => {
        if (value === "rising") return 4;
        if (value === "new") return 3;
        return 1;
      };

      return (rightVotes + trendWeight(right.trend)) - (leftVotes + trendWeight(left.trend));
    });
  }, [getTraskVoteCount, traskSort, traskTagFilter]);

  const traskContributorScores = useMemo(() => {
    return Object.values(
      TRASK_QUESTIONS_OF_THE_DAY.reduce<Record<string, { author: string; score: number; questions: number }>>((accumulator, question) => {
        const current = accumulator[question.author] ?? { author: question.author, score: 0, questions: 0 };
        current.score += getTraskVoteCount(question);
        current.questions += 1;
        accumulator[question.author] = current;
        return accumulator;
      }, {}),
    )
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);
  }, [getTraskVoteCount]);

  const traskMaxUsage = useMemo(
    () => Math.max(...TRASK_USAGE_SERIES.map((point) => Math.max(point.asks, point.answered, point.scopeRequests))),
    [],
  );

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue((current) => current === value ? null : current), 1400);
    } catch {
      setCopiedValue(null);
    }
  }, []);

  const probeTarget = useCallback(async (target: DashboardProbeTarget) => {
    if (target.requiresAuth && !hasBearerToken) {
      setProbeResults((current) => ({
        ...current,
        [target.id]: { status: "error", detail: "Paste a bearer token or sign into PazaakWorld before running this signed-in probe." },
      }));
      return;
    }

    setProbeResults((current) => ({
      ...current,
      [target.id]: { status: "checking", detail: "Sending request..." },
    }));

    const headers: Record<string, string> = {};
    if (target.requiresAuth) {
      headers.Authorization = `Bearer ${bearerToken.trim()}`;
    }
    const body = target.method === "GET" ? undefined : requestBody.trim();
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const result = await requestDashboardJson(prefs.apiBase, target.path, {
        method: target.method,
        headers,
        body,
      });
      setProbeResults((current) => ({
        ...current,
        [target.id]: {
          status: result.ok ? "ok" : "error",
          detail: `${result.status} ${result.statusText || (result.ok ? "OK" : "Error")} in ${result.latencyMs}ms`,
          payload: formatPayload(result.body, result.text),
          statusCode: result.status,
          latencyMs: result.latencyMs,
        },
      }));
    } catch (error) {
      setProbeResults((current) => ({
        ...current,
        [target.id]: {
          status: "error",
          detail: error instanceof Error ? error.message : "Request failed.",
        },
      }));
    }
  }, [bearerToken, hasBearerToken, prefs.apiBase, requestBody]);

  const refreshRuntimeData = useCallback(async () => {
    setRuntimeBusy(true);
    setApiHealth("checking");
    setHealthDetail("Checking selected API target...");

    const authHeaders = hasBearerToken ? { Authorization: `Bearer ${bearerToken.trim()}` } : undefined;

    const [healthResult, providerResult, opponentsResult] = await Promise.allSettled([
      requestDashboardJson(prefs.apiBase, "/api/health", { method: "GET" }, 2200),
      requestDashboardJson(prefs.apiBase, "/api/auth/oauth/providers", { method: "GET" }, 2200),
      requestDashboardJson(prefs.apiBase, "/api/pazaak/opponents", { method: "GET" }, 2200),
    ]);

    if (healthResult.status === "fulfilled") {
      setApiHealth(healthResult.value.ok ? "online" : "offline");
      setHealthDetail(`${healthResult.value.status} from ${buildDashboardApiUrl(prefs.apiBase, "/api/health")} in ${healthResult.value.latencyMs}ms`);
    } else {
      setApiHealth("offline");
      setHealthDetail(healthResult.reason instanceof Error ? healthResult.reason.message : "Health probe failed.");
    }

    if (providerResult.status === "fulfilled" && providerResult.value.ok) {
      setOauthProviders(readDashboardOAuthProviders(providerResult.value.body));
    } else {
      setOauthProviders(null);
    }

    const nextLiveData: DashboardLiveData = {
      opponents: opponentsResult.status === "fulfilled" && opponentsResult.value.ok
        ? readDashboardOpponents(opponentsResult.value.body) ?? []
        : [],
      me: null,
      stats: null,
      lobbies: [],
      leaderboard: [],
      history: [],
      signedError: null,
      lastRefreshedAt: new Date().toISOString(),
    };

    if (hasBearerToken) {
      const signedResults = await Promise.allSettled([
        requestDashboardJson(prefs.apiBase, "/api/me", { method: "GET", headers: authHeaders }, 2500),
        requestDashboardJson(prefs.apiBase, "/api/matchmaking/stats", { method: "GET", headers: authHeaders }, 2500),
        requestDashboardJson(prefs.apiBase, "/api/lobbies", { method: "GET", headers: authHeaders }, 2500),
        requestDashboardJson(prefs.apiBase, "/api/leaderboard", { method: "GET", headers: authHeaders }, 2500),
        requestDashboardJson(prefs.apiBase, "/api/me/history?limit=5", { method: "GET", headers: authHeaders }, 2500),
      ]);

      const [meResult, statsResult, lobbiesResult, leaderboardResult, historyResult] = signedResults;

      if (meResult.status === "fulfilled" && meResult.value.ok) {
        nextLiveData.me = readDashboardMe(meResult.value.body);
      }

      if (statsResult.status === "fulfilled" && statsResult.value.ok) {
        nextLiveData.stats = readDashboardMatchmakingStats(statsResult.value.body);
      }

      if (lobbiesResult.status === "fulfilled" && lobbiesResult.value.ok) {
        nextLiveData.lobbies = (readDashboardLobbies(lobbiesResult.value.body) ?? []).slice(0, 4);
      }

      if (leaderboardResult.status === "fulfilled" && leaderboardResult.value.ok) {
        nextLiveData.leaderboard = (readDashboardLeaders(leaderboardResult.value.body) ?? []).slice(0, 5);
      }

      if (historyResult.status === "fulfilled" && historyResult.value.ok) {
        nextLiveData.history = (readDashboardHistory(historyResult.value.body) ?? []).slice(0, 5);
      }

      const firstSignedFailure = signedResults.find((result) => result.status === "rejected")
        ?? signedResults.find((result) => result.status === "fulfilled" && !result.value.ok);
      if (firstSignedFailure) {
        nextLiveData.signedError = firstSignedFailure.status === "rejected"
          ? (firstSignedFailure.reason instanceof Error ? firstSignedFailure.reason.message : "Signed-in requests failed.")
          : `Signed-in request returned ${firstSignedFailure.value.status}.`;
      }
    } else {
      nextLiveData.signedError = "Sign into PazaakWorld or paste a bearer token to load private queue, lobby, and wallet data here.";
    }

    setLiveData(nextLiveData);
    setRuntimeBusy(false);
  }, [bearerToken, hasBearerToken, prefs.apiBase]);

  useEffect(() => {
    void refreshRuntimeData();
  }, [refreshRuntimeData]);

  const runPublicProbes = useCallback(async () => {
    for (const target of DASHBOARD_PROBE_TARGETS.filter((probe) => !probe.requiresAuth)) {
      await probeTarget(target);
    }
  }, [probeTarget]);

  const toggleChecklistItem = useCallback((id: string) => {
    const next = { ...checklistState, [id]: !checklistState[id] };
    setChecklistState(next);
    saveChecklistState(next);
  }, [checklistState]);

  const completedChecklistCount = DASHBOARD_CHECKLIST.filter((item) => checklistState[item.id]).length;
  const envSnippet = `VITE_API_BASES=${generatedApiBases}`;
  const selectedProbeResult = probeResults[selectedProbe.id] ?? { status: "idle", detail: "No request sent yet." };

  const liveSurfaceCards = useMemo<DashboardSurfaceCard[]>(() => {
    return [
      {
        eyebrow: "Game",
        title: "PazaakWorld",
        description: hasBearerToken
          ? `Signed in as ${liveData.me?.user.displayName ?? liveData.me?.user.username ?? "player"}. Open the game route to keep playing.`
          : "Use the public Pages route for sign-in, lobby creation, and live play.",
        value: hasBearerToken ? "Signed-in cockpit ready" : "Open the live game route",
        href: PAZAAK_WORLD_PUBLIC_ROUTE,
      },
      {
        eyebrow: "Opponents",
        title: "Practice roster",
        description: liveData.opponents.length > 0
          ? liveData.opponents.slice(0, 3).map((opponent) => opponent.name).join(" · ")
          : "Probe the selected API to load PvE opponents.",
        value: `${liveData.opponents.length} available`,
      },
      {
        eyebrow: "Queue",
        title: "Matchmaking pulse",
        description: liveData.stats
          ? `${liveData.stats.playersInQueue} queued · ${liveData.stats.openLobbies} open lobbies · ${liveData.stats.activeGames} active games`
          : "Private queue and lobby data appears once a token is available.",
        value: liveData.stats?.averageWaitTime ?? (hasBearerToken ? "No queue snapshot yet" : "Sign in to load queue data"),
      },
      {
        eyebrow: "Operators",
        title: "API target",
        description: prefs.apiBase || "Relative /api on the current origin.",
        value: apiHealth === "online" ? "Ready for probes" : "Needs a reachable API base",
        copyValue: envSnippet,
      },
    ];
  }, [apiHealth, envSnippet, hasBearerToken, liveData.me, liveData.opponents, liveData.stats, prefs.apiBase]);

  const botShortcutCards = useMemo<DashboardSurfaceCard[]>(() => {
    return [
      {
        eyebrow: "Pazaak",
        title: "Local authoritative stack",
        description: "Embedded API, WebSockets, queue, lobbies, and live match state.",
        value: "corepack pnpm dev:pazaak",
        copyValue: "corepack pnpm dev:pazaak",
      },
      {
        eyebrow: "Trask",
        title: "Research assistant",
        description: "Discord slash answers backed by indexed source content.",
        value: "/ask query:<topic>",
        copyValue: "/ask query:<topic>",
      },
      {
        eyebrow: "HK-47",
        title: "Designation and persona ops",
        description: "Character-driven Discord responses and persona routing.",
        value: "/designation target:@user",
        copyValue: "/designation target:@user",
      },
      {
        eyebrow: "Ingest",
        title: "Content indexing pipeline",
        description: "Refreshes Trask/HK knowledge and queue-driven source updates.",
        value: "corepack pnpm dev:ingest -- show-indexed",
        copyValue: "corepack pnpm dev:ingest -- show-indexed",
      },
    ];
  }, []);

  return (
    <div className={`bots-dashboard-page ${prefs.highContrast ? "bots-dashboard-page--contrast" : ""} ${prefs.compactEndpoints ? "bots-dashboard-page--compact" : ""}`}>
      <a className="bots-dashboard-skip-link" href="#bots-dashboard-main">Skip to console</a>
      <header className="bots-dashboard-header">
        <div className="bots-dashboard-brand">
          <span aria-hidden="true">OK</span>
          <div>
            <strong>OpenKOTOR Bots</strong>
            <small>{OPERATOR_CONSOLE_ROUTE} operator console</small>
          </div>
        </div>
        <nav className="bots-dashboard-nav" aria-label="Bot site routes">
          <a href={discordBotsHubPath}>Discord bots</a>
          <a href={OPERATOR_CONSOLE_ROUTE}>Operator console</a>
          <a href={PAZAAK_WORLD_PUBLIC_ROUTE}>PazaakWorld</a>
          <a href={QA_TRASK_WEBUI_PUBLIC_ROUTE}>Trask WebUI</a>
          <a href="https://github.com/OpenKotOR/bots">GitHub</a>
        </nav>
      </header>

      <main className="bots-dashboard-main" id="bots-dashboard-main">
        <section className="bots-dashboard-intro" aria-labelledby="bots-dashboard-title">
          <div>
            <p className="bots-dashboard-kicker">Operations Console</p>
            <h1 id="bots-dashboard-title">Working Surfaces, Live Data & Onboarding</h1>
            <p>
              PazaakWorld lives at <strong>{PAZAAK_WORLD_PUBLIC_URL}</strong>. This route now acts as a live hub first: what works now, what data is currently reachable, and what still needs setup.
            </p>
          </div>
          <div className="bots-dashboard-actions">
            <a className="btn btn--primary" href={PAZAAK_WORLD_PUBLIC_ROUTE}>Open PazaakWorld</a>
            <button className="btn btn--secondary" type="button" onClick={() => void refreshRuntimeData()}>
              {runtimeBusy ? "Refreshing..." : "Refresh Live Data"}
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => void copyText(PAZAAK_WORLD_PUBLIC_URL)}>
              {copiedValue === PAZAAK_WORLD_PUBLIC_URL ? "Copied" : "Copy Pazaak URL"}
            </button>
          </div>
        </section>

        <nav className="bots-dashboard-tabs" aria-label="Dashboard sections">
          {DASHBOARD_VIEWS.map((view) => (
            <button key={view.id} type="button" aria-pressed={activeView === view.id} onClick={() => setActiveView(view.id)}>
              {view.label}
            </button>
          ))}
        </nav>

        <section className="bots-dashboard-status-grid" aria-label="Routing and health status">
          <article>
            <span>Frontend route</span>
            <strong>{window.location.pathname}</strong>
            <small>The deployed operator console stays at /community-bots; /bots is the invite hub; /bots/pazaakworld opens the game surface.</small>
          </article>
          <article>
            <span>Selected API</span>
            <strong>{prefs.apiBase || "relative /api"}</strong>
            <small>{healthDetail}</small>
          </article>
          <article>
            <span>Pazaak API</span>
            <strong className={`bots-dashboard-status bots-dashboard-status--${apiHealth}`} aria-live="polite">{apiHealth}</strong>
            <small>{liveData.lastRefreshedAt ? `Refreshed ${formatRelativeTimestamp(liveData.lastRefreshedAt)}` : "Waiting for first refresh."}</small>
          </article>
          <article>
            <span>OAuth providers</span>
            <strong>{oauthSummary}</strong>
            <small>Callback defaults still target the GitHub Pages Pazaak route.</small>
          </article>
        </section>

        <section className="bots-dashboard-metrics" aria-label="Non-sensitive metrics">
          {DASHBOARD_METRICS.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        {activeView === "overview" && (
          <>
            <section className="bots-dashboard-panel bots-dashboard-overview-panel" aria-labelledby="bots-dashboard-overview-title">
              <div className="bots-dashboard-section-heading">
                <div>
                  <p className="bots-dashboard-kicker">Live Hub</p>
                  <h2 id="bots-dashboard-overview-title">Use What Is Working Right Now</h2>
                </div>
                <div className="bots-dashboard-actions">
                  <button type="button" onClick={() => void runPublicProbes()}>Run Public Probes</button>
                  <button type="button" onClick={() => setActiveView("api")}>Open API Explorer</button>
                </div>
              </div>

              <div className="bots-dashboard-overview-grid">
                <article className="bots-dashboard-spotlight">
                  <p className="bots-dashboard-kicker">Command Center</p>
                  <h3>Live status beats static docs</h3>
                  <p>
                    This overview now prioritizes the reachable game, public API state, signed-in player data, and quick entries for the other bots. Setup still exists, but it stays attached to the same page instead of replacing the hub.
                  </p>
                  <div className="bots-dashboard-spotlight-pills" aria-label="Live readiness">
                    <span>{apiHealth === "online" ? "API reachable" : "API needs attention"}</span>
                    <span>{enabledProviderCount} OAuth providers enabled</span>
                    <span>{liveData.opponents.length} PvE opponents visible</span>
                    <span>{hasBearerToken ? "App token detected" : "No app token detected"}</span>
                  </div>
                </article>

                <div className="bots-dashboard-surface-grid">
                  {liveSurfaceCards.map((card) => (
                    <article key={card.title} className="bots-dashboard-surface-card">
                      <p className="bots-dashboard-kicker">{card.eyebrow}</p>
                      <h3>{card.title}</h3>
                      <strong>{card.value}</strong>
                      <p>{card.description}</p>
                      <div className="bots-dashboard-card-actions">
                        {card.href ? <a className="btn btn--secondary" href={card.href}>Open</a> : null}
                        {card.copyValue ? (
                          <button type="button" onClick={() => void copyText(card.copyValue!)}>
                            {copiedValue === card.copyValue ? "Copied" : "Copy"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="bots-dashboard-live-sections">
                <article className="bots-dashboard-live-panel">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Signed-In Cockpit</p>
                      <h3>{liveData.me ? liveData.me.user.displayName : "Private player data"}</h3>
                    </div>
                    <strong>{hasBearerToken ? "Connected" : "Waiting for token"}</strong>
                  </div>
                  {liveData.me ? (
                    <div className="bots-dashboard-live-stats">
                      <article>
                        <span>Wallet</span>
                        <strong>{liveData.me.wallet.balance} credits</strong>
                        <small>{liveData.me.wallet.wins} wins · {liveData.me.wallet.losses} losses · MMR {liveData.me.wallet.mmr}</small>
                      </article>
                      <article>
                        <span>Queue</span>
                        <strong>{liveData.me.queue ? "Enqueued" : "Idle"}</strong>
                        <small>{liveData.me.queue ? `Joined ${formatRelativeTimestamp(liveData.me.queue.enqueuedAt)}` : "Not currently waiting for a match."}</small>
                      </article>
                      <article>
                        <span>Current match</span>
                        <strong>{liveData.me.match ? liveData.me.match.statusLine : "No live match"}</strong>
                        <small>{liveData.me.match ? `${liveData.me.match.players[0].displayName} vs ${liveData.me.match.players[1].displayName}` : "Open PazaakWorld to start or join a table."}</small>
                      </article>
                      <article>
                        <span>Queue snapshot</span>
                        <strong>{liveData.stats ? `${liveData.stats.playersInQueue} queued` : "No snapshot"}</strong>
                        <small>{liveData.stats ? `${liveData.stats.openLobbies} open lobbies · ${liveData.stats.averageWaitTime}` : "Refresh after auth succeeds."}</small>
                      </article>
                    </div>
                  ) : (
                    <div className="bots-dashboard-empty-state">
                      <p>{liveData.signedError ?? "Signed-in data will appear here after auth."}</p>
                      <div className="bots-dashboard-card-actions">
                        <a className="btn btn--secondary" href={PAZAAK_WORLD_PUBLIC_ROUTE}>Sign In Via PazaakWorld</a>
                        <button type="button" onClick={() => setActiveView("api")}>Open Token Field</button>
                      </div>
                    </div>
                  )}
                </article>

                <article className="bots-dashboard-live-panel">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Live Tables & Results</p>
                      <h3>Lobby, leaderboard, and match history</h3>
                    </div>
                  </div>
                  <div className="bots-dashboard-live-lists">
                    <section>
                      <h4>Open lobbies</h4>
                      {liveData.lobbies.length > 0 ? (
                        <ul>
                          {liveData.lobbies.map((lobby) => <li key={lobby.id}><strong>{lobby.name}</strong><span>{summarizeLobby(lobby)}</span></li>)}
                        </ul>
                      ) : <p>No lobby snapshot yet.</p>}
                    </section>
                    <section>
                      <h4>Leaderboard</h4>
                      {liveData.leaderboard.length > 0 ? (
                        <ol>
                          {liveData.leaderboard.slice(0, 3).map((entry) => <li key={entry.userId}><strong>#{entry.rank} {entry.displayName}</strong><span>MMR {entry.mmr} · {entry.balance} credits</span></li>)}
                        </ol>
                      ) : <p>Leaderboard appears after signed requests succeed.</p>}
                    </section>
                    <section>
                      <h4>Recent matches</h4>
                      {liveData.history.length > 0 ? (
                        <ul>
                          {liveData.history.slice(0, 3).map((entry) => <li key={entry.matchId}><strong>{entry.winnerName} vs {entry.loserName}</strong><span>{entry.summary} · {formatRelativeTimestamp(entry.completedAt)}</span></li>)}
                        </ul>
                      ) : <p>History will appear once the selected API accepts the current bearer token.</p>}
                    </section>
                  </div>
                </article>
              </div>
            </section>

            <section className="bots-dashboard-panel bots-dashboard-trask-hub" aria-labelledby="bots-dashboard-trask-title">
              <div className="bots-dashboard-section-heading">
                <div>
                  <p className="bots-dashboard-kicker">Trask Community Intelligence</p>
                  <h2 id="bots-dashboard-trask-title">Vote, Install, Scope, And See What People Actually Need</h2>
                </div>
                <div className="bots-dashboard-actions">
                  <a className="btn btn--primary" href={traskInstallUrl} target="_blank" rel="noreferrer">Add Trask To Your Server</a>
                  <button type="button" onClick={() => void copyText(traskInstallUrl)}>{copiedValue === traskInstallUrl ? "Copied" : "Copy Invite URL"}</button>
                  <a className="btn btn--secondary" href={QA_TRASK_WEBUI_PUBLIC_ROUTE}>Open QA WebUI</a>
                </div>
              </div>

              <div className="bots-dashboard-trask-grid">
                <article className="bots-dashboard-trask-panel bots-dashboard-trask-panel--questions">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Questions Of The Day</p>
                      <h3>Real-time local voting for what should rise first</h3>
                    </div>
                    <strong>{traskQuestions.length} visible prompts</strong>
                  </div>
                  <div className="bots-dashboard-trask-toolbar">
                    <label className="bots-dashboard-field">
                      <span>Voter handle</span>
                      <input value={traskVoterHandle} onChange={(event) => setTraskVoterHandle(event.target.value)} placeholder={normalizedVoterHandle} />
                    </label>
                    <label className="bots-dashboard-field">
                      <span>Sort</span>
                      <select value={traskSort} onChange={(event) => setTraskSort(event.target.value as "hot" | "top" | "new") }>
                        <option value="hot">Hot</option>
                        <option value="top">Top</option>
                        <option value="new">Newest</option>
                      </select>
                    </label>
                    <label className="bots-dashboard-field">
                      <span>Topic</span>
                      <select value={traskTagFilter} onChange={(event) => setTraskTagFilter(event.target.value)}>
                        {traskTags.map((tag) => <option key={tag} value={tag}>{tag === "all" ? "All topics" : tag}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="bots-dashboard-trask-question-strip" role="list" aria-label="Trask question voting board">
                    {traskQuestions.map((question) => {
                      const voteCount = getTraskVoteCount(question);
                      const voted = (traskVotes[question.id] ?? []).includes(normalizedVoterHandle);
                      return (
                        <article key={question.id} className="bots-dashboard-trask-card" role="listitem">
                          <div className="bots-dashboard-trask-card__header">
                            <p className="bots-dashboard-kicker">{question.channel}</p>
                            <span className={`bots-dashboard-trend bots-dashboard-trend--${question.trend}`}>{question.trend}</span>
                          </div>
                          <h3>{question.title}</h3>
                          <p>{question.summary}</p>
                          <div className="bots-dashboard-trask-tags">
                            {question.tags.map((tag) => <span key={tag}>{tag}</span>)}
                          </div>
                          <div className="bots-dashboard-trask-meta">
                            <strong>{voteCount} updoots</strong>
                            <small>{question.author} · {formatRelativeTimestamp(question.askedAt)}</small>
                          </div>
                          <div className="bots-dashboard-trask-sources">
                            {question.sourceNames.map((source) => <span key={source}>{source}</span>)}
                          </div>
                          <div className="bots-dashboard-card-actions">
                            <button type="button" onClick={() => toggleTraskVote(question.id)}>{voted ? "Remove updoot" : "Updoot this"}</button>
                            <button type="button" onClick={() => void copyText(`/ask query:${question.title}`)}>{copiedValue === `/ask query:${question.title}` ? "Copied" : "Copy /ask"}</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>

                <article className="bots-dashboard-trask-panel">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Observed Guild Rollout</p>
                      <h3>Enabled servers and current scope</h3>
                    </div>
                    <strong>{TRASK_OBSERVED_GUILDS.length} observed guild{TRASK_OBSERVED_GUILDS.length === 1 ? "" : "s"}</strong>
                  </div>
                  <div className="bots-dashboard-trask-server-strip" role="list" aria-label="Observed Trask guilds">
                    {TRASK_OBSERVED_GUILDS.map((guild) => (
                      <article key={guild.id} className="bots-dashboard-trask-server-card" role="listitem">
                        <div className="bots-dashboard-trask-meta">
                          <strong>{guild.name}</strong>
                          <small>{guild.installState}</small>
                        </div>
                        <div className="bots-dashboard-live-stats bots-dashboard-live-stats--dense">
                          <article>
                            <span>Members</span>
                            <strong>{guild.memberCount}</strong>
                            <small>Observed guild member count</small>
                          </article>
                          <article>
                            <span>Presence</span>
                            <strong>{guild.activePresenceCount}</strong>
                            <small>Widget presence snapshot</small>
                          </article>
                          <article>
                            <span>Containers</span>
                            <strong>{guild.channelCount}</strong>
                            <small>Exported channels and threads</small>
                          </article>
                          <article>
                            <span>Scope</span>
                            <strong>Open</strong>
                            <small>No approved-channel override configured locally</small>
                          </article>
                        </div>
                        <div className="bots-dashboard-trask-tags">
                          {guild.scopeBadges.map((badge) => <span key={badge}>{badge}</span>)}
                        </div>
                        <ul className="bots-dashboard-trask-notes">
                          {guild.notes.map((note) => <li key={note}>{note}</li>)}
                        </ul>
                      </article>
                    ))}
                  </div>
                </article>
              </div>

              <div className="bots-dashboard-trask-grid bots-dashboard-trask-grid--secondary">
                <article className="bots-dashboard-trask-panel">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Contributor Updoots</p>
                      <h3>Which askers are driving the queue</h3>
                    </div>
                  </div>
                  <div className="bots-dashboard-trask-scoreboard">
                    {traskContributorScores.map((entry) => (
                      <article key={entry.author}>
                        <strong>{entry.author}</strong>
                        <span>{entry.score} updoots</span>
                        <small>{entry.questions} surfaced question{entry.questions === 1 ? "" : "s"}</small>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="bots-dashboard-trask-panel">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Semantic Grouping</p>
                      <h3>What people ask about and where they get stuck</h3>
                    </div>
                  </div>
                  <div className="bots-dashboard-trask-topic-grid">
                    {TRASK_TOPIC_SIGNALS.map((signal) => (
                      <article key={signal.id}>
                        <div className="bots-dashboard-trask-meta">
                          <strong>{signal.label}</strong>
                          <small>{signal.trend}</small>
                        </div>
                        <p>{signal.description}</p>
                        <div className="bots-dashboard-trask-topic-bar"><span style={{ width: `${signal.weight}%` }} /></div>
                        <small>{signal.confusionPattern}</small>
                        <code>{signal.examplePrompt}</code>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="bots-dashboard-trask-panel">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Usage Over Time</p>
                      <h3>Question volume, handled answers, and scope-change pressure</h3>
                    </div>
                  </div>
                  <div className="bots-dashboard-trask-usage-chart" aria-label="Trask usage over time">
                    {TRASK_USAGE_SERIES.map((point) => (
                      <article key={point.label}>
                        <span>{point.label}</span>
                        <div className="bots-dashboard-trask-usage-bars">
                          <div><small>Asks</small><span style={{ width: `${(point.asks / traskMaxUsage) * 100}%` }} /></div>
                          <div><small>Answered</small><span style={{ width: `${(point.answered / traskMaxUsage) * 100}%` }} /></div>
                          <div><small>Scope</small><span style={{ width: `${(point.scopeRequests / traskMaxUsage) * 100}%` }} /></div>
                        </div>
                        <strong>{point.asks} asks</strong>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="bots-dashboard-trask-panel bots-dashboard-trask-panel--embed">
                  <div className="bots-dashboard-live-panel__header">
                    <div>
                      <p className="bots-dashboard-kicker">Embedded QA Surface</p>
                      <h3>Trask web UI inside the /bots deployment</h3>
                    </div>
                    <div className="bots-dashboard-card-actions">
                      <a href={QA_TRASK_WEBUI_PUBLIC_ROUTE}>Open route</a>
                      <button type="button" onClick={() => void copyText(QA_TRASK_WEBUI_PUBLIC_URL)}>{copiedValue === QA_TRASK_WEBUI_PUBLIC_URL ? "Copied" : "Copy URL"}</button>
                    </div>
                  </div>
                  <p>
                    This iframe points to the same GitHub Pages deployment namespace, so the QA UI can be used inline while you keep operational context in the bots console.
                  </p>
                  <div className="bots-dashboard-trask-embed-shell">
                    <iframe
                      title="QA Trask WebUI"
                      src={QA_TRASK_WEBUI_PUBLIC_ROUTE}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </article>
              </div>
            </section>

            <section className="bots-dashboard-panel bots-dashboard-bot-hub" aria-labelledby="bots-dashboard-bot-hub-title">
              <div className="bots-dashboard-section-heading">
                <div>
                  <p className="bots-dashboard-kicker">Bot Shortcuts</p>
                  <h2 id="bots-dashboard-bot-hub-title">Jump Into The Other Working Surfaces</h2>
                </div>
              </div>
              <div className="bots-dashboard-surface-grid">
                {botShortcutCards.map((card) => (
                  <article key={card.title} className="bots-dashboard-surface-card bots-dashboard-surface-card--compact">
                    <p className="bots-dashboard-kicker">{card.eyebrow}</p>
                    <h3>{card.title}</h3>
                    <strong>{card.value}</strong>
                    <p>{card.description}</p>
                    {card.copyValue ? (
                      <button type="button" onClick={() => void copyText(card.copyValue ?? "") }>
                        {copiedValue === card.copyValue ? "Copied" : "Copy Command"}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="bots-dashboard-panel bots-dashboard-onboarding-panel" aria-labelledby="bots-dashboard-onboarding-title">
              <div className="bots-dashboard-section-heading">
                <div>
                  <p className="bots-dashboard-kicker">Embedded Onboarding</p>
                  <h2 id="bots-dashboard-onboarding-title">Setup Stays On The Same Page</h2>
                </div>
              </div>
              <div className="bots-dashboard-runbook-tabs" role="tablist" aria-label="Onboarding selector">
                {DASHBOARD_ONBOARDING_GUIDES.map((guide) => (
                  <button key={guide.id} type="button" role="tab" aria-selected={onboardingTrack === guide.id} onClick={() => setOnboardingTrack(guide.id)}>
                    {guide.label}
                  </button>
                ))}
              </div>
              <article className="bots-dashboard-onboarding-guide" role="tabpanel">
                <div className="bots-dashboard-onboarding-guide__intro">
                  <h3>{activeGuide.title}</h3>
                  <p>{activeGuide.summary}</p>
                </div>
                <div className="bots-dashboard-onboarding-grid">
                  <section>
                    <h4>Steps</h4>
                    <ol>
                      {activeGuide.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </section>
                  <section>
                    <h4>Commands & entries</h4>
                    {activeGuide.commands.map((command) => (
                      <div className="bots-dashboard-command" key={command.command}>
                        <div>
                          <strong>{command.label}</strong>
                          <small>{command.detail}</small>
                        </div>
                        <code>{command.command}</code>
                        <button type="button" onClick={() => void copyText(command.command)}>{copiedValue === command.command ? "Copied" : "Copy"}</button>
                      </div>
                    ))}
                  </section>
                </div>
              </article>
            </section>
          </>
        )}

        {(activeView === "overview" || activeView === "api") && (
          <section className="bots-dashboard-panel bots-dashboard-config-panel" aria-labelledby="bots-dashboard-config-title">
            <div className="bots-dashboard-section-heading">
              <div>
                <p className="bots-dashboard-kicker">Configurable Target</p>
                <h2 id="bots-dashboard-config-title">API Target & Probe Console</h2>
              </div>
              <div className="bots-dashboard-actions">
                <button type="button" onClick={() => void refreshRuntimeData()}>Refresh Status</button>
                <button type="button" onClick={() => void runPublicProbes()}>Run Public Probes</button>
              </div>
            </div>

            <div className="bots-dashboard-operator-grid">
              <div className="bots-dashboard-form-grid">
                <label className="bots-dashboard-field">
                  <span>Primary API origin</span>
                  <input value={prefs.apiBase} onChange={(event) => updatePrefs({ apiBase: event.target.value })} placeholder="http://localhost:4001 or https://api.example.com" />
                </label>
                <label className="bots-dashboard-field">
                  <span>Fallback API origins</span>
                  <textarea value={prefs.fallbackBases} onChange={(event) => updatePrefs({ fallbackBases: event.target.value })} placeholder="https://worker.example.workers.dev" rows={3} />
                </label>
                <label className="bots-dashboard-field">
                  <span>Generated Pages variable</span>
                  <span className="bots-dashboard-copy-row">
                    <code>{envSnippet || "VITE_API_BASES="}</code>
                    <button type="button" onClick={() => void copyText(envSnippet)}>{copiedValue === envSnippet ? "Copied" : "Copy"}</button>
                  </span>
                </label>
                <label className="bots-dashboard-field">
                  <span>Bearer token for signed probes</span>
                  <input value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} type="password" placeholder="Auto-loads from the standalone app when available" autoComplete="off" />
                </label>
                <div className="bots-dashboard-toggle-grid" aria-label="Console preferences">
                  <label><input type="checkbox" checked={prefs.compactEndpoints} onChange={(event) => updatePrefs({ compactEndpoints: event.target.checked })} /> Compact endpoint cards</label>
                  <label><input type="checkbox" checked={prefs.highContrast} onChange={(event) => updatePrefs({ highContrast: event.target.checked })} /> High contrast mode</label>
                  <label><input type="checkbox" checked={prefs.showAdvanced} onChange={(event) => updatePrefs({ showAdvanced: event.target.checked })} /> Show advanced maintenance</label>
                </div>
              </div>

              <div className="bots-dashboard-request-tool" aria-labelledby="bots-dashboard-request-title">
                <div className="bots-dashboard-request-tool__header">
                  <div>
                    <p className="bots-dashboard-kicker">Request Builder</p>
                    <h3 id="bots-dashboard-request-title">Send API Probe</h3>
                  </div>
                  <button type="button" onClick={() => void probeTarget(selectedProbe)}>Send</button>
                </div>
                <div className="bots-dashboard-form-grid bots-dashboard-form-grid--tight">
                  <label className="bots-dashboard-field">
                    <span>Probe</span>
                    <select value={selectedProbeId} onChange={(event) => setSelectedProbeId(event.target.value)}>
                      {DASHBOARD_PROBE_TARGETS.map((probe) => (
                        <option key={probe.id} value={probe.id}>{probe.label}{probe.requiresAuth ? " (Bearer)" : ""}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bots-dashboard-field">
                    <span>Endpoint</span>
                    <input value={`${selectedProbe.method} ${selectedProbe.path}`} readOnly />
                  </label>
                  {selectedProbe.method !== "GET" && (
                    <label className="bots-dashboard-field bots-dashboard-field--wide">
                      <span>JSON body</span>
                      <textarea value={requestBody} onChange={(event) => setRequestBody(event.target.value)} rows={7} spellCheck={false} />
                    </label>
                  )}
                </div>
                <p className="bots-dashboard-request-description">{selectedProbe.description}</p>
                <div className={`bots-dashboard-result bots-dashboard-result--${selectedProbeResult.status}`} role="status" aria-live="polite">
                  <strong>{selectedProbeResult.detail}</strong>
                  {selectedProbeResult.payload ? <pre>{selectedProbeResult.payload}</pre> : null}
                </div>
              </div>
            </div>

            <div className="bots-dashboard-probe-grid" aria-label="Quick probe results">
              {DASHBOARD_PROBE_TARGETS.map((probe) => {
                const result = probeResults[probe.id] ?? { status: "idle", detail: "Not run" };
                return (
                  <button key={probe.id} type="button" className={`bots-dashboard-probe bots-dashboard-probe--${result.status}`} onClick={() => void probeTarget(probe)}>
                    <span>{probe.label}</span>
                    <strong>{result.status}</strong>
                    <small>{result.detail}</small>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {(activeView === "overview" || activeView === "api") && (
          <section className="bots-dashboard-layout" aria-label="Bot API explorer">
            <aside className="bots-dashboard-rail">
              <p className="bots-dashboard-kicker">Bots</p>
              {DASHBOARD_BOTS.map((bot) => (
                <button
                  key={bot.id}
                  className={`bots-dashboard-bot bots-dashboard-bot--${bot.accent} ${bot.id === activeBotId ? "bots-dashboard-bot--active" : ""}`}
                  type="button"
                  aria-pressed={bot.id === activeBotId}
                  onClick={() => setActiveBotId(bot.id)}
                >
                  <span>
                    <strong>{bot.name}</strong>
                    <small>{bot.role}</small>
                  </span>
                  <em>{bot.status}</em>
                </button>
              ))}
            </aside>

            <div className="bots-dashboard-detail">
              <div className="bots-dashboard-detail__header">
                <div>
                  <p className="bots-dashboard-kicker">{activeBot.status}</p>
                  <h2>{activeBot.name}</h2>
                  <p>{activeBot.role}</p>
                </div>
                <div className="bots-dashboard-detail__stats">
                  <span><strong>{activeBot.apiCount}</strong> surfaces</span>
                  <span><strong>{activeBot.commandCount}</strong> commands</span>
                  <span>{activeBot.metric}</span>
                </div>
              </div>

              <div className="bots-dashboard-route-strip">
                <span>Primary entry</span>
                <code>{activeBot.route}</code>
                <button type="button" onClick={() => void copyText(activeBot.route)}>{copiedValue === activeBot.route ? "Copied" : "Copy"}</button>
              </div>

              {activeBot.id === "pazaak" && (
                <div className="bots-dashboard-callout" style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(224, 180, 107, 0.45)", background: "rgba(30, 40, 70, 0.35)" }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>Tournaments</strong>
                  <p style={{ margin: 0, fontSize: 14, opacity: 0.92 }}>
                    Single-elim, double-elim, and Swiss brackets run through <code>/pazaak tournament</code> in Discord and sync to the matchmaking worker REST API.
                    After you sign into the PazaakWorld Activity, use the <strong>Tournaments</strong> button in the main nav for live brackets and standings.
                  </p>
                </div>
              )}

              <div className="bots-dashboard-filter-bar" aria-label="Endpoint filters">
                <label>
                  <span>Search</span>
                  <input value={endpointSearch} onChange={(event) => setEndpointSearch(event.target.value)} placeholder="queue, oauth, sideboard, worker" />
                </label>
                <label>
                  <span>Method</span>
                  <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as "all" | DashboardMethod)}>
                    <option value="all">All</option>
                    {methodOptions.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>
                <label>
                  <span>Auth</span>
                  <select value={authFilter} onChange={(event) => setAuthFilter(event.target.value as "all" | "public" | "auth")}>
                    <option value="all">All</option>
                    <option value="public">Public</option>
                    <option value="auth">Authenticated</option>
                  </select>
                </label>
                <button type="button" onClick={() => void copyText(openApiSketch)}>{copiedValue === openApiSketch ? "Copied OpenAPI" : "Copy OpenAPI Sketch"}</button>
              </div>

              <p className="bots-dashboard-filter-summary">Showing {filteredEndpointGroups.reduce((sum, group) => sum + group.endpoints.length, 0)} of {totalEndpointCount} documented surfaces.</p>

              {filteredEndpointGroups.map((group) => (
                <section className="bots-dashboard-endpoint-group" key={`${group.botId}-${group.title}`}>
                  <div className="bots-dashboard-endpoint-group__heading">
                    <h3>{group.title}</h3>
                    <p>{group.summary}</p>
                  </div>
                  <div className="bots-dashboard-endpoints">
                    {group.endpoints.map((endpoint) => {
                      const routeKey = `${endpoint.method} ${endpoint.path}`;
                      const snippet = createEndpointSnippet(endpoint, prefs.apiBase);
                      return (
                        <article className="bots-dashboard-endpoint" key={`${group.title}-${routeKey}`}>
                          <div className="bots-dashboard-endpoint__route">
                            <span className={`bots-dashboard-method bots-dashboard-method--${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                            <code>{endpoint.path}</code>
                            <button type="button" onClick={() => void copyText(snippet)}>{copiedValue === snippet ? "Copied" : "Copy"}</button>
                          </div>
                          <p>{endpoint.description}</p>
                          <dl className="bots-dashboard-endpoint__docs">
                            <div><dt>Request</dt><dd>{endpoint.request}</dd></div>
                            <div><dt>Response</dt><dd>{endpoint.response}</dd></div>
                            <div><dt>Ops note</dt><dd>{endpoint.operations}</dd></div>
                          </dl>
                          <div className="bots-dashboard-endpoint__meta">
                            <span>{endpoint.scope}</span>
                            <span>{endpoint.auth}</span>
                            <span>{endpoint.availability}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

        {(activeView === "overview" || activeView === "setup") && (
          <section className="bots-dashboard-panel" aria-labelledby="bots-dashboard-setup-title">
            <div className="bots-dashboard-section-heading">
              <div>
                <p className="bots-dashboard-kicker">How To Operate</p>
                <h2 id="bots-dashboard-setup-title">Setup, Deploy & API Solutions</h2>
              </div>
            </div>

            <div className="bots-dashboard-solution-grid">
              {DASHBOARD_SOLUTIONS.map((solution) => (
                <article key={solution.title}>
                  <h3>{solution.title}</h3>
                  <p>{solution.fit}</p>
                  <small>{solution.tradeoff}</small>
                  <strong>{solution.action}</strong>
                </article>
              ))}
            </div>

            <div className="bots-dashboard-runbooks">
              <div className="bots-dashboard-runbook-tabs" role="tablist" aria-label="Runbook selector">
                {DASHBOARD_RUNBOOKS.map((runbook) => (
                  <button key={runbook.id} type="button" role="tab" aria-selected={activeRunbookId === runbook.id} onClick={() => setActiveRunbookId(runbook.id)}>
                    {runbook.title}
                  </button>
                ))}
              </div>

              <article className="bots-dashboard-runbook" role="tabpanel">
                <div className="bots-dashboard-runbook__header">
                  <div>
                    <h3>{activeRunbook.title}</h3>
                    <p>{activeRunbook.summary}</p>
                  </div>
                  <button type="button" onClick={() => void copyText(activeRunbook.commands.map((command) => command.command).join("\n"))}>
                    Copy Commands
                  </button>
                </div>
                <div className="bots-dashboard-runbook__grid">
                  <div>
                    <h4>Steps</h4>
                    <ol>
                      {activeRunbook.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </div>
                  <div>
                    <h4>Commands</h4>
                    {activeRunbook.commands.map((command) => (
                      <div className="bots-dashboard-command" key={command.command}>
                        <div>
                          <strong>{command.label}</strong>
                          <small>{command.detail}</small>
                        </div>
                        <code>{command.command}</code>
                        <button type="button" onClick={() => void copyText(command.command)}>{copiedValue === command.command ? "Copied" : "Copy"}</button>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4>Validation</h4>
                    <ul>
                      {activeRunbook.checks.map((check) => <li key={check}>{check}</li>)}
                    </ul>
                  </div>
                </div>
              </article>
            </div>
          </section>
        )}

        {(activeView === "overview" || activeView === "maintenance") && (
          <section className="bots-dashboard-panel bots-dashboard-maintenance" aria-labelledby="bots-dashboard-maintenance-title">
            <div className="bots-dashboard-section-heading">
              <div>
                <p className="bots-dashboard-kicker">Maintenance</p>
                <h2 id="bots-dashboard-maintenance-title">Readiness Checklist & Troubleshooting</h2>
              </div>
              <strong>{completedChecklistCount}/{DASHBOARD_CHECKLIST.length} complete</strong>
            </div>

            <div className="bots-dashboard-checklist">
              {DASHBOARD_CHECKLIST.map((item) => (
                <label key={item.id} className="bots-dashboard-checklist-item">
                  <input type="checkbox" checked={Boolean(checklistState[item.id])} onChange={() => toggleChecklistItem(item.id)} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                </label>
              ))}
            </div>

            <div className="bots-dashboard-problems">
              {COMMON_PROBLEMS.map((problem) => (
                <details key={problem.symptom}>
                  <summary>{problem.symptom}</summary>
                  <p><strong>Likely cause:</strong> {problem.cause}</p>
                  <p><strong>Fix:</strong> {problem.fix}</p>
                </details>
              ))}
            </div>

            {prefs.showAdvanced && (
              <div className="bots-dashboard-advanced">
                <h3>Advanced State Files</h3>
                <div className="bots-dashboard-command-grid">
                  {["data/pazaak-bot/accounts.json", "data/pazaak-bot/wallets.json", "data/pazaak-bot/custom-sideboards.json", "data/pazaak-bot/matchmaking-queue.json", "data/pazaak-bot/lobbies.json", "data/ingest-worker/reindex-queue.json"].map((file) => (
                    <code key={file}>{file}</code>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
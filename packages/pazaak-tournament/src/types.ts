// ---------------------------------------------------------------------------
// Tournament data types shared across the bot, the matchmaking worker, and the
// Activity. All tournament state is kept as a plain JSON-serializable graph so
// it can round-trip through JSON repositories, WebSocket broadcasts, and HTTP
// responses without bespoke (de)serialization.
// ---------------------------------------------------------------------------

export type TournamentFormat = "single_elim" | "double_elim" | "swiss";

export type TournamentStatus =
  | "registration"   // Open for sign-ups.
  | "active"         // Bracket/pairings generated; matches in progress.
  | "completed"      // Final match reported, champion determined.
  | "cancelled";     // Organizer cancelled before or during the event.

/** Lifecycle of a single bracket slot / swiss pairing. */
export type TournamentMatchState = "pending" | "active" | "reported" | "bye" | "cancelled";

export interface TournamentParticipant {
  userId: string;
  displayName: string;
  /** MMR at registration time — seeding input. */
  mmr: number;
  /** Assigned 1-based seed number once the bracket starts. */
  seed: number | null;
  /** Participant status — "eliminated" is sticky for single-elim, derived per-round for Swiss. */
  status: "registered" | "active" | "eliminated" | "withdrawn" | "champion";
  registeredAt: number;
}

export interface TournamentMatchRecord {
  id: string;
  /** Round number (1-based). */
  round: number;
  /** Match index within the round (0-based, used for bracket placement). */
  index: number;
  /** Which bracket this match lives in — for double-elim only. */
  bracket?: "winners" | "losers" | "grand_final" | "grand_final_reset";
  state: TournamentMatchState;
  /** Seat A participant id (never null on active brackets). `null` denotes an unresolved dependency. */
  participantAId: string | null;
  participantBId: string | null;
  winnerUserId: string | null;
  loserUserId: string | null;
  /** Engine match id (PazaakCoordinator) once the match has been scheduled. */
  engineMatchId: string | null;
  /** Wall-clock timestamps (ms since epoch). */
  scheduledAt: number | null;
  completedAt: number | null;
  /** Required for DE/SE to know where the loser goes next; null for Swiss. */
  winnerAdvancesToMatchId?: string | null;
  loserAdvancesToMatchId?: string | null;
}

export interface SwissStandingsRow {
  userId: string;
  displayName: string;
  seed: number | null;
  wins: number;
  losses: number;
  draws: number;
  /** Sum of opponents' wins (primary Swiss tiebreaker). */
  buchholz: number;
  /** Sum of defeated opponents' wins (secondary Swiss tiebreaker). */
  sonnebornBerger: number;
  /** Opponent user ids faced so far — prevents rematches in Swiss pairing. */
  opponentIds: string[];
  /** Participants on matching scores are grouped by this rank before tiebreakers fire. */
  matchPoints: number;
}

/** Authoritative state snapshot — the repository persists exactly this shape. */
export interface TournamentState {
  id: string;
  name: string;
  /** Discord guild/channel scope (for bot flows). Worker stores it verbatim. */
  guildId: string | null;
  channelId: string | null;
  /** User who opened the tournament. Admins may override. */
  organizerId: string;
  organizerName: string;
  format: TournamentFormat;
  /** Target sets-to-win per match (threaded into PazaakCoordinator.createDirectMatch). */
  setsPerMatch: number;
  /** Canonical vs wacky — passed to PazaakCoordinator when synthesizing matches. */
  gameMode: "canonical" | "wacky";
  /** Swiss only — total rounds. Ignored for SE/DE which are derived from the bracket. */
  rounds: number;
  /** Max participants (hard cap). Null = unlimited / organizer-enforced. */
  maxParticipants: number | null;
  status: TournamentStatus;
  currentRound: number;
  /** Participants indexed by user id for O(1) lookup. Serialized as the plain object. */
  participants: Record<string, TournamentParticipant>;
  /** Flat match list; bracket topology is encoded by `winnerAdvancesToMatchId`/`loserAdvancesToMatchId`. */
  matches: TournamentMatchRecord[];
  championUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentBracketColumn {
  round: number;
  bracket: NonNullable<TournamentMatchRecord["bracket"]> | "swiss";
  matches: readonly TournamentMatchRecord[];
}

/** Returned by the bracket visualizer helper — safe to render directly. */
export interface TournamentBracketView {
  columns: readonly TournamentBracketColumn[];
}

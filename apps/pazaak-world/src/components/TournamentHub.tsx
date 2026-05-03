import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cancelTournament,
  createTournament,
  fetchTournament,
  fetchTournaments,
  joinTournament,
  leaveTournament,
  reportTournamentMatch,
  startTournament,
  subscribeToTournaments,
} from "../api.ts";
import type {
  PazaakGameMode,
  SwissStandingsRowRecord,
  TournamentBracketViewRecord,
  TournamentFormat,
  TournamentMatchRecord,
  TournamentStateRecord,
} from "../types.ts";

interface TournamentHubProps {
  accessToken: string;
  currentUserId: string;
  initialTournamentId?: string | null;
  onBack: () => void;
}

interface DetailState {
  tournament: TournamentStateRecord;
  bracket: TournamentBracketViewRecord;
  standings: SwissStandingsRowRecord[] | null;
}

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elim: "Single Elimination",
  double_elim: "Double Elimination",
  swiss: "Swiss",
};

const MODE_LABELS: Record<PazaakGameMode, string> = {
  canonical: "Canonical",
  wacky: "Wacky",
};

/**
 * TournamentHub renders the list view, creation form, bracket, and Swiss
 * standings for Pazaak tournaments. It subscribes to the matchmaking worker
 * WebSocket so the bracket updates live when matches are reported.
 */
export function TournamentHub({ accessToken, currentUserId, initialTournamentId, onBack }: TournamentHubProps): JSX.Element {
  const [tournaments, setTournaments] = useState<TournamentStateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialTournamentId ?? null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await fetchTournaments(accessToken);
      setTournaments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingList(false);
    }
  }, [accessToken]);

  const refreshDetail = useCallback(async (tournamentId: string) => {
    setLoadingDetail(true);
    try {
      const next = await fetchTournament(accessToken, tournamentId);
      setDetail(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDetail(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void refreshDetail(selectedId);
  }, [selectedId, refreshDetail]);

  // Subscribe to the tournament DO for live updates while viewing details.
  useEffect(() => {
    if (!selectedId) return undefined;
    const unsubscribe = subscribeToTournaments(selectedId, () => {
      void refreshDetail(selectedId);
      void refreshList();
    });
    return unsubscribe;
  }, [selectedId, refreshDetail, refreshList]);

  const selectedTournament = detail?.tournament ?? null;
  const isOrganizer = selectedTournament?.organizerId === currentUserId;
  const isParticipant = selectedTournament ? Boolean(selectedTournament.participants[currentUserId]) : false;

  const handleCreate = async (input: { name: string; format: TournamentFormat; gameMode: PazaakGameMode; setsPerMatch: number; rounds: number }) => {
    try {
      const created = await createTournament(accessToken, input);
      setShowCreate(false);
      setSelectedId(created.id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleJoin = async () => {
    if (!selectedTournament) return;
    try {
      await joinTournament(accessToken, selectedTournament.id);
      await refreshDetail(selectedTournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLeave = async () => {
    if (!selectedTournament) return;
    try {
      await leaveTournament(accessToken, selectedTournament.id);
      await refreshDetail(selectedTournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStart = async () => {
    if (!selectedTournament) return;
    try {
      await startTournament(accessToken, selectedTournament.id);
      await refreshDetail(selectedTournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = async () => {
    if (!selectedTournament) return;
    if (!window.confirm(`Cancel "${selectedTournament.name}"? This cannot be undone.`)) return;
    try {
      await cancelTournament(accessToken, selectedTournament.id);
      await refreshDetail(selectedTournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReport = async (matchId: string, winnerUserId: string) => {
    if (!selectedTournament) return;
    try {
      await reportTournamentMatch(accessToken, selectedTournament.id, matchId, winnerUserId);
      await refreshDetail(selectedTournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="tournament-hub" style={styles.container}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.buttonSecondary}>← Back</button>
        <h1 style={styles.title}>Tournaments</h1>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowCreate((prev) => !prev)} style={styles.buttonPrimary}>
          {showCreate ? "Close" : "Create Tournament"}
        </button>
        <button type="button" onClick={() => void refreshList()} style={styles.buttonSecondary}>↻</button>
      </header>

      {error && <div style={styles.error}>{error} <button type="button" onClick={() => setError(null)} style={styles.inlineClear}>clear</button></div>}

      {showCreate && <CreateTournamentForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />}

      <div style={styles.grid}>
        <TournamentList
          tournaments={tournaments}
          selectedId={selectedId}
          loading={loadingList}
          currentUserId={currentUserId}
          onSelect={setSelectedId}
        />

        <section style={styles.detail}>
          {loadingDetail && !detail && <div style={styles.empty}>Loading tournament…</div>}
          {!selectedTournament && !loadingDetail && <div style={styles.empty}>Select a tournament to view the bracket.</div>}

          {selectedTournament && detail && (
            <TournamentDetail
              detail={detail}
              currentUserId={currentUserId}
              isOrganizer={isOrganizer}
              isParticipant={isParticipant}
              onJoin={handleJoin}
              onLeave={handleLeave}
              onStart={handleStart}
              onCancel={handleCancel}
              onReport={handleReport}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface CreateTournamentFormProps {
  onSubmit: (input: { name: string; format: TournamentFormat; gameMode: PazaakGameMode; setsPerMatch: number; rounds: number }) => void;
  onCancel: () => void;
}

function CreateTournamentForm({ onSubmit, onCancel }: CreateTournamentFormProps): JSX.Element {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single_elim");
  const [gameMode, setGameMode] = useState<PazaakGameMode>("canonical");
  const [setsPerMatch, setSetsPerMatch] = useState(3);
  const [rounds, setRounds] = useState(5);

  const canSubmit = name.trim().length > 0;

  return (
    <form
      style={styles.createForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: name.trim(), format, gameMode, setsPerMatch, rounds });
      }}
    >
      <label style={styles.label}>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          placeholder="Cantina Classic"
          style={styles.input}
        />
      </label>
      <label style={styles.label}>
        Format
        <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} style={styles.input}>
          <option value="single_elim">Single Elimination</option>
          <option value="double_elim">Double Elimination</option>
          <option value="swiss">Swiss</option>
        </select>
      </label>
      <label style={styles.label}>
        Game Mode
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value as PazaakGameMode)} style={styles.input}>
          <option value="canonical">Canonical (TSL)</option>
          <option value="wacky">Wacky</option>
        </select>
      </label>
      <label style={styles.label}>
        Sets per Match
        <input
          type="number"
          min={1}
          max={9}
          value={setsPerMatch}
          onChange={(e) => setSetsPerMatch(Math.max(1, Math.min(9, Number(e.target.value) || 3)))}
          style={styles.input}
        />
      </label>
      {format === "swiss" && (
        <label style={styles.label}>
          Rounds
          <input
            type="number"
            min={2}
            max={12}
            value={rounds}
            onChange={(e) => setRounds(Math.max(2, Math.min(12, Number(e.target.value) || 5)))}
            style={styles.input}
          />
        </label>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={!canSubmit} style={styles.buttonPrimary}>Create</button>
        <button type="button" onClick={onCancel} style={styles.buttonSecondary}>Cancel</button>
      </div>
    </form>
  );
}

interface TournamentListProps {
  tournaments: TournamentStateRecord[];
  selectedId: string | null;
  loading: boolean;
  currentUserId: string;
  onSelect: (id: string) => void;
}

function TournamentList({ tournaments, selectedId, loading, currentUserId, onSelect }: TournamentListProps): JSX.Element {
  return (
    <aside style={styles.list}>
      <div style={styles.listHeader}>Open & Active {loading && <span>· loading…</span>}</div>
      {tournaments.length === 0 && !loading && <div style={styles.empty}>No tournaments yet.</div>}
      {tournaments.map((entry) => {
        const selected = entry.id === selectedId;
        const participantCount = Object.keys(entry.participants).length;
        const joined = Boolean(entry.participants[currentUserId]);
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelect(entry.id)}
            style={{ ...styles.listItem, ...(selected ? styles.listItemSelected : null) }}
          >
            <div style={{ fontWeight: 600 }}>{entry.name}</div>
            <div style={styles.metaRow}>
              <span style={styles.pill}>{FORMAT_LABELS[entry.format]}</span>
              <span style={{ ...styles.pill, ...(entry.gameMode === "wacky" ? styles.pillWacky : null) }}>{MODE_LABELS[entry.gameMode]}</span>
              <span style={styles.pill}>{entry.status}</span>
              <span style={styles.metaSpan}>{participantCount} players</span>
              {joined && <span style={{ ...styles.pill, ...styles.pillJoined }}>You</span>}
            </div>
          </button>
        );
      })}
    </aside>
  );
}

interface TournamentDetailProps {
  detail: DetailState;
  currentUserId: string;
  isOrganizer: boolean;
  isParticipant: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onStart: () => void;
  onCancel: () => void;
  onReport: (matchId: string, winnerUserId: string) => void;
}

function TournamentDetail({ detail, currentUserId, isOrganizer, isParticipant, onJoin, onLeave, onStart, onCancel, onReport }: TournamentDetailProps): JSX.Element {
  const { tournament, bracket, standings } = detail;
  const championName = tournament.championUserId ? tournament.participants[tournament.championUserId]?.displayName ?? tournament.championUserId : null;

  return (
    <div>
      <header style={styles.detailHeader}>
        <div>
          <h2 style={{ margin: 0 }}>{tournament.name}</h2>
          <div style={styles.metaRow}>
            <span style={styles.pill}>{FORMAT_LABELS[tournament.format]}</span>
            <span style={{ ...styles.pill, ...(tournament.gameMode === "wacky" ? styles.pillWacky : null) }}>{MODE_LABELS[tournament.gameMode]}</span>
            <span style={styles.pill}>{tournament.status}</span>
            <span style={styles.metaSpan}>
              {Object.keys(tournament.participants).length} players ·{" "}
              sets to {tournament.setsPerMatch}
              {tournament.format === "swiss" ? ` · ${tournament.rounds} rounds` : ""}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tournament.status === "registration" && !isParticipant && <button type="button" onClick={onJoin} style={styles.buttonPrimary}>Register</button>}
          {tournament.status === "registration" && isParticipant && <button type="button" onClick={onLeave} style={styles.buttonSecondary}>Withdraw</button>}
          {tournament.status === "active" && isParticipant && <button type="button" onClick={onLeave} style={styles.buttonSecondary}>Forfeit</button>}
          {tournament.status === "registration" && isOrganizer && Object.keys(tournament.participants).length >= 2 && (
            <button type="button" onClick={onStart} style={styles.buttonPrimary}>Start Tournament</button>
          )}
          {isOrganizer && tournament.status !== "completed" && tournament.status !== "cancelled" && (
            <button type="button" onClick={onCancel} style={styles.buttonDanger}>Cancel</button>
          )}
        </div>
      </header>

      {championName && (
        <div style={styles.champion}>Champion: <strong>{championName}</strong></div>
      )}

      {tournament.format === "swiss"
        ? <SwissStandings standings={standings ?? []} currentUserId={currentUserId} />
        : <BracketCanvas bracket={bracket} tournament={tournament} />
      }

      <ActiveMatchesPanel
        tournament={tournament}
        currentUserId={currentUserId}
        isOrganizer={isOrganizer}
        onReport={onReport}
      />
    </div>
  );
}

interface SwissStandingsProps {
  standings: SwissStandingsRowRecord[];
  currentUserId: string;
}

function SwissStandings({ standings, currentUserId }: SwissStandingsProps): JSX.Element {
  if (standings.length === 0) {
    return <div style={styles.empty}>Standings will appear once matches are reported.</div>;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>#</th>
          <th style={styles.th}>Player</th>
          <th style={styles.th}>W-L-D</th>
          <th style={styles.th}>MP</th>
          <th style={styles.th}>Bchz</th>
          <th style={styles.th}>SB</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((row, index) => (
          <tr key={row.userId} style={row.userId === currentUserId ? styles.tableRowMe : undefined}>
            <td style={styles.td}>{index + 1}</td>
            <td style={styles.td}>{row.displayName}</td>
            <td style={styles.td}>{row.wins}-{row.losses}-{row.draws}</td>
            <td style={styles.td}>{row.matchPoints}</td>
            <td style={styles.td}>{row.buchholz.toFixed(1)}</td>
            <td style={styles.td}>{row.sonnebornBerger.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface BracketCanvasProps {
  bracket: TournamentBracketViewRecord;
  tournament: TournamentStateRecord;
}

function BracketCanvas({ bracket, tournament }: BracketCanvasProps): JSX.Element {
  const columnWidth = 200;
  const matchHeight = 60;
  const matchGap = 16;
  const horizontalGap = 40;

  // Group columns by bracket so we can stack losers beneath winners when SE.
  const columns = bracket.columns;
  const tallestColumn = columns.reduce((max, col) => Math.max(max, col.matches.length), 0);
  const svgHeight = Math.max(200, tallestColumn * (matchHeight + matchGap) + 40);
  const svgWidth = Math.max(columnWidth, columns.length * (columnWidth + horizontalGap));

  const resolveName = (userId: string | null): string => {
    if (!userId) return "TBD";
    const participant = tournament.participants[userId];
    return participant?.displayName ?? userId;
  };

  if (columns.length === 0) {
    return <div style={styles.empty}>Bracket will appear when the tournament starts.</div>;
  }

  return (
    <div style={{ overflowX: "auto", background: "#111", borderRadius: 8, padding: 12 }}>
      <svg width={svgWidth} height={svgHeight} aria-label="Bracket visualization">
        {columns.map((column, columnIndex) => (
          <g key={`${column.bracket}-${column.round}`} transform={`translate(${columnIndex * (columnWidth + horizontalGap)}, 20)`}>
            <text x={0} y={0} fill="#e0c77b" fontSize={12} fontFamily="monospace">
              {column.bracket === "swiss"
                ? `Round ${column.round}`
                : column.bracket === "grand_final"
                  ? "Grand Final"
                  : column.bracket === "grand_final_reset"
                    ? "GF Reset"
                    : `${column.bracket[0]!.toUpperCase()}${column.bracket.slice(1)} R${column.round}`}
            </text>
            {column.matches.map((match, matchIndex) => {
              const y = matchIndex * (matchHeight + matchGap) + 12;
              return (
                <g key={match.id} transform={`translate(0, ${y})`}>
                  <rect width={columnWidth - 10} height={matchHeight} fill="#1a1a2e" stroke="#333" rx={4} />
                  <text x={8} y={24} fill="#e0c77b" fontSize={13} fontFamily="monospace">
                    {resolveName(match.participantAId)}{match.winnerUserId === match.participantAId && match.participantAId ? " ✓" : ""}
                  </text>
                  <text x={8} y={48} fill="#e0c77b" fontSize={13} fontFamily="monospace">
                    {match.participantBId ? resolveName(match.participantBId) : "BYE"}{match.winnerUserId === match.participantBId && match.participantBId ? " ✓" : ""}
                  </text>
                  <text x={columnWidth - 22} y={matchHeight - 6} fill="#666" fontSize={10} fontFamily="monospace" textAnchor="end">
                    {match.state}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

interface ActiveMatchesPanelProps {
  tournament: TournamentStateRecord;
  currentUserId: string;
  isOrganizer: boolean;
  onReport: (matchId: string, winnerUserId: string) => void;
}

function ActiveMatchesPanel({ tournament, currentUserId, isOrganizer, onReport }: ActiveMatchesPanelProps): JSX.Element | null {
  const activeMatches = useMemo(
    () => tournament.matches.filter((match) => match.state === "active"),
    [tournament.matches],
  );
  if (activeMatches.length === 0) return null;

  const resolveName = (userId: string | null) => {
    if (!userId) return "TBD";
    return tournament.participants[userId]?.displayName ?? userId;
  };

  return (
    <section style={styles.panel}>
      <h3 style={{ margin: "12px 0" }}>Active Matches</h3>
      {activeMatches.map((match: TournamentMatchRecord) => {
        const isMine = match.participantAId === currentUserId || match.participantBId === currentUserId;
        if (!isMine && !isOrganizer) return null;
        return (
          <div key={match.id} style={styles.matchRow}>
            <div style={{ fontFamily: "monospace" }}>
              {resolveName(match.participantAId)} vs {resolveName(match.participantBId)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {match.participantAId && (
                <button
                  type="button"
                  onClick={() => onReport(match.id, match.participantAId!)}
                  style={styles.buttonSecondary}
                >
                  Report {resolveName(match.participantAId)} won
                </button>
              )}
              {match.participantBId && (
                <button
                  type="button"
                  onClick={() => onReport(match.id, match.participantBId!)}
                  style={styles.buttonSecondary}
                >
                  Report {resolveName(match.participantBId)} won
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles (kept inline so the component works standalone)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, maxWidth: 1200, margin: "0 auto", color: "#e0c77b" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { margin: 0, fontSize: 24 },
  grid: { display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" },
  list: { background: "#0a0a14", border: "1px solid #222", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 },
  listHeader: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  listItem: { textAlign: "left", background: "#111120", border: "1px solid #222", borderRadius: 6, padding: 10, cursor: "pointer", color: "inherit" },
  listItemSelected: { background: "#1a1a2e", borderColor: "#e0c77b" },
  detail: { background: "#0a0a14", border: "1px solid #222", borderRadius: 8, padding: 16, minHeight: 400 },
  detailHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  empty: { textAlign: "center", color: "#666", padding: 40 },
  error: { background: "#3a1a1a", border: "1px solid #5a2a2a", borderRadius: 6, padding: 8, margin: "8px 0", color: "#f0a0a0" },
  inlineClear: { marginLeft: 8, background: "transparent", border: "1px solid #888", color: "#f0a0a0", padding: "2px 6px", borderRadius: 4, cursor: "pointer" },
  createForm: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, background: "#111120", padding: 16, borderRadius: 8, marginBottom: 16 },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 },
  input: { padding: 6, background: "#0a0a14", border: "1px solid #333", borderRadius: 4, color: "inherit", fontSize: 14 },
  buttonPrimary: { padding: "8px 14px", background: "#e0c77b", color: "#111", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 },
  buttonSecondary: { padding: "8px 14px", background: "#1a1a2e", color: "#e0c77b", border: "1px solid #333", borderRadius: 4, cursor: "pointer" },
  buttonDanger: { padding: "8px 14px", background: "#3a1a1a", color: "#f0a0a0", border: "1px solid #5a2a2a", borderRadius: 4, cursor: "pointer" },
  pill: { background: "#1a1a2e", border: "1px solid #333", borderRadius: 10, padding: "2px 8px", fontSize: 11 },
  pillWacky: { borderColor: "#c77be0", color: "#c77be0" },
  pillJoined: { borderColor: "#7bc77b", color: "#7bc77b" },
  metaRow: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4, fontSize: 12 },
  metaSpan: { color: "#888", fontSize: 12 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 12, fontFamily: "monospace" },
  th: { padding: 6, textAlign: "left", borderBottom: "1px solid #333", color: "#888", fontSize: 11 },
  td: { padding: 6, borderBottom: "1px solid #222" },
  tableRowMe: { background: "#1a1a2e" },
  champion: { padding: 12, background: "#3a3a1a", border: "1px solid #e0c77b", borderRadius: 4, marginBottom: 12 },
  panel: { marginTop: 16, background: "#111120", border: "1px solid #222", borderRadius: 8, padding: 12 },
  matchRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, borderBottom: "1px solid #222", gap: 12, flexWrap: "wrap" },
};

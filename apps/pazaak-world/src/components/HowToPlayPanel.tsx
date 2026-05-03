import type { CSSProperties, JSX } from "react";
import { useMemo, useState } from "react";
import {
  PAZAAK_RULEBOOK,
  getBustProbabilityFromTable,
  type RulebookCardEntry,
  type RulebookGameMode,
} from "@openkotor/pazaak-engine";

type Tab = "basics" | "cards" | "strategy" | "modes" | "tournaments" | "ratings";

const TAB_ORDER: readonly Tab[] = ["basics", "cards", "strategy", "modes", "tournaments", "ratings"];

const TAB_LABELS: Record<Tab, string> = {
  basics: "Basics",
  cards: "Card Reference",
  strategy: "Strategy",
  modes: "Game Modes",
  tournaments: "Tournaments",
  ratings: "Ratings",
};

const RARITY_LABEL: Record<RulebookCardEntry["rarity"], string> = {
  starter: "Starter",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare · Gold",
  wacky_only: "Wacky-only",
};

export interface HowToPlayPanelProps {
  onClose?: () => void;
  defaultTab?: Tab;
}

export function HowToPlayPanel({ onClose, defaultTab = "basics" }: HowToPlayPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <strong style={{ fontSize: 18 }}>How to Play Pazaak</strong>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Authoritative rulebook — every surface renders from the same source.</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={styles.closeBtn}>Close</button>
        )}
      </header>

      <nav style={styles.tabs} role="tablist" aria-label="Rulebook sections">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <section style={styles.body} role="tabpanel" aria-label={TAB_LABELS[activeTab]}>
        {activeTab === "basics" && <BasicsTab />}
        {activeTab === "cards" && <CardsTab />}
        {activeTab === "strategy" && <StrategyTab />}
        {activeTab === "modes" && <ModesTab />}
        {activeTab === "tournaments" && <TournamentsTab />}
        {activeTab === "ratings" && <RatingsTab />}
      </section>
    </div>
  );
}

function BasicsTab(): JSX.Element {
  const { basics, deckLimits } = PAZAAK_RULEBOOK;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14 }}>
        First to <strong>{deckLimits.setsToWin} sets</strong> wins. Each set aims closer to{" "}
        <strong>{deckLimits.winScore}</strong> without busting.
      </p>
      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {basics.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            <div style={{ opacity: 0.85 }}>{step.body}</div>
          </li>
        ))}
      </ol>
      <small style={{ opacity: 0.6 }}>
        Hand size {deckLimits.handSize}, sideboard size {deckLimits.sideDeckSize}, board caps at{" "}
        {deckLimits.maxBoardSize} cards. Five consecutive ties force the match onto set-win tiebreakers.
      </small>
    </div>
  );
}

function CardsTab(): JSX.Element {
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<RulebookGameMode | "all">("all");
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return PAZAAK_RULEBOOK.cards.filter((card) => {
      if (modeFilter !== "all" && card.gameMode !== modeFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        card.token,
        card.displayLabel,
        card.canonicalTslLabel ?? "",
        card.engineType,
        card.mechanic,
        card.whenToUse,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, modeFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search token, label, or mechanic…"
          style={styles.searchInput}
          aria-label="Search card reference"
        />
        <select
          value={modeFilter}
          onChange={(event) => setModeFilter(event.target.value as RulebookGameMode | "all")}
          style={styles.select}
          aria-label="Filter by game mode"
        >
          <option value="all">All modes</option>
          <option value="canonical">Canonical only</option>
          <option value="wacky">Wacky-only</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {filtered.map((card) => (
          <article key={card.token} style={styles.cardRow}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <strong style={{ fontSize: 16 }}>
                <code style={styles.token}>{card.token}</code> {card.displayLabel}
              </strong>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {RARITY_LABEL[card.rarity]}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ ...styles.pill, ...(card.gameMode === "wacky" ? styles.pillWacky : styles.pillCanonical) }}>
                {card.gameMode === "wacky" ? "Wacky" : "Canonical"}
              </span>
              <span style={styles.pill}>Limit {card.sideboardLimit}</span>
              <span style={styles.pill}>Tier {card.tierScore}</span>
            </div>
            <p style={{ margin: "8px 0 4px", fontSize: 13 }}>{card.mechanic}</p>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>
              <em>When to use:</em> {card.whenToUse}
            </p>
            {card.tslNotes && (
              <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.6 }}>TSL: {card.tslNotes}</p>
            )}
          </article>
        ))}
        {filtered.length === 0 && (
          <p style={{ opacity: 0.6, fontStyle: "italic" }}>No cards match your filter.</p>
        )}
      </div>
    </div>
  );
}

function StrategyTab(): JSX.Element {
  const { strategy, deckLimits } = PAZAAK_RULEBOOK;
  const [highlight, setHighlight] = useState<number>(14);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {strategy.map((note) => (
          <article key={note.title} style={styles.strategyCard}>
            <strong>{note.title}</strong>
            <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.9 }}>{note.body}</p>
          </article>
        ))}
      </div>

      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <strong>Your total:</strong>
          <input
            type="range"
            min={0}
            max={20}
            value={highlight}
            onChange={(event) => setHighlight(Number(event.target.value))}
            style={{ flex: 1 }}
            aria-label="Current board total"
          />
          <output>{highlight}</output>
          <span style={{ opacity: 0.75 }}>
            Next-draw bust: <strong>{Math.round(getBustProbabilityFromTable(highlight) * 100)}%</strong>
          </span>
        </label>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96 }}>
          {deckLimits.bustProbabilityTable.map((probability, total) => {
            const active = total === highlight;
            const height = Math.max(3, Math.round(probability * 96));
            return (
              <div
                key={total}
                title={`Total ${total}: ${Math.round(probability * 100)}% bust`}
                style={{
                  flex: 1,
                  height,
                  background: active ? "#e0b46b" : probability > 0 ? "#475a7d" : "#2a3650",
                  borderRadius: 2,
                  transition: "background 120ms",
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.5, marginTop: 2 }}>
          <span>0</span><span>10</span><span>20</span>
        </div>
      </div>
    </div>
  );
}

function ModesTab(): JSX.Element {
  const { gameModes } = PAZAAK_RULEBOOK;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {gameModes.map((mode) => (
        <article key={mode.id} style={styles.modeCard}>
          <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 16 }}>{mode.title}</strong>
            <span style={{ ...styles.pill, ...(mode.id === "wacky" ? styles.pillWacky : styles.pillCanonical) }}>
              {mode.id}
            </span>
          </header>
          <p style={{ margin: "8px 0 4px" }}>{mode.summary}</p>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{mode.contract}</p>
        </article>
      ))}
    </div>
  );
}

function RatingsTab(): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, lineHeight: 1.55 }}>
      <p style={{ margin: 0 }}>
        <strong>Chess.com (reference).</strong> Their help center describes <strong>Glicko-style</strong> ratings (not “pure Elo”): a displayed rating plus{" "}
        <a href="https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com" style={{ color: "#aed4ff" }} target="_blank" rel="noreferrer">
          rating deviation (RD)
        </a>
        {" "}as confidence—high RD means larger possible swings until the system is sure of your strength. Upsets move you more than narrow wins against similar opponents.
      </p>
      <p style={{ margin: 0 }}>
        <strong>PazaakWorld MMR (implementation).</strong> We keep the same <em>ideas</em>—expected score from the rating gap, and separate RD—but use a <strong>single-game Elo-style step</strong> suitable for server-authoritative JSON wallets (no multi-game rating batches yet):
      </p>
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <li>
          <strong>MMR</strong> starts at <code style={styles.token}>1000</code>. After each ranked head-to-head settlement, we update both players from the pre-match snapshot so ordering does not matter.
        </li>
        <li>
          <strong>Expected score</strong> for the player:{" "}
          <code style={styles.token}>E = 1 / (1 + 10^((opponentMmr − yourMmr) / 400))</code> — standard Elo logistic.
        </li>
        <li>
          <strong>K-factor</strong> scales with your RD and nudges up slightly if the opponent&apos;s RD is high (uncertain opponent ⇒ slightly wider swings):{" "}
          <code style={styles.token}>K = min(44, (16 + 24·RD/350) · (1 + 0.2·RD_opp/350))</code>.
        </li>
        <li>
          <strong>MMR delta</strong>: <code style={styles.token}>round(K · (S − E))</code> where <code style={styles.token}>S</code> is 1 if you won or 0 if you lost. MMR is floored at zero.
        </li>
        <li>
          <strong>RD</strong> starts at <code style={styles.token}>350</code> (Chess.com cites high RD for brand-new ratings). After each game:{" "}
          <code style={styles.token}>RD ← clamp(0.964 · RD − 3, 60, 350)</code> so provisional accounts stabilize over time.
        </li>
      </ul>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
        Authoritative code: <code style={styles.token}>@openkotor/pazaak-rating</code> (pure math) and{" "}
        <code style={styles.token}>JsonWalletRepository.recordMatch</code> in <code style={styles.token}>@openkotor/persistence</code>.
        Tournament seeding and leaderboards still sort by MMR.
      </p>
    </div>
  );
}

function TournamentsTab(): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0 }}>
        Pazaak now supports single-elimination, double-elimination, and Swiss tournaments. Seeding uses your
        MMR, byes are filled automatically for non-power-of-two brackets, and every match is auto-scheduled
        through the shared Pazaak coordinator.
      </p>
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        <li><strong>Create</strong> a tournament from the Tournaments button on the main menu or via <code>/pazaak tournament create</code> in Discord.</li>
        <li><strong>Join</strong> with <code>/pazaak tournament join</code> or the Register button.</li>
        <li><strong>Report</strong> matches via <code>/pazaak tournament report</code>; the bracket advances automatically.</li>
        <li><strong>Moderators</strong> can force-report or reseed using <code>/pazaak-admin tournament</code>.</li>
      </ul>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 16,
    borderRadius: 12,
    background: "linear-gradient(135deg, #111625 0%, #1d2540 100%)",
    color: "#e5ecf8",
    border: "1px solid #2a3a5c",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  closeBtn: {
    background: "transparent",
    border: "1px solid #3d4d70",
    color: "#e5ecf8",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  tabs: { display: "flex", gap: 4, flexWrap: "wrap" },
  tab: {
    background: "transparent",
    color: "#b5c2dc",
    border: "1px solid #2f3d5c",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  tabActive: { background: "#2a3d6b", color: "#f7d68d", borderColor: "#e0b46b" },
  body: {
    background: "rgba(9, 15, 30, 0.45)",
    border: "1px solid #21304d",
    borderRadius: 10,
    padding: 14,
    minHeight: 220,
  },
  searchInput: {
    flex: 1,
    minWidth: 220,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #2f3d5c",
    background: "#0e1324",
    color: "#e5ecf8",
  },
  select: {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #2f3d5c",
    background: "#0e1324",
    color: "#e5ecf8",
  },
  cardRow: {
    border: "1px solid #22304e",
    borderRadius: 8,
    padding: 10,
    background: "rgba(14, 21, 40, 0.6)",
  },
  strategyCard: {
    border: "1px solid #22304e",
    borderRadius: 8,
    padding: 12,
    background: "rgba(14, 21, 40, 0.6)",
  },
  modeCard: {
    border: "1px solid #22304e",
    borderRadius: 8,
    padding: 12,
    background: "rgba(14, 21, 40, 0.6)",
  },
  pill: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(70, 90, 130, 0.4)",
    border: "1px solid rgba(90, 120, 180, 0.5)",
  },
  pillWacky: { background: "rgba(150, 90, 50, 0.35)", borderColor: "rgba(224, 180, 107, 0.8)", color: "#f6d08a" },
  pillCanonical: { background: "rgba(50, 90, 130, 0.35)", borderColor: "rgba(120, 170, 220, 0.8)", color: "#aed4ff" },
  token: { background: "#0b1224", padding: "2px 6px", borderRadius: 4, border: "1px solid #2a3a5c", fontSize: 13 },
};

import { useState, useRef, useEffect, useCallback } from "react";
import {
  askTrask,
  fetchTraskHistory,
  fetchTraskSources,
  type TraskQueryRecord,
  type TraskSourceRecord,
} from "../api.ts";

const SOURCE_KIND_LABEL: Record<TraskSourceRecord["kind"], string> = {
  website: "Web",
  github: "GitHub",
  discord: "Discord",
};

function SourceBadge({ kind }: { kind: TraskSourceRecord["kind"] }) {
  return (
    <span
      className={`trask-source-badge trask-source-badge--${kind}`}
      aria-label={`Source type: ${SOURCE_KIND_LABEL[kind]}`}
    >
      {SOURCE_KIND_LABEL[kind]}
    </span>
  );
}

function QueryItem({
  record,
  isActive,
  onClick,
}: {
  record: TraskQueryRecord;
  isActive: boolean;
  onClick: () => void;
}) {
  const short = record.query.length > 60 ? `${record.query.slice(0, 60)}…` : record.query;
  return (
    <button
      type="button"
      className={`trask-history-item${isActive ? " trask-history-item--active" : ""}`}
      onClick={onClick}
      title={record.query}
    >
      <span className="trask-history-item__query">{short}</span>
      <span className={`trask-history-item__status trask-history-item__status--${record.status}`}>
        {record.status}
      </span>
    </button>
  );
}

function AnswerBubble({ record }: { record: TraskQueryRecord }) {
  const hasSources = record.sources.length > 0;

  return (
    <div className="trask-exchange">
      <div className="trask-exchange__question">
        <span className="trask-exchange__label">You</span>
        <p className="trask-exchange__text">{record.query}</p>
      </div>

      <div className={`trask-exchange__answer trask-exchange__answer--${record.status}`}>
        <span className="trask-exchange__label">Trask</span>
        {record.status === "pending" && (
          <p className="trask-exchange__text trask-exchange__text--pending">
            <span className="trask-thinking" aria-live="polite">Researching…</span>
          </p>
        )}
        {record.status === "failed" && (
          <p className="trask-exchange__text trask-exchange__text--error">
            {record.error ?? "An error occurred. Please try again."}
          </p>
        )}
        {record.status === "complete" && record.answer != null && (
          <>
            <p className="trask-exchange__text">{record.answer}</p>
            {hasSources && (
              <ul className="trask-exchange__sources" aria-label="Sources consulted">
                {record.sources.map((src) => (
                  <li key={src.id}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="trask-source-link"
                    >
                      {src.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface TraskScreenProps {
  accessToken: string;
  onBack: () => void;
}

export function TraskScreen({ accessToken, onBack }: TraskScreenProps) {
  const [history, setHistory] = useState<TraskQueryRecord[]>([]);
  const [sources, setSources] = useState<TraskSourceRecord[]>([]);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const exchangeEndRef = useRef<HTMLDivElement>(null);

  // Load history and sources on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [hist, srcs] = await Promise.all([
          fetchTraskHistory(accessToken, 50),
          fetchTraskSources(accessToken).catch(() => [] as TraskSourceRecord[]),
        ]);
        if (cancelled) return;
        setHistory(hist);
        setSources(srcs);
        if (hist.length > 0) {
          setActiveQueryId(hist[hist.length - 1]!.queryId);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load history.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Scroll to bottom when active exchange changes.
  useEffect(() => {
    exchangeEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeQueryId, history]);

  const activeRecord = history.find((r) => r.queryId === activeQueryId) ?? null;

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || submitting) return;

    setInput("");
    setSubmitting(true);
    setLoadError(null);

    // Optimistic pending record.
    const optimisticId = `pending-${Date.now()}`;
    const optimistic: TraskQueryRecord = {
      queryId: optimisticId,
      userId: "",
      query: trimmed,
      status: "pending",
      answer: null,
      sources: [],
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    setHistory((prev) => [...prev, optimistic]);
    setActiveQueryId(optimisticId);

    try {
      const result = await askTrask(accessToken, trimmed);
      setHistory((prev) =>
        prev.map((r) => (r.queryId === optimisticId ? result : r))
      );
      setActiveQueryId(result.queryId);
    } catch (err) {
      const failed: TraskQueryRecord = {
        ...optimistic,
        status: "failed",
        error: err instanceof Error ? err.message : "Request failed.",
      };
      setHistory((prev) =>
        prev.map((r) => (r.queryId === optimisticId ? failed : r))
      );
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [accessToken, input, submitting]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="pazaak-world-page trask-screen">
      {/* Navigation bar */}
      <nav className="pazaak-world-nav trask-nav">
        <div className="pazaak-world-brand">
          <span aria-hidden="true">◉</span>
          Trask Q&amp;A
        </div>
        <div className="pazaak-world-nav__right trask-nav__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setShowSources((v) => !v)}
            aria-expanded={showSources}
          >
            {showSources ? "Hide Sources" : `Sources (${sources.length})`}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ← Back
          </button>
        </div>
      </nav>

      {/* Sources panel */}
      {showSources && (
        <aside className="trask-sources-panel" aria-label="Available knowledge sources">
          <h2 className="trask-sources-panel__title">Knowledge Sources</h2>
          {sources.length === 0 ? (
            <p className="trask-sources-panel__empty">No sources configured.</p>
          ) : (
            <ul className="trask-sources-list">
              {sources.map((src) => (
                <li key={src.id} className="trask-source-entry">
                  <div className="trask-source-entry__header">
                    <a
                      href={src.homeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="trask-source-entry__name"
                    >
                      {src.name}
                    </a>
                    <SourceBadge kind={src.kind} />
                  </div>
                  <p className="trask-source-entry__desc">{src.description}</p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      <div className="trask-body">
        {/* Sidebar: history */}
        <aside className="trask-sidebar" aria-label="Question history">
          <div className="trask-sidebar__header">
            <span className="trask-sidebar__title">History</span>
            {history.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost btn--sm trask-sidebar__new-btn"
                onClick={() => {
                  setActiveQueryId(null);
                  setInput("");
                  inputRef.current?.focus();
                }}
              >
                + New
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="trask-sidebar__empty">No questions yet.</p>
          ) : (
            <ul className="trask-history-list">
              {[...history].reverse().map((record) => (
                <li key={record.queryId}>
                  <QueryItem
                    record={record}
                    isActive={record.queryId === activeQueryId}
                    onClick={() => setActiveQueryId(record.queryId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main panel */}
        <main className="trask-main">
          {loadError && (
            <div className="trask-error-banner" role="alert">
              {loadError}
            </div>
          )}

          <div className="trask-exchange-area" aria-live="polite" aria-atomic="false">
            {activeRecord == null ? (
              <div className="trask-welcome">
                <span className="trask-welcome__icon" aria-hidden="true">◉</span>
                <h1 className="trask-welcome__title">Ask Trask</h1>
                <p className="trask-welcome__subtitle">
                  Get answers about KOTOR modding, lore, and technical questions sourced from
                  the OpenKOTOR knowledge base.
                </p>
              </div>
            ) : (
              <AnswerBubble record={activeRecord} />
            )}
            <div ref={exchangeEndRef} aria-hidden="true" />
          </div>

          {/* Input form */}
          <form
            className="trask-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <textarea
              ref={inputRef}
              className="trask-input-form__textarea"
              placeholder="Ask a question about KOTOR modding, lore, or technical details… (Enter to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              disabled={submitting}
              aria-label="Question input"
              maxLength={2000}
            />
            <div className="trask-input-form__footer">
              <span className="trask-input-form__hint">
                {input.length > 0 ? `${input.length} / 2000` : "Shift+Enter for new line"}
              </span>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || input.trim().length === 0}
                aria-busy={submitting}
              >
                {submitting ? "Researching…" : "Ask"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

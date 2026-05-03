import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { PAZAAK_RULEBOOK, getCardReference } from "@openkotor/pazaak-engine";
import type { SavedSideboardCollectionRecord } from "../types.ts";
import { deleteSideboard, fetchMe, fetchSideboards, openRewardCrate, saveSideboard, setActiveSideboard } from "../api.ts";

const DEFAULT_TOKENS = ["+1", "-2", "*3", "$$", "TT", "F1", "F2", "VV", "+4", "-5"];
const EMPTY_SLOT_TOKEN = "__locked__";
const SUPPORTED_TOKENS = PAZAAK_RULEBOOK.cards.map((card) => card.token);
const TOKEN_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  PAZAAK_RULEBOOK.cards.map((card) => [card.token, `${card.displayLabel} — ${card.mechanic}`]),
);
const STANDARD_TOKEN_LIMIT = 4;
const SPECIAL_TOKEN_LIMIT = 1;

interface SideboardWorkshopProps {
  accessToken: string;
  username: string;
  onBack: () => void;
}

export function SideboardWorkshop({ accessToken, username, onBack }: SideboardWorkshopProps) {
  const [collection, setCollection] = useState<SavedSideboardCollectionRecord | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftTokens, setDraftTokens] = useState<string[]>([...DEFAULT_TOKENS]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [crateStandard, setCrateStandard] = useState(0);
  const [cratePremium, setCratePremium] = useState(0);
  const [openingCrate, setOpeningCrate] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const ownedTokens = collection?.ownedSideDeckTokens ?? [];
  const ownedTokenCounts = countTokens(ownedTokens);
  const noUnlockedCards = ownedTokens.length === 0;

  const selectedSideboard = collection?.sideboards.find((sideboard) => sideboard.name === selectedName) ?? null;
  const normalizedDraftName = normalizeBoardName(draftName);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLocaleLowerCase();
  const filteredSideboards = collection?.sideboards.filter((sideboard) => {
    return normalizedSearchQuery.length === 0 || sideboard.name.toLocaleLowerCase().includes(normalizedSearchQuery);
  }) ?? [];
  const tokenDirty = selectedSideboard === null
    ? draftTokens.join("|") !== buildDefaultDraftTokens(ownedTokens).join("|")
    : draftTokens.join("|") !== selectedSideboard.tokens.join("|");
  const contentDirty = selectedSideboard === null
    ? normalizedDraftName.length > 0 || tokenDirty
    : tokenDirty;
  const renameDirty = selectedSideboard !== null && normalizedDraftName.length > 0 && normalizedDraftName !== selectedSideboard.name;
  const hasUnsavedChanges = contentDirty || renameDirty;
  const selectedBoardVisible = selectedSideboard !== null
    ? filteredSideboards.some((sideboard) => sideboard.name === selectedSideboard.name)
    : false;
  const validation = buildValidationSummary(draftTokens, ownedTokens);
  const hasValidationErrors = validation.errors.length > 0;

  const syncDraft = useCallback((nextCollection: SavedSideboardCollectionRecord, nextSelectedName: string | null) => {
    setSelectedName(nextSelectedName);

    const selected = nextCollection.sideboards.find((sideboard) => sideboard.name === nextSelectedName) ?? null;

    if (selected) {
      setDraftName(selected.name);
      setDraftTokens([...selected.tokens]);
      return;
    }

    setDraftName("");
    setDraftTokens(buildDefaultDraftTokens(nextCollection.ownedSideDeckTokens));
  }, []);

  const loadSideboards = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextCollection, me] = await Promise.all([fetchSideboards(accessToken), fetchMe(accessToken)]);
      setCollection(nextCollection);
      setCrateStandard(me.wallet.unopenedCratesStandard ?? 0);
      setCratePremium(me.wallet.unopenedCratesPremium ?? 0);
      const fallback = nextCollection.sideboards.find((sideboard) => sideboard.isActive)?.name
        ?? nextCollection.sideboards[0]?.name
        ?? null;
      syncDraft(nextCollection, fallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken, syncDraft]);

  useEffect(() => {
    void loadSideboards();
  }, [loadSideboards]);

  useEffect(() => {
    if (!collection) {
      return;
    }

    const fallback = collection.sideboards.find((sideboard) => sideboard.isActive)?.name
      ?? collection.sideboards[0]?.name
      ?? null;

    if (!selectedName || !collection.sideboards.some((sideboard) => sideboard.name === selectedName)) {
      syncDraft(collection, fallback);
    }
  }, [collection, selectedName, syncDraft]);

  const updateDraftToken = (index: number, token: string) => {
    setDraftTokens((prev) => prev.map((entry, entryIndex) => entryIndex === index ? token : entry));
  };

  const createBoardName = (baseName: string): string => {
    const existingNames = new Set((collection?.sideboards ?? []).map((sideboard) => sideboard.name.toLocaleLowerCase()));

    if (!existingNames.has(baseName.toLocaleLowerCase())) {
      return baseName;
    }

    let suffix = 2;
    while (existingNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
      suffix += 1;
    }

    return `${baseName} ${suffix}`;
  };

  const hasNameConflict = (name: string, ignoreName?: string | null): boolean => {
    const ignoredName = ignoreName?.toLocaleLowerCase();

    return (collection?.sideboards ?? []).some((sideboard) => {
      const nextName = sideboard.name.toLocaleLowerCase();
      return nextName === name.toLocaleLowerCase() && nextName !== ignoredName;
    });
  };

  const handleCreate = async () => {
    const nextName = createBoardName(selectedSideboard ? `${selectedSideboard.name} Copy` : "Workshop Board");
    const nextTokens = selectedSideboard ? [...selectedSideboard.tokens] : buildDefaultDraftTokens(collection?.ownedSideDeckTokens);
    await persistBoard(nextName, nextTokens, false, null);
    setNotice(`Created ${nextName}.`);
  };

  const handleSave = async (makeActive: boolean) => {
    const targetName = selectedSideboard?.name ?? normalizedDraftName;

    if (!targetName) {
      setError("Sideboard name cannot be empty.");
      return;
    }

    if (!selectedSideboard && hasNameConflict(targetName)) {
      setError(`A saved sideboard named ${targetName} already exists.`);
      return;
    }

    if (hasValidationErrors) {
      setError(validation.errors.join(" "));
      return;
    }

    await persistBoard(targetName, draftTokens, makeActive, null);
    setNotice(makeActive ? `Saved and activated ${targetName}.` : `Saved ${targetName}.`);
  };

  const handleRename = async () => {
    if (!selectedSideboard) {
      return;
    }

    if (!normalizedDraftName) {
      setError("Sideboard name cannot be empty.");
      return;
    }

    if (normalizedDraftName === selectedSideboard.name) {
      setError("Rename the board to a new name before saving the rename.");
      return;
    }

    if (hasNameConflict(normalizedDraftName, selectedSideboard.name)) {
      setError(`A saved sideboard named ${normalizedDraftName} already exists.`);
      return;
    }

    if (hasValidationErrors) {
      setError(validation.errors.join(" "));
      return;
    }

    const previousName = selectedSideboard.name;
    await persistBoard(normalizedDraftName, draftTokens, selectedSideboard.isActive, previousName);
    setNotice(`Renamed ${previousName} to ${normalizedDraftName}.`);
  };

  const persistBoard = async (
    nextName: string,
    nextTokens: string[],
    makeActive: boolean,
    previousName: string | null,
  ) => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      let nextCollection = await saveSideboard(nextName, nextTokens, accessToken, makeActive);

      if (previousName && previousName !== nextName) {
        nextCollection = await deleteSideboard(previousName, accessToken);
        if (makeActive || previousName === collection?.activeName) {
          nextCollection = await setActiveSideboard(nextName, accessToken);
        }
      }

      setCollection(nextCollection);
      syncDraft(nextCollection, nextName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!selectedSideboard) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const nextCollection = await setActiveSideboard(selectedSideboard.name, accessToken);
      setCollection(nextCollection);
      syncDraft(nextCollection, selectedSideboard.name);
      setNotice(`Activated ${selectedSideboard.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSideboard) {
      return;
    }

    if (!confirm(`Delete ${selectedSideboard.name}?`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const nextCollection = await deleteSideboard(selectedSideboard.name, accessToken);
      setCollection(nextCollection);
      const fallback = nextCollection.sideboards.find((sideboard) => sideboard.isActive)?.name
        ?? nextCollection.sideboards[0]?.name
        ?? null;
      syncDraft(nextCollection, fallback);
      setNotice(`Deleted ${selectedSideboard.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = (toIndex: number) => {
    if (draggingIndex === null || draggingIndex === toIndex) {
      setDraggingIndex(null);
      return;
    }

    setDraftTokens((prev) => {
      const next = [...prev];
      const [movedToken] = next.splice(draggingIndex, 1);
      next.splice(toIndex, 0, movedToken!);
      return next;
    });
    setDraggingIndex(null);
  };

  const moveToken = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= draftTokens.length) {
      return;
    }

    setDraftTokens((prev) => {
      const next = [...prev];
      [next[fromIndex], next[toIndex]] = [next[toIndex]!, next[fromIndex]!];
      return next;
    });
  };

  const handleBack = () => {
    if (hasUnsavedChanges && !confirm("Discard unsaved sideboard changes and go back?")) {
      return;
    }

    onBack();
  };

  const handleOpenCrate = async (kind: "standard" | "premium") => {
    setOpeningCrate(true);
    setError(null);
    setNotice(null);
    try {
      const result = await openRewardCrate(accessToken, kind);
      setCrateStandard(result.wallet.unopenedCratesStandard ?? 0);
      setCratePremium(result.wallet.unopenedCratesPremium ?? 0);
      const cardLine = result.opened.tokens.length > 0 ? result.opened.tokens.join(", ") : "no card roll";
      setNotice(`${kind === "premium" ? "Premium" : "Standard"} crate: ${cardLine} · +${result.opened.bonusCredits} credits`);
      const nextCollection = await fetchSideboards(accessToken);
      setCollection(nextCollection);
      syncDraft(nextCollection, selectedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningCrate(false);
    }
  };

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving && contentDirty && !hasValidationErrors) {
          void handleSave(false);
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [contentDirty, hasValidationErrors, saving]);

  return (
    <div className="screen screen--workshop">
      <div className="workshop-shell">
        <header className="workshop-header">
          <div>
            <p className="workshop-kicker">Pazaak World</p>
            <h1 className="workshop-title">Sideboard Workshop</h1>
            <p className="workshop-sub">{username}, shape your saved 10-card boards here and keep Discord for match flow.</p>
          </div>
          <button className="btn btn--ghost" onClick={handleBack}>Back</button>
        </header>

        {error && <div className="workshop-alert workshop-alert--error" role="alert">{error}</div>}
        {notice && <div className="workshop-alert workshop-alert--success" role="status" aria-live="polite">{notice}</div>}

        {loading ? (
          <div className="workshop-loading">Loading sideboards…</div>
        ) : (
          <div className="workshop-grid">
            <aside className="workshop-sidebar">
              <div className="workshop-sidebar__header">
                <h2>Saved Boards</h2>
                <button className="btn btn--secondary btn--sm" onClick={() => void handleCreate()} disabled={saving}>Duplicate</button>
              </div>
              <div className="workshop-sidebar__filters">
                <label className="workshop-field">
                  <span>Find Board</span>
                  <div className="workshop-search">
                    <input
                      className="workshop-input"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value.slice(0, 32))}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && searchQuery.length > 0) {
                          event.preventDefault();
                          setSearchQuery("");
                        }
                      }}
                      placeholder="ranked, doubles, anti-burst..."
                    />
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setSearchQuery("")}
                      disabled={searchQuery.trim().length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </label>
                <p className="workshop-sidebar__count">
                  {normalizedSearchQuery.length > 0
                    ? `${filteredSideboards.length} of ${collection?.sideboards.length ?? 0} boards match.`
                    : `${collection?.sideboards.length ?? 0} saved boards available.`}
                </p>
                <p className="workshop-sidebar__count workshop-sidebar__count--muted">
                  Unlocked cards: {ownedTokens.length === 0 ? "none" : `${ownedTokens.length} total`}
                </p>
                {selectedSideboard && normalizedSearchQuery.length > 0 && !selectedBoardVisible && (
                  <p className="workshop-sidebar__count workshop-sidebar__count--muted">
                    Still editing {selectedSideboard.name} outside the current filter.
                  </p>
                )}
              </div>
              <div className="workshop-board-list">
                {collection && filteredSideboards.length > 0 ? filteredSideboards.map((sideboard) => (
                  <button
                    key={sideboard.name}
                    className={`workshop-board-list__item ${sideboard.name === selectedName ? "workshop-board-list__item--selected" : ""}`}
                    onClick={() => syncDraft(collection, sideboard.name)}
                  >
                    <span>{sideboard.name}</span>
                    {sideboard.isActive && <span className="workshop-badge">Active</span>}
                  </button>
                )) : collection && collection.sideboards.length > 0 ? (
                  <div className="workshop-empty">No saved boards match this filter yet.</div>
                ) : (
                  <div className="workshop-empty">No saved boards yet. Duplicate the default starter to begin.</div>
                )}
              </div>
            </aside>

            <section className="workshop-main">
              <div className="workshop-toolbar" style={{ marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div className="workshop-field" style={{ flex: "1 1 220px" }}>
                  <span>Reward crates</span>
                  <p className="workshop-toolbar__hint" style={{ margin: "0.25rem 0 0.5rem" }}>
                    Earned every match — wins and losses both grant crates. Open for bonus cards and credits. Tiebreaker (TT) only unlocks at 10,000 wins.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <span className="workshop-sidebar__count">Standard: {crateStandard}</span>
                    <span className="workshop-sidebar__count">Premium: {cratePremium}</span>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={openingCrate || crateStandard < 1}
                      onClick={() => void handleOpenCrate("standard")}
                    >
                      Open standard
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={openingCrate || cratePremium < 1}
                      onClick={() => void handleOpenCrate("premium")}
                    >
                      Open premium
                    </button>
                  </div>
                </div>
              </div>
              <div className="workshop-toolbar">
                <label className="workshop-field">
                  <span>Board Name</span>
                  <input
                    className="workshop-input"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value.slice(0, 32))}
                    placeholder="aggressive, ladder, doubles..."
                  />
                  <p className="workshop-toolbar__hint">
                    {selectedSideboard
                      ? "Rename uses this field. Save only updates the current board's card layout."
                      : "Name the board here before saving it for the first time."}
                  </p>
                </label>

                <div className="workshop-actions">
                  <button className="btn btn--secondary" onClick={() => void handleRename()} disabled={saving || !renameDirty || hasValidationErrors}>Rename</button>
                  <button className="btn btn--secondary" onClick={() => void handleActivate()} disabled={saving || !selectedSideboard || selectedSideboard.isActive}>Set Active</button>
                  <button className="btn btn--secondary" onClick={() => void handleSave(false)} disabled={saving || !contentDirty || hasValidationErrors}>Save</button>
                  <button className="btn btn--primary" onClick={() => void handleSave(true)} disabled={saving || !contentDirty || hasValidationErrors}>Save and Activate</button>
                  <button className="btn btn--danger" onClick={() => void handleDelete()} disabled={saving || !selectedSideboard}>Delete</button>
                </div>
              </div>

              <div className="workshop-validation">
                <div>
                  <strong>Validation</strong>
                  <p>{validation.summary}</p>
                  {validation.errors.length > 0 && (
                    <p>{validation.errors.join(" ")}</p>
                  )}
                </div>
                <div className="workshop-validation__chips">
                  <span>{validation.fixed} fixed</span>
                  <span>{validation.flip} flip</span>
                  <span>{validation.special} special</span>
                  <span>{validation.unique} unique</span>
                </div>
              </div>

              {noUnlockedCards && (
                <div className="workshop-alert workshop-alert--error" role="alert">
                  No side cards are unlocked on this account yet, so you cannot build a multiplayer sideboard.
                </div>
              )}

              <div className="workshop-slots">
                {draftTokens.map((token, index) => (
                  <div
                    key={`${index}-${token}`}
                    className={`workshop-slot ${draggingIndex === index ? "workshop-slot--dragging" : ""}`}
                    draggable
                    onDragStart={() => setDraggingIndex(index)}
                    onDragEnd={() => setDraggingIndex(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(index)}
                  >
                    <div className="workshop-slot__meta">
                      <span className="workshop-slot__label">Slot {index + 1}</span>
                      <span className="workshop-slot__token">{token}</span>
                    </div>
                    <div className="workshop-slot__reorder" role="group" aria-label={`Reorder slot ${index + 1}`}>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => moveToken(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move slot ${index + 1} up`}
                      >
                        Move Up
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => moveToken(index, 1)}
                        disabled={index === draftTokens.length - 1}
                        aria-label={`Move slot ${index + 1} down`}
                      >
                        Move Down
                      </button>
                    </div>
                    <label className="workshop-field">
                      <span>Card</span>
                      <select
                        className="workshop-select"
                        value={token}
                        onChange={(event) => updateDraftToken(index, event.target.value)}
                        disabled={noUnlockedCards}
                      >
                        {noUnlockedCards ? <option value={EMPTY_SLOT_TOKEN}>No unlocked cards</option> : null}
                        {!noUnlockedCards && (
                          <option value={EMPTY_SLOT_TOKEN}>Empty slot</option>
                        )}
                        {!noUnlockedCards && SUPPORTED_TOKENS.map((supportedToken) => {
                          const owned = ownedTokenCounts.get(supportedToken) ?? 0;
                          const isCurrentSelection = supportedToken === token;
                          const locked = owned <= 0 && !isCurrentSelection;
                          const ref = getCardReference(supportedToken);
                          const rarity = ref?.rarity === "wacky_only" ? "Wacky" : ref?.rarity === "rare" ? "Gold" : ref?.rarity ?? "";
                          return (
                            <option key={supportedToken} value={supportedToken} disabled={locked}>
                              {supportedToken} · {TOKEN_DESCRIPTIONS[supportedToken] ?? supportedToken}
                              {rarity ? ` [${rarity}]` : ""}
                              {locked ? " (locked)" : ` (${owned} owned)`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <p className="workshop-slot__help">Drag this card onto another slot to reorder the board.</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeBoardName(name: string): string {
  return name.trim().replace(/\s+/gu, " ");
}

function buildValidationSummary(tokens: string[], ownedTokens: readonly string[]) {
  const tokenCounts = new Map<string, number>();
  const counts = tokens.reduce((state, token) => {
    if (token === EMPTY_SLOT_TOKEN) {
      return state;
    }

    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);

    if (/^[+-][1-6]$/u.test(token)) {
      state.fixed += 1;
    } else if (/^[*][1-6]$/u.test(token)) {
      state.flip += 1;
    } else {
      state.special += 1;
    }

    return state;
  }, { fixed: 0, flip: 0, special: 0 });

  const errors = [...tokenCounts.entries()]
    .filter(([token, count]) => count > getTokenLimit(token))
    .map(([token, count]) => `${token} appears ${count} times; use at most ${getTokenLimit(token)} in multiplayer custom boards.`);

  const ownedCounts = countTokens(ownedTokens);

  for (const [token, count] of tokenCounts.entries()) {
    const ownedCount = ownedCounts.get(token) ?? 0;
    if (ownedCount < count) {
      errors.push(`${token} requires ${count}, but only ${ownedCount} unlocked.`);
    }
  }

  if (tokens.some((token) => token === EMPTY_SLOT_TOKEN)) {
    errors.push("Fill all 10 slots with unlocked cards before saving.");
  }

  return {
    ...counts,
    errors,
    unique: new Set(tokens).size,
    summary: errors.length === 0
      ? `All ${tokens.length} slots are valid: regular cards allow up to ${STANDARD_TOKEN_LIMIT} copies, gold specials allow ${SPECIAL_TOKEN_LIMIT}.`
      : "This board needs balance edits before it can be saved.",
  };
}

function getTokenLimit(token: string): number {
  const ref = getCardReference(token);
  if (ref?.sideboardLimit === 1) {
    return SPECIAL_TOKEN_LIMIT;
  }

  return STANDARD_TOKEN_LIMIT;
}

function countTokens(tokens: readonly string[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();

  for (const token of tokens ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function buildDefaultDraftTokens(ownedTokens: readonly string[] | undefined): string[] {
  const tokens = [...(ownedTokens ?? [])];
  return Array.from({ length: 10 }, (_, index) => tokens[index] ?? EMPTY_SLOT_TOKEN);
}
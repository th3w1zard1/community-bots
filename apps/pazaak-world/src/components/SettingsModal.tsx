import { useState, useEffect, useCallback, useRef } from "react";
import { soundManager } from "../utils/soundManager.ts";
import type {
  AdvisorDifficulty,
  PazaakCardBackStyle,
  PazaakChatAudience,
  PazaakSoundTheme,
  PazaakTableAmbience,
  PazaakTableTheme,
  PazaakUserSettings,
} from "../types.ts";

// ── Theme & style catalogues ──────────────────────────────────────────────────

const TABLE_THEMES: { id: PazaakTableTheme; label: string; primary: string; secondary: string }[] = [
  { id: "ebon-hawk",  label: "Ebon Hawk",   primary: "#3d4a56", secondary: "#1e2d38" },
  { id: "coruscant",  label: "Coruscant",   primary: "#4a3060", secondary: "#271540" },
  { id: "tatooine",  label: "Tatooine",    primary: "#c9963e", secondary: "#7a5b1a" },
  { id: "manaan",    label: "Manaan",      primary: "#1a6a7a", secondary: "#0e3a4a" },
  { id: "dantooine", label: "Dantooine",   primary: "#3a6a30", secondary: "#1a3e18" },
  { id: "malachor",  label: "Malachor",    primary: "#5a1a1a", secondary: "#1a0808" },
];

const CARD_BACK_STYLES: { id: PazaakCardBackStyle; label: string; icon: string; desc: string }[] = [
  { id: "classic",      label: "Classic",      icon: "🃏", desc: "HoloPazaak Standard" },
  { id: "holographic",  label: "Holographic",  icon: "💠", desc: "Blue holo-matrix" },
  { id: "mandalorian",  label: "Mandalorian",  icon: "⚔️", desc: "Beskar steel pattern" },
  { id: "republic",     label: "Republic",     icon: "🔴", desc: "Red & gold crest" },
  { id: "sith",         label: "Sith",         icon: "🔥", desc: "Dark-side runes" },
];

const TABLE_AMBIENCES: { id: PazaakTableAmbience; label: string; desc: string }[] = [
  { id: "cantina",      label: "Cantina Standard",   desc: "Classic warm cantina lighting" },
  { id: "ebon-hawk",    label: "Ebon Hawk",          desc: "Steel cargo-hold atmosphere" },
  { id: "jedi-archives",label: "Jedi Archives",      desc: "Cool blue knowledge vaults" },
  { id: "outer-rim",    label: "Outer Rim Drifter",  desc: "Dusty amber starport glow" },
  { id: "sith-sanctum", label: "Sith Sanctum",       desc: "Deep void, crimson sparks" },
];

const SOUND_THEMES: { id: PazaakSoundTheme; label: string; desc: string }[] = [
  { id: "default",  label: "Default",       desc: "Standard HoloPazaak tones" },
  { id: "cantina",  label: "Cantina Bar",   desc: "Mos Eisley tavern ambience" },
  { id: "droid",    label: "Droid Beeps",   desc: "R2-style mechanical blips" },
  { id: "force",    label: "Force Calm",    desc: "Meditative Jedi tones" },
];

// ── Defaults & equality ───────────────────────────────────────────────────────

const DEFAULT_MODAL_SETTINGS: PazaakUserSettings = {
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

const SETTINGS_EQUALITY_KEYS = [
  "tableTheme",
  "cardBackStyle",
  "tableAmbience",
  "soundEnabled",
  "soundTheme",
  "reducedMotionEnabled",
  "turnTimerSeconds",
  "preferredAiDifficulty",
  "confirmForfeit",
  "highlightValidPlays",
  "focusMode",
  "showRatingsInGame",
  "showGuildEmblems",
  "showHolocronStreaks",
  "showPostMatchDebrief",
  "chatAudience",
] as const satisfies readonly (keyof PazaakUserSettings)[];

const areSettingsEqual = (left: PazaakUserSettings, right: PazaakUserSettings): boolean => {
  return SETTINGS_EQUALITY_KEYS.every((key) => left[key] === right[key]);
};

// ── Tab definitions ───────────────────────────────────────────────────────────

type SettingsTab = "table" | "combat" | "interface" | "comms" | "accessibility";

const SETTINGS_TABS: { id: SettingsTab; icon: string; label: string }[] = [
  { id: "table",        icon: "🃏", label: "Table & Cards"  },
  { id: "combat",       icon: "⚔️", label: "Combat Rules"   },
  { id: "interface",    icon: "🖥️", label: "Interface"      },
  { id: "comms",        icon: "📡", label: "Comms"          },
  { id: "accessibility",icon: "♿", label: "Accessibility"  },
];

interface SettingsModalProps {
  isOpen: boolean;
  currentSettings: PazaakUserSettings;
  onClose: () => void;
  onSave: (settings: PazaakUserSettings) => Promise<void>;
}

export function SettingsModal({ isOpen, currentSettings, onClose, onSave }: SettingsModalProps) {
  const [settings, setSettings] = useState<PazaakUserSettings>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("table");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const hasChanges = !areSettingsEqual(settings, currentSettings);

  const requestClose = useCallback(() => {
    if (!isSaving) {
      onClose();
    }
  }, [isSaving, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSettings(currentSettings);
    setSaveError(null);
  }, [currentSettings, isOpen]);

  // Escape to close + Ctrl+Enter to save
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSaving) requestClose();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        if (!isSaving && hasChanges) {
          event.preventDefault();
          void handleSave();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const modal = modalRef.current;
      if (!modal) return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (!active || active === first || !modal.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !modal.contains(active ?? document.body)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const rafId = requestAnimationFrame(() => {
      const modal = modalRef.current;
      if (!modal) return;
      const first = modal.querySelector<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled])"
      );
      first?.focus();
    });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(rafId);
    };
  }, [hasChanges, isOpen, isSaving, requestClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(settings);
      soundManager.beep("success", 150);
      requestClose();
    } catch (error) {
      soundManager.playErrorSound();
      console.error("Failed to save settings:", error);
      setSaveError("Could not save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, onSave, requestClose, settings]);

  const handleResetDefaults = () => {
    setSettings(DEFAULT_MODAL_SETTINGS);
    setSaveError(null);
  };

  if (!isOpen) return null;

  // ── Helper sub-components ────────────────────────────────────────────

  const ToggleRow = ({
    label,
    desc,
    value,
    onChange,
  }: {
    label: string;
    desc?: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="settings-toggle-row">
      <div className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {desc && <span className="settings-toggle-desc">{desc}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={`settings-toggle${value ? " on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  );

  // ── Tab content renderers ────────────────────────────────────────────

  const renderTableCards = () => (
    <div className="settings-tab-pane">
      <div className="settings-section">
        <h3 className="settings-section-title">Table Theme</h3>
        <p className="settings-section-desc">Choose the colour palette for your card table.</p>
        <div className="settings-swatch-grid">
          {TABLE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-label={`${t.label}${settings.tableTheme === t.id ? " (selected)" : ""}`}
              className={`settings-swatch${settings.tableTheme === t.id ? " selected" : ""}`}
              style={{
                background: `linear-gradient(135deg, ${t.primary} 0%, ${t.secondary} 100%)`,
              }}
              onClick={() => setSettings({ ...settings, tableTheme: t.id })}
            >
              {settings.tableTheme === t.id && <span className="settings-swatch-check">✔</span>}
            </button>
          ))}
        </div>
        <div className="settings-swatch-labels">
          {TABLE_THEMES.map((t) => (
            <span
              key={t.id}
              className={`settings-swatch-label-text${settings.tableTheme === t.id ? " active" : ""}`}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Card Back Style</h3>
        <p className="settings-section-desc">Customise the artwork on the reverse of your cards.</p>
        <div className="settings-card-style-grid">
          {CARD_BACK_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-card-style-tile${settings.cardBackStyle === s.id ? " selected" : ""}`}
              onClick={() => setSettings({ ...settings, cardBackStyle: s.id })}
              aria-pressed={settings.cardBackStyle === s.id}
            >
              <span className="settings-card-style-icon">{s.icon}</span>
              <span className="settings-card-style-name">{s.label}</span>
              <span className="settings-card-style-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Ambience Preset</h3>
        <p className="settings-section-desc">Set the background atmosphere behind the board.</p>
        <ul className="settings-ambience-list" role="listbox" aria-label="Ambience preset">
          {TABLE_AMBIENCES.map((a) => (
            <li
              key={a.id}
              role="option"
              aria-selected={settings.tableAmbience === a.id}
              className={`settings-ambience-item${settings.tableAmbience === a.id ? " selected" : ""}`}
              onClick={() => setSettings({ ...settings, tableAmbience: a.id })}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSettings({ ...settings, tableAmbience: a.id })}
            >
              <span className="settings-ambience-name">{a.label}</span>
              <span className="settings-ambience-desc">{a.desc}</span>
              {settings.tableAmbience === a.id && <span className="settings-ambience-check">✔</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderCombatRules = () => (
    <div className="settings-tab-pane">
      <div className="settings-section">
        <h3 className="settings-section-title">General</h3>
        <p className="settings-section-desc">Manage gameplay behaviour, turn timers, and Droid opponents.</p>
        <ToggleRow
          label="Confirm forfeit / offer tie?"
          desc="You will be asked to confirm before conceding a set or proposing a draw."
          value={settings.confirmForfeit}
          onChange={(v) => setSettings({ ...settings, confirmForfeit: v })}
        />
        <ToggleRow
          label="Highlight valid card plays"
          desc="Glow on side-deck cards you can legally play this turn."
          value={settings.highlightValidPlays}
          onChange={(v) => setSettings({ ...settings, highlightValidPlays: v })}
        />
        <ToggleRow
          label="Focus Mode"
          desc="Hide the sidebar, streaks, and decorative elements while in a match."
          value={settings.focusMode}
          onChange={(v) => setSettings({ ...settings, focusMode: v })}
        />
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Turn Timer</h3>
        <div className="settings-group">
          <label htmlFor="timer-select" className="settings-group-label">Seconds per turn</label>
          <select
            id="timer-select"
            value={settings.turnTimerSeconds}
            onChange={(e) => setSettings({ ...settings, turnTimerSeconds: parseInt(e.target.value) })}
          >
            <option value="0">Untimed — Casual</option>
            <option value="30">Lightning — 30 s</option>
            <option value="45">Standard — 45 s</option>
            <option value="60">Relaxed — 60 s</option>
            <option value="90">Galaxy Standard — 90 s</option>
            <option value="120">Scholar — 2 min</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Droid Opponents</h3>
        <div className="settings-group">
          <label htmlFor="ai-difficulty-select" className="settings-group-label">Default difficulty</label>
          <select
            id="ai-difficulty-select"
            value={settings.preferredAiDifficulty}
            onChange={(e) => setSettings({ ...settings, preferredAiDifficulty: e.target.value as AdvisorDifficulty })}
          >
            <option value="easy">Padawan — Easy</option>
            <option value="hard">Knight — Hard</option>
            <option value="professional">Master — Professional</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderInterface = () => (
    <div className="settings-tab-pane">
      <div className="settings-section">
        <h3 className="settings-section-title">Display</h3>
        <p className="settings-section-desc">Control what information is shown on-screen during play.</p>
        <ToggleRow
          label="Show credit balance during match"
          desc="Display your and your opponent's credit wallet while cards are dealt."
          value={settings.showRatingsInGame}
          onChange={(v) => setSettings({ ...settings, showRatingsInGame: v })}
        />
        <ToggleRow
          label="Show guild rank emblems"
          desc="Display membership icons next to player names."
          value={settings.showGuildEmblems}
          onChange={(v) => setSettings({ ...settings, showGuildEmblems: v })}
        />
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Features</h3>
        <ToggleRow
          label="Show Holocron Streaks"
          desc="Track your daily login streak with a glowing Holocron icon. 🔥"
          value={settings.showHolocronStreaks}
          onChange={(v) => setSettings({ ...settings, showHolocronStreaks: v })}
        />
        <ToggleRow
          label="Show post-match debrief"
          desc="See an advisor summary at the end of every match — key plays, risk moments, and credit swing."
          value={settings.showPostMatchDebrief}
          onChange={(v) => setSettings({ ...settings, showPostMatchDebrief: v })}
        />
      </div>
    </div>
  );

  const renderComms = () => (
    <div className="settings-tab-pane">
      <div className="settings-section">
        <h3 className="settings-section-title">In-Match Chat</h3>
        <p className="settings-section-desc">Control who can send you messages during a live match.</p>
        <ul className="settings-radio-group" role="radiogroup" aria-label="Chat audience">
          {(["everyone", "guild", "silent"] as const).map((val) => (
            <li
              key={val}
              role="radio"
              aria-checked={settings.chatAudience === val}
              className={`settings-radio-item${settings.chatAudience === val ? " selected" : ""}`}
              onClick={() => setSettings({ ...settings, chatAudience: val })}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSettings({ ...settings, chatAudience: val })}
            >
              <span className="settings-radio-dot" />
              <div>
                <span className="settings-radio-label">
                  {val === "everyone" ? "Everyone" : val === "guild" ? "Guild Members Only" : "Silent — No chat"}
                </span>
                <span className="settings-radio-desc">
                  {val === "everyone"
                    ? "Any player you face can send you in-match messages."
                    : val === "guild"
                    ? "Only players in your Discord server can message you mid-game."
                    : "Disable all in-match chat — pure card play, no banter."}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderAccessibility = () => (
    <div className="settings-tab-pane">
      <div className="settings-section">
        <h3 className="settings-section-title">Sounds</h3>
        <ToggleRow
          label="Play sound effects"
          desc="Card slaps, shuffle clicks, and win chimes."
          value={settings.soundEnabled}
          onChange={(v) => {
            setSettings({ ...settings, soundEnabled: v });
            soundManager.setEnabled(v);
          }}
        />
        {settings.soundEnabled && (
          <div className="settings-group" style={{ marginTop: 12 }}>
            <label htmlFor="sound-theme-select" className="settings-group-label">Sound theme</label>
            <select
              id="sound-theme-select"
              value={settings.soundTheme}
              onChange={(e) => setSettings({ ...settings, soundTheme: e.target.value as PazaakSoundTheme })}
            >
              {SOUND_THEMES.map((st) => (
                <option key={st.id} value={st.id}>{st.label} — {st.desc}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Visual</h3>
        <ToggleRow
          label="Reduced Motion"
          desc="Minimise animations for players sensitive to motion effects."
          value={settings.reducedMotionEnabled}
          onChange={(v) => setSettings({ ...settings, reducedMotionEnabled: v })}
        />
      </div>

      <div className="settings-section settings-info">
        <h3 className="settings-section-title">About</h3>
        <p>Pazaak World v0.1 — The legendary card game from Knights of the Old Republic</p>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="settings-modal-overlay" onClick={requestClose} role="presentation">
      <div
        ref={modalRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        aria-busy={isSaving}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="settings-modal-header">
          <div className="settings-modal-title-group">
            <h2 id="settings-modal-title">⚙ Preferences</h2>
            <span className="settings-modal-subtitle">Customise your Pazaak World experience.</span>
          </div>
          <button
            className="settings-modal-close"
            onClick={requestClose}
            aria-label="Close settings"
            disabled={isSaving}
          >
            ✕
          </button>
        </div>

        {/* Body: nav sidebar + content pane */}
        <div className="settings-modal-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`settings-nav-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                <span className="settings-nav-icon" aria-hidden="true">{tab.icon}</span>
                <span className="settings-nav-label">{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-tab-content" role="tabpanel">
            {activeTab === "table"         && renderTableCards()}
            {activeTab === "combat"        && renderCombatRules()}
            {activeTab === "interface"     && renderInterface()}
            {activeTab === "comms"         && renderComms()}
            {activeTab === "accessibility" && renderAccessibility()}
          </div>
        </div>

        {/* Footer */}
        {saveError && (
          <p className="settings-modal-error" role="status" aria-live="polite">{saveError}</p>
        )}
        <p className="settings-modal-hint" aria-live="off">Tip: Ctrl+Enter to save.</p>
        <div className="settings-modal-footer">
          <button
            className="settings-modal-reset"
            onClick={handleResetDefaults}
            disabled={isSaving || areSettingsEqual(settings, DEFAULT_MODAL_SETTINGS)}
          >
            Reset Defaults
          </button>
          <button
            className="settings-modal-cancel"
            onClick={requestClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="settings-modal-save"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
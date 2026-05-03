import { useState, useEffect, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AdminPolicyPanel } from "./AdminPolicyPanel.tsx";
import { SettingsModal } from "./SettingsModal.tsx";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import type { PazaakUserSettings } from "../types.ts";
import type { MatchSocketConnectionState } from "../api.ts";
import { soundManager } from "../utils/soundManager.ts";
import { formatCornerRatingSubtitle } from "../utils/ratingLabels.ts";

const menuIcon = (icon: string): string => {
  const MENU_ICON_MAP: Record<string, string> = {
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
  return MENU_ICON_MAP[icon] ?? "•";
};

interface GlobalAccountCornerProps {
  username: string;
  mmr: number | null;
  /** Rating deviation (Glicko-style confidence); omitted for guests. */
  mmrRd?: number | null;
  isOnline: boolean;
  canLogout: boolean;
  canJumpToLobby: boolean;
  busy: boolean;
  currentSettings: PazaakUserSettings;
  socketState?: MatchSocketConnectionState;
  onRefresh: () => void;
  onJumpToLobby: () => void;
  onLogout: () => void;
  onSignIn: () => void;
  onSettingsSave?: (settings: PazaakUserSettings) => Promise<void>;
  /** When set (standalone / logged-in session), show Ops policy editor for admins. */
  accessToken?: string | null;
}

export function GlobalAccountCorner({
  username,
  mmr,
  mmrRd = null,
  isOnline,
  canLogout,
  canJumpToLobby,
  busy,
  currentSettings,
  socketState = "disconnected",
  onRefresh,
  onJumpToLobby,
  onLogout,
  onSignIn,
  onSettingsSave,
  accessToken = null,
}: GlobalAccountCornerProps) {
  const [identityMenuOpen, setIdentityMenuOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [adminPolicyOpen, setAdminPolicyOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const identityMenuRef = useRef<HTMLDivElement | null>(null);
  const identityButtonRef = useRef<HTMLButtonElement | null>(null);
  const gearButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const copyStatusTimerRef = useRef<number | null>(null);

  const getMenuItems = () => {
    if (!identityMenuRef.current) {
      return [];
    }
    return Array.from(identityMenuRef.current.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
  };

  const closeIdentityMenu = useCallback(() => {
    setIdentityMenuOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current !== null) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
    };
  }, []);

  const toggleIdentityMenu = () => {
    lastTriggerRef.current = identityButtonRef.current;
    setIdentityMenuOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!identityMenuOpen) {
      return;
    }

    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeIdentityMenu();
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeIdentityMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [closeIdentityMenu, identityMenuOpen]);

  const handleIdentityTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" && !identityMenuOpen) {
      event.preventDefault();
      lastTriggerRef.current = identityButtonRef.current;
      setIdentityMenuOpen(true);
    }
  };

  useEffect(() => {
    if (identityMenuOpen) {
      const firstItem = getMenuItems()[0];
      firstItem?.focus();
    } else if (wasOpenRef.current) {
      lastTriggerRef.current?.focus();
    }

    wasOpenRef.current = identityMenuOpen;
  }, [identityMenuOpen]);

  const handleIdentityMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems();
    if (items.length === 0) {
      return;
    }

    const activeIndex = items.findIndex((item) => item === document.activeElement);
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length;
        items[nextIndex]?.focus();
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const nextIndex = activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
        break;
      }
      case "Home": {
        event.preventDefault();
        items[0]?.focus();
        break;
      }
      case "End": {
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }
      case "Tab":
      case "Escape": {
        event.preventDefault();
        closeIdentityMenu();
        break;
      }
      default:
        break;
    }
  };

  const copyLabel = async (value: string): Promise<boolean> => {
    const fallbackCopy = (text: string): boolean => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
      return copied;
    };

    try {
      await navigator.clipboard.writeText(value);
      soundManager.beep("success", 100);
      return true;
    } catch {
      const copied = fallbackCopy(value);
      if (copied) {
        soundManager.beep("success", 100);
      }
      return copied;
    }
  };

  const showCopyStatus = (status: "success" | "error") => {
    setCopyStatus(status);
    if (copyStatusTimerRef.current !== null) {
      window.clearTimeout(copyStatusTimerRef.current);
    }
    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyStatusTimerRef.current = null;
    }, 1800);
  };

  const handleGearClick = () => {
    soundManager.beep("warning", 150);
    closeIdentityMenu();
    setSettingsModalOpen(true);
  };

  const handleSignIn = () => {
    soundManager.playErrorSound();
    onSignIn();
  };

  return (
    <div ref={rootRef} className="activity-global-corner" aria-label="Global account controls">
      <div className="activity-global-corner__pill">
        <button
          ref={identityButtonRef}
          className="activity-global-corner__identity"
          type="button"
          onClick={toggleIdentityMenu}
          aria-haspopup="menu"
          aria-expanded={identityMenuOpen}
          aria-controls="global-identity-menu"
          onKeyDown={handleIdentityTriggerKeyDown}
          title={mmr === null ? "Open account menu" : `Open account menu — ${formatCornerRatingSubtitle(mmr, mmrRd ?? undefined)} (RD = rating deviation / confidence, like Chess.com’s Glicko docs)`}
        >
          <span className="activity-global-corner__icon" aria-hidden="true">◌</span>
          <span className="activity-global-corner__copy">
            <strong>{username}</strong>
            <small>
              {mmr === null ? "Guest" : formatCornerRatingSubtitle(mmr, mmrRd ?? undefined)}
            </small>
          </span>
        </button>
        <button
          ref={gearButtonRef}
          className="activity-global-corner__gear"
          type="button"
          onClick={handleGearClick}
          aria-label="Open settings"
          title="Open settings"
        >
          {menuIcon("settings")}
        </button>
      </div>

      {identityMenuOpen ? (
        <div
          ref={identityMenuRef}
          id="global-identity-menu"
          className="activity-global-corner__menu"
          role="menu"
          aria-label="Account menu"
          aria-orientation="vertical"
          onKeyDown={handleIdentityMenuKeyDown}
        >
          <div className="activity-global-corner__status" role="presentation">
            <ConnectionStatus isOnline={isOnline} socketState={socketState} />
          </div>
          <button
            className="activity-global-corner__item"
            type="button"
            onClick={async () => {
              const copied = await copyLabel(username);
              showCopyStatus(copied ? "success" : "error");
            }}
            role="menuitem"
          >
            Copy username
          </button>
          {copyStatus !== "idle" ? (
            <p
              className={`activity-global-corner__copy-feedback activity-global-corner__copy-feedback--${copyStatus}`}
              role="status"
              aria-live="polite"
            >
              {copyStatus === "success" ? "Username copied." : "Clipboard blocked in this browser."}
            </p>
          ) : null}
          {canJumpToLobby ? (
            <button
              className="activity-global-corner__item"
              type="button"
              onClick={() => {
                onJumpToLobby();
                closeIdentityMenu();
              }}
              role="menuitem"
            >
              Return to lobby
            </button>
          ) : null}
          {accessToken ? (
            <button
              className="activity-global-corner__item"
              type="button"
              onClick={() => {
                setAdminPolicyOpen(true);
                closeIdentityMenu();
              }}
              role="menuitem"
            >
              Ops policy…
            </button>
          ) : null}
          {canLogout ? (
            <button
              className="activity-global-corner__item"
              type="button"
              onClick={() => {
                void onRefresh();
                closeIdentityMenu();
              }}
              disabled={busy}
              role="menuitem"
            >
              {busy ? "Refreshing..." : "Refresh profile"}
            </button>
          ) : null}
          <button
            className="activity-global-corner__item activity-global-corner__item--danger"
            type="button"
            onClick={() => {
              if (canLogout) {
                void onLogout();
              } else {
                handleSignIn();
              }
              closeIdentityMenu();
            }}
            disabled={busy}
            role="menuitem"
          >
            {canLogout ? (busy ? "Signing out..." : "Log out") : "Sign in"}
          </button>
        </div>
      ) : null}

      <SettingsModal
        isOpen={settingsModalOpen}
        currentSettings={currentSettings}
        onClose={() => setSettingsModalOpen(false)}
        onSave={onSettingsSave || (async () => {})}
      />
      {accessToken ? (
        <AdminPolicyPanel
          isOpen={adminPolicyOpen}
          accessToken={accessToken}
          onClose={() => setAdminPolicyOpen(false)}
        />
      ) : null}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { fetchAdminPolicy, putAdminPolicy } from "../api.ts";

interface AdminPolicyPanelProps {
  isOpen: boolean;
  accessToken: string;
  onClose: () => void;
}

export function AdminPolicyPanel({ isOpen, accessToken, onClose }: AdminPolicyPanelProps): React.ReactElement | null {
  const [text, setText] = useState("");
  const [etag, setEtag] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const data = await fetchAdminPolicy(accessToken);
      setText(JSON.stringify(data.policy, null, 2));
      setEtag(data.etag);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isOpen && accessToken) {
      void load();
    }
  }, [isOpen, accessToken, load]);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const patch = JSON.parse(text) as unknown;
      await putAdminPolicy(accessToken, patch);
      setStatus("Saved.");
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label="Ops policy">
      <div className="settings-modal admin-policy-modal" onClick={(e) => e.stopPropagation()} role="document">
        <div className="settings-modal-header">
          <h2>Ops policy</h2>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="settings-modal-content">
          <p className="settings-modal-hint">
            Full merged policy JSON (v1). Requires allowlisted account or worker <code>ADMIN_USER_IDS</code>. Etag:{" "}
            {etag ?? "—"}
          </p>
          <textarea
            className="admin-policy-modal__editor"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={22}
            aria-label="Policy JSON"
          />
          <div className="settings-modal-footer">
            <button type="button" className="settings-modal-cancel" disabled={busy} onClick={() => void load()}>
              Reload
            </button>
            <button type="button" className="settings-modal-save" disabled={busy} onClick={() => void save()}>
              Save merge
            </button>
          </div>
          {status ? (
            <p className={status.startsWith("Saved") ? "settings-modal-hint" : "settings-modal-error"} role="status">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

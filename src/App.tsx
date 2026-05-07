import { useEffect, useState } from "react";
import { invoke, listen } from "./tauri";
import { ServerConfig, ServerStatus } from "./types";
import { LocaleProvider, useT } from "./i18n";
import SetupWizard from "./components/Setup/SetupWizard";
import Layout from "./components/Layout";
import CreditPopup from "./components/CreditPopup";

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_name: string;
  release_url: string;
  release_notes: string;
}

export default function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    invoke<ServerConfig>("get_config").then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
    // App-level listener: backend signals an auto-restart needed. Stays
    // mounted regardless of which tab is active.
    const u1 = listen<number>("auto-restart-requested", (e) => {
      const delayMs = e.payload || 3000;
      setTimeout(() => {
        invoke("start_server").catch(() => {});
      }, delayMs);
    });

    // Window-close interception: if server running, ask first
    const u2 = listen<void>("close-requested", async () => {
      try {
        const status = await invoke<ServerStatus>("get_server_status");
        if (status === "stopped") {
          await invoke("force_quit");
        } else {
          setCloseConfirm(true);
        }
      } catch {
        await invoke("force_quit");
      }
    });

    // Update check on launch — non-blocking, swallow errors silently
    const dismissed = localStorage.getItem("gff.update.dismissed");
    invoke<UpdateInfo>("check_for_update").then((info) => {
      if (info.update_available && dismissed !== info.latest_version) {
        setUpdate(info);
      }
    }).catch(() => {});

    return () => { u1.then((f) => f()); u2.then((f) => f()); };
  }, []);

  function dismissUpdate() {
    if (update) localStorage.setItem("gff.update.dismissed", update.latest_version);
    setUpdateDismissed(true);
  }

  async function stopAndQuit() {
    try {
      await invoke("stop_server").catch(() => {});
      // Give the server a moment to write data; then quit.
      setTimeout(() => { invoke("force_quit"); }, 1500);
    } catch {
      invoke("force_quit");
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--text-muted)" }}>GameForFun…</div>
      </div>
    );
  }

  return (
    <LocaleProvider>
      {!config?.setup_complete ? (
        <SetupWizard onComplete={(cfg) => setConfig(cfg)} />
      ) : (
        <Layout config={config} onConfigChange={setConfig} />
      )}
      <CreditPopup />
      {update && !updateDismissed && (
        <UpdateBanner info={update} onDismiss={dismissUpdate} />
      )}
      {closeConfirm && (
        <CloseConfirmModal
          onCancel={() => setCloseConfirm(false)}
          onStopQuit={() => { setCloseConfirm(false); stopAndQuit(); }}
          onForceQuit={() => { setCloseConfirm(false); invoke("force_quit"); }}
        />
      )}
    </LocaleProvider>
  );
}

function UpdateBanner({ info, onDismiss }: { info: UpdateInfo; onDismiss: () => void }) {
  const { t } = useT();
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        maxWidth: 360,
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid rgba(139,92,246,0.55)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)",
        animation: "fadeInUp 0.3s var(--easing)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>🎉</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {t("update.available", { v: info.latest_version })}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.4 }}>
        {t("update.currentVersion", { v: info.current_version })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <a
          href={info.release_url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary btn-sm"
          style={{ textDecoration: "none", flex: 1, justifyContent: "center" }}
        >
          {t("update.viewRelease")}
        </a>
        <button className="btn btn-sm" onClick={onDismiss}>
          {t("update.dismiss")}
        </button>
      </div>
    </div>
  );
}

function CloseConfirmModal({
  onCancel,
  onStopQuit,
  onForceQuit,
}: {
  onCancel: () => void;
  onStopQuit: () => void;
  onForceQuit: () => void;
}) {
  const { t } = useT();
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ padding: 24, maxWidth: 420, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
          {t("close.title")}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
          {t("close.body")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn-primary" onClick={onStopQuit} style={{ justifyContent: "center" }}>
            ■ {t("close.stopAndQuit")}
          </button>
          <button className="btn btn-danger" onClick={onForceQuit} style={{ justifyContent: "center" }}>
            ⚠ {t("close.forceQuit")}
          </button>
          <button className="btn" onClick={onCancel} style={{ justifyContent: "center" }}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

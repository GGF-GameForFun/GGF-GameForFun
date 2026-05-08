import { useEffect, useState } from "react";
import { invoke, listen } from "./tauri";
import { ServerConfig } from "./types";
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

interface ShutdownStatus {
  server_running: boolean;
  playit_running: boolean;
  cloudflare_running: boolean;
  remote_control_running: boolean;
  any_running: boolean;
}

export default function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeConfirm, setCloseConfirm] = useState<ShutdownStatus | null>(null);
  const [closing, setClosing] = useState(false);
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

    // Window-close interception: if background services are running, ask first
    const u2 = listen<void>("close-requested", async () => {
      try {
        const status = await invoke<ShutdownStatus>("get_shutdown_status");
        if (status.any_running) setCloseConfirm(status);
        else await invoke("force_quit");
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
    setClosing(true);
    try {
      await invoke("shutdown_and_quit");
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
        <UpdatePrompt info={update} onDismiss={dismissUpdate} />
      )}
      {closeConfirm && (
        <CloseConfirmModal
          status={closeConfirm}
          closing={closing}
          onCancel={() => setCloseConfirm(null)}
          onStopQuit={() => { stopAndQuit(); }}
          onForceQuit={() => { setCloseConfirm(null); invoke("force_quit"); }}
        />
      )}
    </LocaleProvider>
  );
}

function UpdatePrompt({ info, onDismiss }: { info: UpdateInfo; onDismiss: () => void }) {
  const { t } = useT();
  function confirmUpdate() {
    invoke("open_update_url", { url: info.release_url })
      .catch(() => window.open(info.release_url, "_blank", "noreferrer"));
    onDismiss();
  }

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal" style={{ padding: 24, maxWidth: 460, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🚀</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
          {t("update.available", { v: info.latest_version })}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.6 }}>
          {t("update.currentVersion", { v: info.current_version })}
        </div>
        {info.release_name && (
          <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 16, lineHeight: 1.5 }}>
            {info.release_name}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={confirmUpdate} style={{ flex: 1, justifyContent: "center" }}>
            ⬇ {t("update.confirm")}
          </button>
          <button className="btn" onClick={onDismiss} style={{ justifyContent: "center" }}>
            {t("update.dismiss")}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.5 }}>
          {t("update.manualNote")}
        </div>
      </div>
    </div>
  );
}

function CloseConfirmModal({
  status,
  closing,
  onCancel,
  onStopQuit,
  onForceQuit,
}: {
  status: ShutdownStatus;
  closing: boolean;
  onCancel: () => void;
  onStopQuit: () => void;
  onForceQuit: () => void;
}) {
  const { t } = useT();
  const activeItems = [
    status.server_running ? t("close.itemServer") : null,
    status.playit_running ? t("close.itemPlayit") : null,
    status.cloudflare_running ? t("close.itemCloudflare") : null,
    status.remote_control_running ? t("close.itemRemote") : null,
  ].filter(Boolean);
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
        <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{t("close.runningItems")}</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.7 }}>
            {activeItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn-primary" disabled={closing} onClick={onStopQuit} style={{ justifyContent: "center" }}>
            ■ {closing ? t("close.stopping") : t("close.stopAndQuit")}
          </button>
          <button className="btn btn-danger" disabled={closing} onClick={onForceQuit} style={{ justifyContent: "center" }}>
            ⚠ {t("close.forceQuit")}
          </button>
          <button className="btn" disabled={closing} onClick={onCancel} style={{ justifyContent: "center" }}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

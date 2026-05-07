import { useEffect, useState } from "react";
import { invoke, listen } from "./tauri";
import { ServerConfig } from "./types";
import { LocaleProvider } from "./i18n";
import SetupWizard from "./components/Setup/SetupWizard";
import Layout from "./components/Layout";
import CreditPopup from "./components/CreditPopup";

export default function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<ServerConfig>("get_config").then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
    // App-level listener: backend signals an auto-restart needed. Stays
    // mounted regardless of which tab is active.
    const unlisten = listen<number>("auto-restart-requested", (e) => {
      const delayMs = e.payload || 3000;
      setTimeout(() => {
        invoke("start_server").catch(() => {
          // The dashboard's actionErr will display this on next status update
        });
      }, delayMs);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
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
    </LocaleProvider>
  );
}

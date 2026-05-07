import { useEffect, useState } from "react";
import { invoke } from "./tauri";
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

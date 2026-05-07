import { useState } from "react";
import { ServerConfig } from "../types";
import { useT, Locale } from "../i18n";
import Dashboard from "./Dashboard/Dashboard";
import Console from "./Console/Console";
import ModManager from "./Mods/ModManager";
import ServerSettings from "./Settings/ServerSettings";
import Tunnel from "./Tunnel/Tunnel";
import Players from "./Players/Players";
import InfoPopup from "./InfoPopup";
import logo from "../assets/gameforfun-logo-ui.png";

type Page = "dashboard" | "console" | "tunnel" | "players" | "mods" | "settings";

interface Props {
  config: ServerConfig;
  onConfigChange: (cfg: ServerConfig) => void;
}

export default function Layout({ config, onConfigChange }: Props) {
  const { t, locale, setLocale } = useT();
  const [page, setPage] = useState<Page>("dashboard");
  const [infoOpen, setInfoOpen] = useState(false);

  const NAV: { id: Page; labelKey: string; icon: string }[] = [
    { id: "dashboard", labelKey: "nav.dashboard", icon: "📊" },
    { id: "console",   labelKey: "nav.console",   icon: "💻" },
    { id: "tunnel",    labelKey: "nav.tunnel",    icon: "🌐" },
    { id: "players",   labelKey: "nav.players",   icon: "👥" },
    { id: "mods",      labelKey: "nav.mods",      icon: "🧩" },
    { id: "settings",  labelKey: "nav.settings",  icon: "⚙️" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "var(--sidebar-w)",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "14px 0",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "0 18px 14px",
            borderBottom: "1px solid var(--border)",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={logo}
              alt=""
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                objectFit: "cover",
                boxShadow: "0 8px 22px rgba(139,92,246,0.35)",
              }}
            />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
                GameForFun
              </div>
              <div style={{ fontSize: 10, color: "var(--accent-2)", fontWeight: 700, marginTop: 3 }}>
                {t("brand.subtitle")}
              </div>
            </div>
          </div>
          <a
            href="https://discord.gg/bF62psq97S"
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 2,
              display: "inline-block",
              textDecoration: "none",
              transition: "color 0.15s var(--easing)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            💬 discord.gg/bF62psq97S
          </a>
        </div>

        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`nav-btn ${page === n.id ? "active" : ""}`}
          >
            <span className="nav-icon">{n.icon}</span>
            {t(n.labelKey)}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Footer in sidebar — credits */}
        <div style={{
          padding: "8px 18px",
          fontSize: 10, color: "var(--text-muted)",
          textAlign: "center", letterSpacing: 0.3,
        }}>
          v0.1 · by Aingker
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar with language selector + info button */}
        <header className="topbar">
          <LanguageSelector locale={locale} onChange={setLocale} />
          <button
            onClick={() => setInfoOpen(true)}
            aria-label={t("topbar.info")}
            title={t("topbar.info")}
            style={{
              width: 32, height: 32,
              borderRadius: 999,
              background: "var(--surface2)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              fontSize: 14, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
              e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            ?
          </button>
        </header>

        {/* Page content */}
        <main
          className="page-transition"
          style={{ flex: 1, overflow: "auto" }}
        >
          {page === "dashboard" && <Dashboard config={config} />}
          {page === "console" && <Console />}
          {page === "tunnel" && <Tunnel />}
          {page === "players" && <Players />}
          {page === "mods" && <ModManager />}
          {page === "settings" && (
            <ServerSettings config={config} onSave={onConfigChange} />
          )}
        </main>
      </div>

      <InfoPopup open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function LanguageSelector({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const opts: { value: Locale; label: string; flag: string }[] = [
    { value: "en", label: "English",    flag: "🇬🇧" },
    { value: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {opts.map((o) => {
        const active = locale === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#080711" : "var(--text-muted)",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ fontSize: 13 }}>{o.flag}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

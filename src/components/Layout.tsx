import { useEffect, useState } from "react";
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

const SIDEBAR_KEY = "gff.sidebar.collapsed";

export default function Layout({ config, onConfigChange }: Props) {
  const { t, locale, setLocale } = useT();
  const [page, setPage] = useState<Page>("dashboard");
  const [infoOpen, setInfoOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  const NAV: { id: Page; labelKey: string; icon: string }[] = [
    { id: "dashboard", labelKey: "nav.dashboard", icon: "📊" },
    { id: "console",   labelKey: "nav.console",   icon: "💻" },
    { id: "tunnel",    labelKey: "nav.tunnel",    icon: "🌐" },
    { id: "players",   labelKey: "nav.players",   icon: "👥" },
    { id: "mods",      labelKey: "nav.mods",      icon: "🧩" },
    { id: "settings",  labelKey: "nav.settings",  icon: "⚙️" },
  ];

  const SIDEBAR_W_OPEN = 220;
  const SIDEBAR_W_CLOSED = 64;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      {/* Sidebar — Liquid Glass with iOS-style spring collapse */}
      <aside
        className="glass"
        style={{
          width: collapsed ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN,
          display: "flex",
          flexDirection: "column",
          padding: "10px 0 14px",
          flexShrink: 0,
          transition: "width 0.55s var(--spring)",
          position: "relative",
          zIndex: 2,
          overflow: "hidden",
        }}
      >
        {/* Collapse / expand toggle — its own row above the brand so it
            never overlaps anything. Right-aligned when expanded, centered
            when collapsed. */}
        <div
          style={{
            display: "flex",
            justifyContent: collapsed ? "center" : "flex-end",
            padding: collapsed ? "0" : "0 12px",
            marginBottom: 10,
            transition: "justify-content 0.55s var(--spring), padding 0.55s var(--spring)",
          }}
        >
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              transition: "background 0.18s var(--spring-soft), color 0.18s var(--easing), border-color 0.18s var(--easing)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.14)";
              e.currentTarget.style.color = "var(--text)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.24)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
            }}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.45s var(--spring)",
                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
                lineHeight: 1,
              }}
            >
              ‹
            </span>
          </button>
        </div>

        {/* Brand row — logo always visible, text fades on collapse */}
        <div
          style={{
            padding: collapsed ? "0 0 12px" : "0 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            marginBottom: 8,
            display: "flex",
            justifyContent: collapsed ? "center" : "flex-start",
            transition: "padding 0.55s var(--spring)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              justifyContent: collapsed ? "center" : "flex-start",
            }}
          >
            <img
              src={logo}
              alt=""
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                objectFit: "cover",
                boxShadow: "0 8px 22px rgba(139,92,246,0.35)",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                opacity: collapsed ? 0 : 1,
                width: collapsed ? 0 : "auto",
                overflow: "hidden",
                whiteSpace: "nowrap",
                transition: "opacity 0.35s var(--easing), width 0.55s var(--spring)",
                pointerEvents: collapsed ? "none" : "auto",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", lineHeight: 1.1 }}>
                GameForFun
              </div>
              <a
                href="https://discord.gg/bF62psq97S"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 10,
                  color: "var(--accent-2)",
                  fontWeight: 700,
                  marginTop: 4,
                  display: "inline-block",
                  textDecoration: "none",
                }}
              >
                {t("brand.subtitle")}
              </a>
            </div>
          </div>
        </div>

        {NAV.map((n) => {
          const active = page === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`nav-btn ${active ? "active" : ""}`}
              title={collapsed ? t(n.labelKey) : undefined}
              style={{
                justifyContent: collapsed ? "center" : "flex-start",
                gap: collapsed ? 0 : 12,
                padding: collapsed ? "11px 0" : "11px 18px",
                margin: collapsed ? "1px 8px" : "1px 8px",
                transition:
                  "padding 0.45s var(--spring), gap 0.45s var(--spring), justify-content 0.45s var(--spring)",
              }}
            >
              <span
                className="nav-icon"
                style={{ fontSize: 16, flexShrink: 0, transition: "transform 0.35s var(--spring-soft)" }}
              >
                {n.icon}
              </span>
              <span
                style={{
                  opacity: collapsed ? 0 : 1,
                  width: collapsed ? 0 : "auto",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  transition: "opacity 0.3s var(--easing), width 0.5s var(--spring)",
                }}
              >
                {t(n.labelKey)}
              </span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Footer — credits, fades to dot when collapsed */}
        <div
          style={{
            padding: "8px 18px",
            fontSize: 10,
            color: "var(--text-muted)",
            textAlign: "center",
            letterSpacing: 0.3,
            opacity: collapsed ? 0 : 1,
            transition: "opacity 0.3s var(--easing)",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          v0.1 · by Aingker
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header className="topbar glass" style={{ borderRadius: 0 }}>
          <LanguageSelector locale={locale} onChange={setLocale} />
          <button
            onClick={() => setInfoOpen(true)}
            aria-label={t("topbar.info")}
            title={t("topbar.info")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "rgba(255,255,255,0.05)",
              color: "var(--text-muted)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.24)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            }}
          >
            ?
          </button>
        </header>

        <main className="page-transition" style={{ flex: 1, overflow: "auto" }}>
          {page === "dashboard" && <Dashboard config={config} />}
          {page === "console" && <Console />}
          {page === "tunnel" && <Tunnel config={config} onConfigChange={onConfigChange} />}
          {page === "players" && <Players />}
          {page === "mods" && <ModManager />}
          {page === "settings" && <ServerSettings config={config} onSave={onConfigChange} />}
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
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
        backdropFilter: "blur(20px) saturate(160%)",
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
              background: active ? "rgba(255, 255, 255, 0.92)" : "transparent",
              color: active ? "#0b0b14" : "var(--text-muted)",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              boxShadow: active ? "0 2px 10px rgba(0, 0, 0, 0.25)" : "none",
              transition: "background 0.3s var(--spring-soft), color 0.3s var(--easing)",
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

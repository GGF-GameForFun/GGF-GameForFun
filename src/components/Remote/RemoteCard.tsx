// Shared UI primitives for the Remote Control + Cloudflare cards.
// Used in the Connection (formerly Tunnel) tab.

import React from "react";

export interface RemoteCardProps {
  accent: "cyan" | "orange";
  icon: string;
  title: string;
  desc: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
  running: boolean;
  url: string;
  urlLabel: string;
  urlPlaceholder: string;
  copied: boolean;
  onCopy: () => void;
  onShowQr?: () => void;
  children?: React.ReactNode;
}

export function RemoteCard({
  accent,
  icon,
  title,
  desc,
  enabled,
  disabled = false,
  onToggle,
  running,
  url,
  urlLabel,
  urlPlaceholder,
  copied,
  onCopy,
  onShowQr,
  children,
}: RemoteCardProps) {
  // Both palettes are now neutral white-glass with a tiny hue hint —
  // matches the Vision-OS / Liquid-Glass aesthetic where the icon and
  // status pill carry color, not the whole card.
  const palette =
    accent === "cyan"
      ? {
          bg: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(147,197,253,0.025))",
          border: "rgba(255,255,255,0.12)",
          glow: "rgba(147,197,253,0.10)",
          urlBg: "rgba(255,255,255,0.04)",
          urlBorder: "rgba(255,255,255,0.10)",
        }
      : {
          bg: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(251,191,36,0.025))",
          border: "rgba(255,255,255,0.12)",
          glow: "rgba(251,191,36,0.08)",
          urlBg: "rgba(255,255,255,0.04)",
          urlBorder: "rgba(255,255,255,0.10)",
        };

  return (
    <div
      style={{
        padding: "14px 14px 12px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: "var(--radius)",
        boxShadow: enabled && running ? `0 0 0 1px ${palette.glow}` : "none",
        transition: "box-shadow 0.2s ease",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
            <StatusPill running={running} enabled={enabled} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
        </div>
        <Toggle disabled={disabled} on={enabled} onChange={onToggle} />
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label" style={{ marginBottom: 4 }}>
          {urlLabel}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 10px",
            background: url ? palette.urlBg : "rgba(0,0,0,0.18)",
            border: `1px solid ${url ? palette.urlBorder : "rgba(255,255,255,0.06)"}`,
            borderRadius: "var(--radius-sm)",
            opacity: url ? 1 : 0.7,
          }}
        >
          <div
            style={{
              flex: 1,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: url ? "var(--text)" : "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {url || urlPlaceholder}
          </div>
          {onShowQr && (
            <button
              className="btn btn-sm"
              disabled={!url}
              onClick={onShowQr}
              style={{ flexShrink: 0 }}
              title="Show QR code"
            >
              📱
            </button>
          )}
          <button className="btn btn-sm" disabled={!url} onClick={onCopy} style={{ flexShrink: 0 }}>
            {copied ? "✓" : "📋"}
          </button>
        </div>
      </div>

      {children}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  disabled = false,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 999,
        // Green track when ON (iOS convention — universal "active"),
        // translucent dark track when OFF.
        background: on ? "rgba(74, 222, 128, 0.85)" : "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background 0.28s var(--spring-soft)",
        padding: 0,
        boxShadow: on
          ? "0 0 0 1px rgba(74, 222, 128, 0.30), 0 4px 14px rgba(74, 222, 128, 0.18)"
          : "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left 0.32s var(--spring)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }}
      />
    </button>
  );
}

export function StatusPill({ running, enabled }: { running: boolean; enabled: boolean }) {
  if (running) {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(74,222,128,0.15)",
          color: "var(--accent)",
          border: "1px solid rgba(74,222,128,0.35)",
        }}
      >
        ● RUNNING
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        padding: "2px 8px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        color: "var(--text-muted)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      ○ {enabled ? "STARTING…" : "OFF"}
    </span>
  );
}

/**
 * Show a small modal with a QR code for the given URL. Uses a public QR
 * generator (api.qrserver.com) which is safe to call from the WebView.
 */
export function QrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(
    url
  )}`;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ padding: 24, maxWidth: 320, width: "100%", textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📱 Scan to open</div>
        <img
          src={src}
          alt="QR code"
          width={240}
          height={240}
          style={{ borderRadius: 8, background: "#fff", padding: 8 }}
        />
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
            wordBreak: "break-all",
            marginTop: 12,
            marginBottom: 12,
          }}
        >
          {url}
        </div>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

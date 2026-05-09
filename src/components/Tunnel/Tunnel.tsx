// "Connection" tab — consolidates all connection-related tools that used to
// live in the Tunnel tab + Settings → Remote Control:
//
//   1. Endpoints overview (3 active URLs at a glance, copy-all button)
//   2. playit.gg public tunnel (status, claim, address, agent log)
//   3. LAN Remote + Cloudflare Public side-by-side cards
//
// Layout uses a 2-column grid for the remote-access cards so users don't
// scroll for things that fit naturally side-by-side.

import { useEffect, useRef, useState } from "react";
import { invoke, listen } from "../../tauri";
import {
  PlayitState,
  ServerStatus,
  ServerConfig,
  RemoteControlState,
  CloudflareTunnelState,
} from "../../types";
import { useT } from "../../i18n";
import { RemoteCard, QrModal } from "../Remote/RemoteCard";

interface Props {
  config: ServerConfig;
  onConfigChange: (cfg: ServerConfig) => void;
}

function clampRemotePort(port: number) {
  if (!Number.isFinite(port)) return 47992;
  if (port < 1024) return 1024;
  if (port > 65535) return 65535;
  return Math.floor(port);
}

export default function Connection({ config, onConfigChange }: Props) {
  const { t } = useT();

  // ── playit.gg state ───────────────────────────────────────────────────
  const [playit, setPlayit] = useState<PlayitState>({
    running: false,
    address: null,
    claim_url: null,
    pid: null,
  });
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [playitCopied, setPlayitCopied] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");
  const [serverPort, setServerPort] = useState("25565");
  const [showLog, setShowLog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Remote Control state ──────────────────────────────────────────────
  const [form, setForm] = useState<ServerConfig>(config);
  const [remoteStatus, setRemoteStatus] = useState<RemoteControlState | null>(null);
  const [remoteCopied, setRemoteCopied] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareTunnelState | null>(null);
  const [cloudflareBusy, setCloudflareBusy] = useState(false);
  const [cloudflareCopied, setCloudflareCopied] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  useEffect(() => setForm(config), [config]);

  useEffect(() => {
    invoke<PlayitState>("get_playit_status").then(setPlayit).catch(() => {});
    invoke<ServerStatus>("get_server_status").then(setServerStatus).catch(() => {});
    invoke<Record<string, string>>("get_server_properties")
      .then((p) => setServerPort(p["server-port"] || "25565"))
      .catch(() => {});
    refreshRemoteStatus();
    refreshCloudflareStatus();

    const u1 = listen<PlayitState>("playit-update", (e) => setPlayit(e.payload));
    const u2 = listen<string>("playit-line", (e) => setLines((l) => [...l.slice(-1500), e.payload]));
    const u3 = listen<ServerStatus>("server-status", (e) => setServerStatus(e.payload));
    const u4 = listen<CloudflareTunnelState>("cloudflare-remote-update", async (e) => {
      setCloudflareStatus(e.payload);
      try {
        const status = await invoke<RemoteControlState>("get_remote_control_status");
        setRemoteStatus(status);
      } catch {}
    });
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
      u3.then((f) => f());
      u4.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (showLog) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, showLog]);

  // ── playit.gg actions ─────────────────────────────────────────────────
  async function playitAction(cmd: string, label?: string) {
    setErr("");
    if (label) setBusy(label);
    try {
      const result = await invoke<PlayitState | null>(cmd);
      if (result && typeof result === "object" && "running" in result) setPlayit(result);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy("");
    }
  }

  function copyPlayitAddress() {
    if (playit.address) {
      navigator.clipboard.writeText(playit.address);
      setPlayitCopied(true);
      setTimeout(() => setPlayitCopied(false), 1500);
    }
  }

  // ── Remote Control actions ────────────────────────────────────────────
  async function refreshRemoteStatus() {
    try {
      const s = await invoke<RemoteControlState>("get_remote_control_status");
      setRemoteStatus(s);
    } catch {
      setRemoteStatus(null);
    }
  }

  async function refreshCloudflareStatus() {
    try {
      const s = await invoke<CloudflareTunnelState>("get_cloudflare_remote_status");
      setCloudflareStatus(s);
    } catch {
      setCloudflareStatus(null);
    }
  }

  async function saveAndApplyForm(updated: Partial<ServerConfig>) {
    const cfg = { ...form, ...updated, remote_control_port: clampRemotePort(form.remote_control_port) };
    const saved = await invoke<ServerConfig>("save_config", { cfg });
    setForm(saved);
    onConfigChange(saved);
    return saved;
  }

  async function toggleLanRemote(v: boolean) {
    setErr("");
    try {
      if (v) {
        // Turning ON — auto-generate a token if one doesn't exist yet,
        // so the service can actually start (the backend rejects empty tokens).
        let token = form.remote_control_token;
        if (!token || !token.trim()) {
          token = await invoke<string>("generate_remote_token");
        }
        await saveAndApplyForm({ remote_control_enabled: true, remote_control_token: token });
      } else {
        // Turning OFF — also stop Cloudflare if it's running, since it
        // tunnels to the LAN service and would be left orphaned.
        if (cloudflareStatus?.running || form.cloudflare_remote_enabled) {
          try {
            const tunnel = await invoke<CloudflareTunnelState>("stop_cloudflare_remote");
            setCloudflareStatus(tunnel);
          } catch {}
          await saveAndApplyForm({
            remote_control_enabled: false,
            cloudflare_remote_enabled: false,
          });
        } else {
          await saveAndApplyForm({ remote_control_enabled: false });
        }
      }
      const status = await invoke<RemoteControlState>("restart_remote_control");
      setRemoteStatus(status);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function generateRemoteToken() {
    setErr("");
    try {
      const token = await invoke<string>("generate_remote_token");
      await saveAndApplyForm({ remote_control_token: token });
      // If the LAN service is currently running, restart so it picks up the new token.
      if (form.remote_control_enabled) {
        const status = await invoke<RemoteControlState>("restart_remote_control");
        setRemoteStatus(status);
      }
    } catch (e) {
      setErr(String(e));
    }
  }

  async function restartRemoteControl() {
    setErr("");
    try {
      const status = await invoke<RemoteControlState>("restart_remote_control");
      setRemoteStatus(status);
    } catch (e) {
      setErr(String(e));
    }
  }

  function copyRemoteUrl() {
    const u = remoteStatus?.lan_url;
    if (!u) return;
    navigator.clipboard.writeText(u);
    setRemoteCopied(true);
    setTimeout(() => setRemoteCopied(false), 1500);
  }

  async function toggleCloudflare(v: boolean) {
    setErr("");
    setCloudflareBusy(true);
    try {
      if (v) {
        if (!form.remote_control_enabled) {
          setErr(t("settings.cloudflareLanRequired"));
          return;
        }
        await saveAndApplyForm({ cloudflare_remote_enabled: true });
        const remote = await invoke<RemoteControlState>("restart_remote_control");
        setRemoteStatus(remote);
        const tunnel = await invoke<CloudflareTunnelState>("start_cloudflare_remote");
        setCloudflareStatus(tunnel);
        if (!tunnel.url) setErr(tunnel.message || t("settings.cloudflareNoUrl"));
      } else {
        const tunnel = await invoke<CloudflareTunnelState>("stop_cloudflare_remote");
        setCloudflareStatus(tunnel);
        await saveAndApplyForm({ cloudflare_remote_enabled: false });
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setCloudflareBusy(false);
    }
  }

  function copyCloudflareUrl() {
    if (!cloudflareStatus?.running || !cloudflareStatus.url) return;
    navigator.clipboard.writeText(cloudflareStatus.url);
    setCloudflareCopied(true);
    setTimeout(() => setCloudflareCopied(false), 1500);
  }

  // ── Endpoints summary ─────────────────────────────────────────────────
  // Each URL is only shown when its service is actually running. A stale
  // URL leftover from a previous run or pre-launch backend state would be
  // misleading (the user might try to share a dead URL).
  const lanUrl = remoteStatus?.running ? (remoteStatus.lan_url || "") : "";
  const cloudflareUrl = cloudflareStatus?.running ? (cloudflareStatus.url || "") : "";
  const playitUrl = playit.running ? (playit.address || "") : "";
  const endpoints = [
    { label: t("connection.endpointPublic"), value: playitUrl, icon: "🌍" },
    { label: t("connection.endpointLan"), value: lanUrl, icon: "🏠" },
    { label: t("connection.endpointCloudflare"), value: cloudflareUrl, icon: "☁" },
  ];

  function copyAllEndpoints() {
    const lines = endpoints
      .filter((e) => e.value)
      .map((e) => `${e.label}: ${e.value}`)
      .join("\n");
    if (lines) {
      navigator.clipboard.writeText(lines);
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1500);
    }
  }

  return (
    <div
      className="page-transition"
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 24,
        paddingBottom: 24,
        maxWidth: 1100,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t("connection.title")}</h2>

      {/* ── Endpoints overview ──────────────────────────────────────────── */}
      <EndpointsOverview
        endpoints={endpoints}
        onCopyAll={copyAllEndpoints}
        copied={allCopied}
        onShowQr={(url) => setQrFor(url)}
        copyAllLabel={t("connection.copyAll")}
        copiedLabel={t("common.copied")}
        emptyLabel={t("connection.endpointEmpty")}
      />

      {/* ── playit.gg ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`status-dot ${playit.running ? "running" : "stopped"}`} style={{ width: 10, height: 10 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🌍 {t("tunnel.title")}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {playit.running ? t("tunnel.active") : t("tunnel.inactive")}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!playit.running ? (
              <button
                className="btn btn-primary btn-sm"
                disabled={!!busy}
                onClick={() => playitAction("setup_playit", t("tunnel.starting"))}
              >
                {busy ? "…" : `▶ ${t("common.start")}`}
              </button>
            ) : (
              <>
                <button
                  className="btn btn-sm"
                  disabled={!!busy}
                  onClick={() => playitAction("refresh_playit_address", t("tunnel.refreshingAddress"))}
                >
                  ↻ {t("tunnel.refreshAddress")}
                </button>
                <button className="btn btn-sm" onClick={() => playitAction("stop_playit")}>
                  ■ {t("common.stop")}
                </button>
              </>
            )}
            <button className="btn btn-sm" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "▾" : "▸"} {t("connection.toggleLog")}
            </button>
          </div>
        </div>

        {busy && (
          <div style={{ color: "var(--blue)", fontSize: 12, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: "2px solid var(--blue)",
                borderRightColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            {busy}
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--red)",
              background: "#2a1515",
              border: "1px solid var(--red)",
              borderRadius: 6,
            }}
          >
            ⚠ {err}
          </div>
        )}

        {/* Claim banner */}
        {playit.claim_url && !playit.address && (
          <div
            style={{
              background: "#2a2200",
              border: "1px solid var(--yellow)",
              borderRadius: 8,
              padding: "10px 14px",
              marginTop: 12,
            }}
          >
            <div style={{ color: "var(--yellow)", fontWeight: 600, marginBottom: 4 }}>{t("tunnel.claimTitle")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{t("tunnel.claimDesc")}</div>
            <a
              href={playit.claim_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                color: "var(--yellow)",
                background: "#1a1500",
                padding: "5px 9px",
                borderRadius: 4,
                fontFamily: "monospace",
                fontSize: 12,
                wordBreak: "break-all",
                textDecoration: "underline",
              }}
            >
              {playit.claim_url}
            </a>
          </div>
        )}

        {/* Address card */}
        {playit.address && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "#0d2a17",
              border: "1px solid var(--accent-dim)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div className="label" style={{ color: "var(--accent)" }}>
              {t("tunnel.serverAddress")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <code
                style={{
                  flex: 1,
                  fontFamily: "monospace",
                  fontSize: 16,
                  color: "var(--accent)",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {playit.address}
              </code>
              <button className="btn btn-sm" onClick={() => setQrFor(playit.address!)} title="Show QR code">
                📱
              </button>
              <button className="btn btn-sm" onClick={copyPlayitAddress}>
                {playitCopied ? `✓ ${t("common.copied")}` : `📋 ${t("common.copy")}`}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{t("tunnel.shareHint")}</div>
          </div>
        )}

        {/* Diagnostics — compact 5-up grid */}
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>
            🧪 {t("tunnel.diagnostics")}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            <DiagnosticRow ok={playit.running} label={t("tunnel.diagAgent")} />
            <DiagnosticRow
              ok={!playit.claim_url}
              warn={!!playit.claim_url}
              label={playit.claim_url ? t("tunnel.diagClaimNeeded") : t("tunnel.diagClaimReady")}
            />
            <DiagnosticRow
              ok={!!playit.address}
              warn={playit.running && !playit.address}
              label={playit.address ? t("tunnel.diagAddressFound") : t("tunnel.diagAddressMissing")}
            />
            <DiagnosticRow
              ok={serverStatus === "running"}
              warn={serverStatus === "starting"}
              label={serverStatus === "running" ? t("tunnel.diagServerRunning") : t("tunnel.diagServerNotRunning")}
            />
            <DiagnosticRow
              ok={serverPort === "25565"}
              warn={serverPort !== "25565"}
              label={t("tunnel.diagLocalPort", { port: serverPort })}
            />
          </div>
        </div>

        {/* Collapsible agent log */}
        {showLog && (
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              {t("tunnel.agentLog")}
            </div>
            <div
              style={{
                maxHeight: 220,
                overflowY: "auto",
                background: "#0a0a0a",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                fontFamily: "monospace",
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              {lines.length === 0 ? (
                <div style={{ color: "var(--text-muted)" }}>{t("tunnel.logPlaceholder")}</div>
              ) : (
                lines.map((line, i) => {
                  let color = "var(--text)";
                  if (line.includes("ERROR")) color = "var(--red)";
                  else if (line.includes("WARN")) color = "var(--yellow)";
                  else if (line.includes("INFO")) color = "var(--text-muted)";
                  return (
                    <div key={i} style={{ color }}>
                      {line}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── Remote Access — LAN + Cloudflare side-by-side ──────────────── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🖥 {t("settings.remoteControl")}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {t("settings.remoteControlDesc")}
        </div>
      </div>
      <div
        className="stagger"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gridAutoRows: "1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <RemoteCard
          accent="cyan"
          icon="🏠"
          title={t("settings.lanRemoteTitle")}
          desc={t("settings.lanRemoteDesc")}
          enabled={form.remote_control_enabled}
          onToggle={toggleLanRemote}
          running={!!remoteStatus?.running}
          url={lanUrl}
          urlLabel={t("settings.lanRemoteIpLabel")}
          urlPlaceholder={
            form.remote_control_enabled ? t("settings.remoteSaveHint") : t("settings.lanRemoteEnableHint")
          }
          copied={remoteCopied}
          onCopy={copyRemoteUrl}
          onShowQr={lanUrl ? () => setQrFor(lanUrl) : undefined}
        >
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginTop: 12 }}>
            <div>
              <div className="label">{t("settings.remotePort")}</div>
              <input
                type="number"
                min={1024}
                max={65535}
                value={form.remote_control_port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, remote_control_port: clampRemotePort(Number(e.target.value)) }))
                }
                onBlur={() =>
                  saveAndApplyForm({ remote_control_port: clampRemotePort(form.remote_control_port) })
                }
                style={{ width: "100%" }}
                disabled={!form.remote_control_enabled}
              />
            </div>
            <div>
              <div className="label">{t("settings.remoteToken")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  readOnly
                  value={form.remote_control_token || t("settings.remoteNoToken")}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 11 }}
                />
                <button className="btn btn-sm" onClick={generateRemoteToken}>
                  {t("settings.remoteGenerate")}
                </button>
              </div>
            </div>
          </div>
          {form.remote_control_enabled && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={restartRemoteControl}>
                ↻ {t("settings.remoteRestart")}
              </button>
            </div>
          )}
        </RemoteCard>

        <RemoteCard
          accent="orange"
          icon="☁"
          title={t("settings.cloudflareTitle")}
          desc={t("settings.cloudflareDesc")}
          enabled={form.cloudflare_remote_enabled}
          onToggle={toggleCloudflare}
          disabled={!form.remote_control_enabled || cloudflareBusy}
          running={!!cloudflareStatus?.running}
          url={cloudflareUrl}
          urlLabel={t("settings.cloudflareIpLabel")}
          urlPlaceholder={
            cloudflareBusy
              ? t("settings.cloudflareStarting")
              : !form.remote_control_enabled
                ? t("settings.cloudflareLanRequired")
                : cloudflareStatus?.message || t("settings.cloudflareIdle")
          }
          copied={cloudflareCopied}
          onCopy={copyCloudflareUrl}
          onShowQr={cloudflareUrl ? () => setQrFor(cloudflareUrl) : undefined}
        />
      </div>

      <details style={{ marginBottom: 24 }}>
        <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
          {t("settings.remotePublicUrlAdvanced")}
        </summary>
        <div style={{ marginTop: 8 }}>
          <input
            value={form.remote_control_public_url}
            onChange={(e) => setForm((f) => ({ ...f, remote_control_public_url: e.target.value }))}
            onBlur={() => saveAndApplyForm({ remote_control_public_url: form.remote_control_public_url })}
            placeholder="https://example.trycloudflare.com"
            style={{ width: "100%", marginBottom: 6 }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
            {t("settings.remotePublicUrlDesc", { port: String(form.remote_control_port) })}
          </div>
        </div>
      </details>

      {qrFor && <QrModal url={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Endpoints overview — compact card listing all 3 active addresses
// ─────────────────────────────────────────────────────────────────────────

function EndpointsOverview({
  endpoints,
  onCopyAll,
  copied,
  onShowQr,
  copyAllLabel,
  copiedLabel,
  emptyLabel,
}: {
  endpoints: { label: string; value: string; icon: string }[];
  onCopyAll: () => void;
  copied: boolean;
  onShowQr: (url: string) => void;
  copyAllLabel: string;
  copiedLabel: string;
  emptyLabel: string;
}) {
  const anyActive = endpoints.some((e) => e.value);
  return (
    <div
      className="card"
      style={{
        padding: "12px 14px",
        marginBottom: 14,
        background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.05))",
        border: "1px solid rgba(168,85,247,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: "var(--text-muted)" }}>
          🔗 ENDPOINTS
        </div>
        <button className="btn btn-sm" disabled={!anyActive} onClick={onCopyAll}>
          {copied ? `✓ ${copiedLabel}` : `📋 ${copyAllLabel}`}
        </button>
      </div>
      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {endpoints.map((e, i) => (
          <div
            key={e.label}
            style={{
              padding: "8px 10px",
              background: e.value ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.18)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              opacity: e.value ? 1 : 0.6,
              transition: "opacity 0.4s var(--spring-out), background 0.3s var(--easing)",
              "--i": i,
            } as React.CSSProperties}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 13 }}>{e.icon}</span>
              {e.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  flex: 1,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: e.value ? "var(--text)" : "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {e.value || emptyLabel}
              </div>
              {e.value && (
                <button
                  className="btn btn-sm"
                  style={{ padding: "2px 6px", fontSize: 10 }}
                  onClick={() => onShowQr(e.value)}
                  title="QR code"
                >
                  📱
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagnosticRow({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const color = ok ? "var(--green)" : warn ? "var(--yellow)" : "var(--text-muted)";
  const symbol = ok ? "✓" : warn ? "!" : "•";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 28,
        padding: "5px 9px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontSize: 11,
        color: "var(--text-muted)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: 999,
          color,
          border: `1px solid ${color}`,
          flexShrink: 0,
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {symbol}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

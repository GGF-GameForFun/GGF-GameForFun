import { useEffect, useState } from "react";
import { invoke, listen, saveFileDialog } from "../../tauri";
import {
  ServerConfig,
  ServerStatus,
  ServerType,
  McVersion,
  LoaderVersion,
  InstallProgress,
  RemoteControlState,
  CloudflareTunnelState,
  SERVER_TYPES,
} from "../../types";
import { useT, Locale } from "../../i18n";
import { PROPERTY_META, CATEGORY_META, PropMeta } from "./serverPropsMeta";

interface Props {
  config: ServerConfig;
  onSave: (cfg: ServerConfig) => void;
}

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_name: string;
  release_url: string;
  release_notes: string;
}

const PERFORMANCE_PRESETS: Record<string, {
  viewDistance: string;
  simulationDistance: string;
  ramFloorMb: number;
}> = {
  balanced: { viewDistance: "8", simulationDistance: "6", ramFloorMb: 4096 },
  low_cpu: { viewDistance: "6", simulationDistance: "4", ramFloorMb: 3072 },
  heavy_modpack: { viewDistance: "8", simulationDistance: "5", ramFloorMb: 8192 },
  max_performance: { viewDistance: "10", simulationDistance: "8", ramFloorMb: 8192 },
};

function clampRemotePort(port: number) {
  if (!Number.isFinite(port)) return 47992;
  return Math.min(65535, Math.max(1024, Math.round(port)));
}

export default function ServerSettings({ config, onSave }: Props) {
  const { t } = useT();
  const [form, setForm] = useState(config);
  const [props, setProps] = useState<Record<string, string>>({});
  const [loadingProps, setLoadingProps] = useState(true);
  const [saved, setSaved] = useState(false);
  const [propsSaved, setPropsSaved] = useState(false);
  const [error, setError] = useState("");
  const [remoteStatus, setRemoteStatus] = useState<RemoteControlState | null>(null);
  const [remoteCopied, setRemoteCopied] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareTunnelState | null>(null);
  const [cloudflareBusy, setCloudflareBusy] = useState(false);
  const [cloudflareCopied, setCloudflareCopied] = useState(false);

  useEffect(() => {
    setForm(config);
  }, [config]);

  useEffect(() => {
    invoke<Record<string, string>>("get_server_properties")
      .then((p) => { setProps(p); setLoadingProps(false); })
      .catch(() => setLoadingProps(false));
  }, []);

  useEffect(() => {
    refreshRemoteStatus();
    refreshCloudflareStatus();
    const unlisten = listen<CloudflareTunnelState>("cloudflare-remote-update", async (e) => {
      setCloudflareStatus(e.payload);
      if (e.payload.url) {
        const updatedConfig = await invoke<ServerConfig>("get_config");
        setForm(updatedConfig);
        onSave(updatedConfig);
        const status = await invoke<RemoteControlState>("get_remote_control_status");
        setRemoteStatus(status);
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(""), 7000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  async function saveConfig() {
    setError("");
    try {
      const normalizedForm = {
        ...form,
        remote_control_port: clampRemotePort(form.remote_control_port),
      };
      const savedConfig = await invoke<ServerConfig>("save_config", { cfg: normalizedForm });
      setForm(savedConfig);
      onSave(savedConfig);
      await refreshRemoteStatus();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshRemoteStatus() {
    try {
      const status = await invoke<RemoteControlState>("get_remote_control_status");
      setRemoteStatus(status);
    } catch {
      setRemoteStatus(null);
    }
  }

  async function refreshCloudflareStatus() {
    try {
      const status = await invoke<CloudflareTunnelState>("get_cloudflare_remote_status");
      setCloudflareStatus(status);
    } catch {
      setCloudflareStatus(null);
    }
  }

  async function restartRemoteControl() {
    setError("");
    try {
      const status = await invoke<RemoteControlState>("restart_remote_control");
      setRemoteStatus(status);
    } catch (e) {
      setError(String(e));
    }
  }

  async function generateRemoteToken() {
    setError("");
    try {
      const token = await invoke<string>("generate_remote_token");
      setForm((f) => ({ ...f, remote_control_token: token }));
    } catch (e) {
      setError(String(e));
    }
  }

  async function copyRemoteUrl() {
    if (!remoteStatus?.url) return;
    await navigator.clipboard.writeText(remoteStatus.url);
    setRemoteCopied(true);
    setTimeout(() => setRemoteCopied(false), 1600);
  }

  async function startCloudflareRemote() {
    setError("");
    setCloudflareBusy(true);
    try {
      const savedConfig = await invoke<ServerConfig>("save_config", {
        cfg: {
          ...form,
          remote_control_enabled: true,
          remote_control_port: clampRemotePort(form.remote_control_port),
          cloudflare_remote_enabled: true,
        },
      });
      setForm(savedConfig);
      onSave(savedConfig);
      const remote = await invoke<RemoteControlState>("restart_remote_control");
      setRemoteStatus(remote);
      const tunnel = await invoke<CloudflareTunnelState>("start_cloudflare_remote");
      setCloudflareStatus(tunnel);
      const updatedConfig = await invoke<ServerConfig>("get_config");
      setForm(updatedConfig);
      onSave(updatedConfig);
      const status = await invoke<RemoteControlState>("get_remote_control_status");
      setRemoteStatus(status);
      if (!tunnel.url) {
        setError(tunnel.message || t("settings.cloudflareNoUrl"));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCloudflareBusy(false);
    }
  }

  async function stopCloudflareRemote() {
    setError("");
    setCloudflareBusy(true);
    try {
      const tunnel = await invoke<CloudflareTunnelState>("stop_cloudflare_remote");
      setCloudflareStatus(tunnel);
      // Persist disabled flag so it doesn't auto-start on next launch
      const savedConfig = await invoke<ServerConfig>("save_config", {
        cfg: { ...form, cloudflare_remote_enabled: false },
      });
      setForm(savedConfig);
      onSave(savedConfig);
    } catch (e) {
      setError(String(e));
    } finally {
      setCloudflareBusy(false);
    }
  }

  async function copyCloudflareUrl() {
    if (!cloudflareStatus?.url) return;
    await navigator.clipboard.writeText(cloudflareStatus.url);
    setCloudflareCopied(true);
    setTimeout(() => setCloudflareCopied(false), 1600);
  }

  async function saveProps() {
    setError("");
    try {
      await invoke("save_server_properties", { props });
      setPropsSaved(true);
      setTimeout(() => setPropsSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  }

  function applyPerformancePreset() {
    const preset = PERFORMANCE_PRESETS[form.performance_preset] ?? PERFORMANCE_PRESETS.balanced;
    setProps((p) => ({
      ...p,
      "view-distance": preset.viewDistance,
      "simulation-distance": preset.simulationDistance,
    }));
    setForm((f) => ({
      ...f,
      optimized_jvm_flags: true,
      ram_mb: Math.max(f.ram_mb, preset.ramFloorMb),
    }));
  }

  // (KEY_PROPS list removed — replaced by PROPERTY_META in serverPropsMeta.ts)

  return (
    <div className="page-transition" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{t("settings.title")}</h2>

      {error && <ErrorToast message={error} />}

      <UpdateCheckCard />

      {/* App config */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 14 }}>{t("settings.serverConfigSection")}</div>

        <div className="label">{t("settings.serverName")}</div>
        <input
          value={form.server_name}
          onChange={(e) => setForm((f) => ({ ...f, server_name: e.target.value }))}
          style={{ width: "100%", marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="label">{t("settings.ram")}</div>
            <input
              type="number"
              value={form.ram_mb}
              onChange={(e) => setForm((f) => ({ ...f, ram_mb: Number(e.target.value) }))}
              style={{ width: "100%" }}
              min={512}
              max={16384}
              step={512}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label">{t("settings.maxPlayers")}</div>
            <input
              type="number"
              value={form.max_players}
              onChange={(e) => setForm((f) => ({ ...f, max_players: Number(e.target.value) }))}
              style={{ width: "100%" }}
              min={1}
              max={100}
            />
          </div>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            cursor: "pointer",
            padding: "10px 12px",
            background: "var(--surface2)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <input
            type="checkbox"
            checked={form.auto_restart}
            onChange={(e) => setForm((f) => ({ ...f, auto_restart: e.target.checked }))}
            style={{ width: "auto", padding: 0, margin: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>♻ {t("settings.autoRestart")}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {t("settings.autoRestartDesc")}
            </div>
          </div>
        </label>

        {/* Auto-backup */}
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            background: "var(--surface2)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            📦 {t("settings.autoBackup")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
            {t("settings.autoBackupDesc")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="label">{t("settings.autoBackupInterval")}</div>
              <input
                type="number"
                value={form.backup_interval_minutes}
                min={0}
                max={1440}
                onChange={(e) =>
                  setForm((f) => ({ ...f, backup_interval_minutes: Number(e.target.value) }))
                }
                style={{ width: 120 }}
              />
            </div>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
              marginTop: 18,
            }}>
              <input
                type="checkbox"
                checked={form.backup_include_logs}
                onChange={(e) => setForm((f) => ({ ...f, backup_include_logs: e.target.checked }))}
                style={{ width: "auto", padding: 0, margin: 0 }}
              />
              {t("settings.autoBackupIncludeLogs")}
            </label>
          </div>
        </div>

        {/* Performance */}
        <div
          style={{
            marginBottom: 14,
            padding: "12px",
            background: "linear-gradient(135deg, rgba(139,92,246,0.13), rgba(56,189,248,0.07))",
            border: "1px solid rgba(139,92,246,0.26)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            ⚡ {t("settings.performance")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.45 }}>
            {t("settings.performanceDesc")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            <div>
              <div className="label">{t("settings.performancePreset")}</div>
              <select
                value={form.performance_preset}
                onChange={(e) => setForm((f) => ({ ...f, performance_preset: e.target.value }))}
                style={{ width: "100%" }}
              >
                <option value="balanced">{t("settings.presetBalanced")}</option>
                <option value="low_cpu">{t("settings.presetLowCpu")}</option>
                <option value="heavy_modpack">{t("settings.presetHeavyModpack")}</option>
                <option value="max_performance">{t("settings.presetMaxPerformance")}</option>
              </select>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 20,
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <input
                type="checkbox"
                checked={form.optimized_jvm_flags}
                onChange={(e) => setForm((f) => ({ ...f, optimized_jvm_flags: e.target.checked }))}
                style={{ width: "auto", padding: 0, margin: 0 }}
              />
              {t("settings.jvmFlags")}
            </label>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45, marginBottom: 10 }}>
            {t("settings.jvmFlagsDesc")} {t("settings.presetHint")}
          </div>
          <button className="btn btn-sm" onClick={applyPerformancePreset}>
            {t("settings.applyPreset")}
          </button>
        </div>

        {/* Remote Control — section header */}
        <div style={{ marginBottom: 8, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            🖥 {t("settings.remoteControl")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {t("settings.remoteControlDesc")}
          </div>
        </div>

        {/* Card 1 — LAN Remote */}
        <RemoteCard
          accent="cyan"
          icon="🏠"
          title={t("settings.lanRemoteTitle")}
          desc={t("settings.lanRemoteDesc")}
          enabled={form.remote_control_enabled}
          onToggle={(v) => setForm((f) => ({ ...f, remote_control_enabled: v }))}
          running={!!remoteStatus?.running}
          url={remoteStatus?.lan_url || (remoteStatus?.public_url ? "" : remoteStatus?.url || "")}
          urlLabel={t("settings.lanRemoteIpLabel")}
          urlPlaceholder={
            form.remote_control_enabled
              ? t("settings.remoteSaveHint")
              : t("settings.lanRemoteEnableHint")
          }
          copied={remoteCopied}
          onCopy={async () => {
            const u = remoteStatus?.lan_url || remoteStatus?.url;
            if (!u) return;
            await navigator.clipboard.writeText(u);
            setRemoteCopied(true);
            setTimeout(() => setRemoteCopied(false), 1600);
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 12, marginTop: 12 }}>
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
                style={{ width: "100%" }}
                disabled={!form.remote_control_enabled}
              />
            </div>
            <div>
              <div className="label">{t("settings.remoteToken")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  readOnly
                  value={form.remote_control_token || t("settings.remoteNoToken")}
                  style={{ width: "100%", fontFamily: "var(--font-mono)" }}
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

        {/* Card 2 — Cloudflare Public */}
        <RemoteCard
          accent="orange"
          icon="☁"
          title={t("settings.cloudflareTitle")}
          desc={t("settings.cloudflareDesc")}
          enabled={form.cloudflare_remote_enabled}
          onToggle={async (v) => {
            // Toggle is the live action — start/stop the tunnel + persist.
            if (v) {
              if (!form.remote_control_enabled) {
                setError(t("settings.cloudflareLanRequired"));
                return;
              }
              setForm((f) => ({ ...f, cloudflare_remote_enabled: true }));
              await startCloudflareRemote();
            } else {
              setForm((f) => ({ ...f, cloudflare_remote_enabled: false }));
              await stopCloudflareRemote();
            }
          }}
          disabled={!form.remote_control_enabled || cloudflareBusy}
          running={!!cloudflareStatus?.running}
          url={cloudflareStatus?.url || ""}
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
        />

        {/* Optional pre-existing public tunnel URL (manual override) */}
        <details style={{ marginBottom: 14 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
            {t("settings.remotePublicUrlAdvanced")}
          </summary>
          <div style={{ marginTop: 8 }}>
            <input
              value={form.remote_control_public_url}
              onChange={(e) => setForm((f) => ({ ...f, remote_control_public_url: e.target.value }))}
              placeholder="https://example.trycloudflare.com"
              style={{ width: "100%", marginBottom: 6 }}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
              {t("settings.remotePublicUrlDesc", { port: String(form.remote_control_port) })}
            </div>
          </div>
        </details>

        <button className="btn btn-primary btn-sm" onClick={saveConfig}>
          {saved ? `✓ ${t("common.saved")}` : t("common.save")}
        </button>
      </div>

      {/* Version / Mod Loader change */}
      <VersionChangeCard config={config} onSave={onSave} />

      {/* Server properties — friendly UI grouped by category */}
      <PropertiesEditor
        loadingProps={loadingProps}
        props={props}
        setProps={setProps}
        propsSaved={propsSaved}
        saveProps={saveProps}
      />


      <ToolsSection />
    </div>
  );
}

function ErrorToast({ message }: { message: string }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      <div className="toast toast-error">
        {message}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable card for a single remote-access service (LAN or Cloudflare).
// Shows: title row with toggle, description, URL/IP display, copy button,
// status pill, and any extra config (children).
// ─────────────────────────────────────────────────────────────────────────────

interface RemoteCardProps {
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
  children?: React.ReactNode;
}

function RemoteCard({
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
  children,
}: RemoteCardProps) {
  const palette = accent === "cyan"
    ? {
        bg: "linear-gradient(135deg, rgba(56,189,248,0.10), rgba(99,102,241,0.06))",
        border: "rgba(56,189,248,0.30)",
        glow: "rgba(56,189,248,0.18)",
        urlBg: "rgba(56,189,248,0.07)",
        urlBorder: "rgba(56,189,248,0.25)",
      }
    : {
        bg: "linear-gradient(135deg, rgba(251,146,60,0.10), rgba(244,114,182,0.06))",
        border: "rgba(251,146,60,0.30)",
        glow: "rgba(251,146,60,0.18)",
        urlBg: "rgba(251,146,60,0.07)",
        urlBorder: "rgba(251,146,60,0.25)",
      };

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "14px 14px 12px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: "var(--radius)",
        boxShadow: enabled && running ? `0 0 0 1px ${palette.glow}` : "none",
        transition: "box-shadow 0.2s ease",
      }}
    >
      {/* Title row with toggle */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
            <StatusPill running={running} enabled={enabled} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {desc}
          </div>
        </div>
        <Toggle disabled={disabled} on={enabled} onChange={onToggle} />
      </div>

      {/* URL display */}
      <div style={{ marginTop: 12 }}>
        <div className="label" style={{ marginBottom: 4 }}>{urlLabel}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
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
          <button
            className="btn btn-sm"
            disabled={!url}
            onClick={onCopy}
            style={{ flexShrink: 0 }}
          >
            {copied ? "✓" : "📋"}
          </button>
        </div>
      </div>

      {children}
    </div>
  );
}

function Toggle({
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
        background: on ? "var(--accent)" : "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background 0.18s ease",
        padding: 0,
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
          transition: "left 0.18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

function StatusPill({ running, enabled }: { running: boolean; enabled: boolean }) {
  if (running) {
    return (
      <span
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          padding: "2px 8px", borderRadius: 999,
          background: "rgba(74,222,128,0.15)", color: "var(--accent)",
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
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
        padding: "2px 8px", borderRadius: 999,
        background: "rgba(255,255,255,0.06)", color: "var(--text-muted)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      ○ {enabled ? "STARTING…" : "OFF"}
    </span>
  );
}

function UpdateCheckCard() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    try {
      const result = await invoke<UpdateInfo>("check_for_update");
      setInfo(result);
    } catch (e) {
      setError(t("settings.updateCheckFailed", { err: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function openRelease() {
    if (!info) return;
    try {
      await invoke("open_update_url", { url: info.release_url });
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⬇ {t("settings.updateSection")}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {t("settings.updateDesc")}
          </div>
        </div>
        <button className="btn btn-sm" disabled={busy} onClick={check}>
          {busy ? t("settings.checkingUpdates") : t("settings.checkUpdates")}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: 10,
          color: "var(--red)",
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.4)",
          borderRadius: "var(--radius-sm)",
          padding: "8px 12px",
          fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {info && !error && (
        <div style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "9px 12px",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${info.update_available ? "rgba(56,189,248,0.45)" : "rgba(74,222,128,0.35)"}`,
          background: info.update_available ? "rgba(56,189,248,0.08)" : "rgba(74,222,128,0.08)",
          fontSize: 12,
        }}>
          <div style={{ color: info.update_available ? "var(--blue)" : "var(--green)" }}>
            {info.update_available
              ? t("update.available", { v: info.latest_version })
              : t("settings.upToDate")}
          </div>
          {info.update_available && (
            <button className="btn btn-primary btn-sm" onClick={openRelease}>
              ⬇ {t("update.confirm")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Version + Mod Loader change card
// ─────────────────────────────────────────────────────────────────────────────

function VersionChangeCard({
  config,
  onSave,
}: {
  config: ServerConfig;
  onSave: (cfg: ServerConfig) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [serverType, setServerType] = useState<ServerType>(config.server_type);
  const [mcVersion, setMcVersion] = useState(config.minecraft_version);
  const [loaderVersion, setLoaderVersion] = useState<string | null>(config.loader_version);

  const [versions, setVersions] = useState<McVersion[]>([]);
  const [paperVersions, setPaperVersions] = useState<string[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingLoaders, setLoadingLoaders] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress>({ message: "", progress: 0 });
  const [installError, setInstallError] = useState("");

  const meta = SERVER_TYPES.find((s) => s.id === serverType)!;

  async function loadVersionsFor(type: ServerType) {
    setFetchError("");
    setLoadingVersions(true);
    try {
      if (type === "paper") {
        const v = await invoke<string[]>("fetch_paper_versions");
        setPaperVersions(v);
        if (v.length > 0 && !v.includes(mcVersion)) setMcVersion(v[0]);
      } else {
        const v = await invoke<McVersion[]>("fetch_mc_versions");
        setVersions(v);
        if (v.length > 0 && !v.find((x) => x.id === mcVersion)) setMcVersion(v[0].id);
      }
    } catch (e) {
      setFetchError(t("settings.fetchVersionsFailed", { err: String(e) }));
    } finally {
      setLoadingVersions(false);
    }
  }

  async function loadLoaders(type: ServerType, mc: string) {
    if (!SERVER_TYPES.find((s) => s.id === type)?.needsLoader) {
      setLoaderVersions([]);
      setLoaderVersion(null);
      return;
    }
    setFetchError("");
    setLoadingLoaders(true);
    setLoaderVersions([]);
    try {
      const cmd =
        type === "paper" ? "fetch_paper_builds" :
        type === "forge" ? "fetch_forge_versions" :
        type === "fabric" ? "fetch_fabric_versions" :
        "fetch_neoforge_versions";
      const v = await invoke<LoaderVersion[]>(cmd, { mcVersion: mc });
      setLoaderVersions(v);
      if (v.length > 0) setLoaderVersion(v[0].version);
    } catch (e) {
      setFetchError(t("settings.fetchLoadersFailed", { err: String(e) }));
    } finally {
      setLoadingLoaders(false);
    }
  }

  async function startEdit() {
    setEditing(true);
    setInstallError("");
    await loadVersionsFor(serverType);
    if (meta.needsLoader) await loadLoaders(serverType, mcVersion);
  }

  async function pickType(newType: ServerType) {
    setServerType(newType);
    setLoaderVersion(null);
    await loadVersionsFor(newType);
    const newMeta = SERVER_TYPES.find((s) => s.id === newType)!;
    if (newMeta.needsLoader) {
      const targetMc = newType === "paper" ? (paperVersions[0] ?? mcVersion) : mcVersion;
      await loadLoaders(newType, targetMc);
    } else {
      setLoaderVersions([]);
    }
  }

  async function pickMcVersion(v: string) {
    setMcVersion(v);
    if (meta.needsLoader) await loadLoaders(serverType, v);
  }

  async function reinstall() {
    setInstalling(true);
    setInstallError("");
    const unlisten = await listen<InstallProgress>("install-progress", (e) =>
      setProgress(e.payload)
    );
    try {
      const newCfg: ServerConfig = {
        ...config,
        server_type: serverType,
        minecraft_version: mcVersion,
        loader_version: loaderVersion,
        setup_complete: false,
      };
      const cfg = await invoke<ServerConfig>("install_server", { cfg: newCfg });
      unlisten();
      onSave(cfg);
      setInstalling(false);
      setEditing(false);
    } catch (e) {
      unlisten();
      setInstallError(String(e));
      setInstalling(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 14 }}>🎮 {t("settings.versionSection")}</div>

      {!editing ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 22 }}>{meta.icon}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {meta.name}{loaderVersion ? ` ${loaderVersion}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Minecraft {mcVersion}
              </div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={startEdit}>
            🔄 {t("settings.changeVersion")}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
            {t("settings.versionHint")}
          </div>
        </>
      ) : (
        <>
          <div className="label">{t("settings.serverType")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            {SERVER_TYPES.map((s) => {
              const selected = serverType === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => pickType(s.id)}
                  disabled={installing}
                  style={{
                    padding: 10,
                    textAlign: "left",
                    borderRadius: 8,
                    background: selected ? "var(--surface3)" : "var(--surface2)",
                    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    color: "var(--text)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{s.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="label">{t("settings.minecraftVersion")}</div>
          {loadingVersions ? (
            <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>{t("settings.fetchingVersions")}</div>
          ) : fetchError ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                color: "var(--red)", background: "#2a1515",
                border: "1px solid var(--red)", borderRadius: 6,
                padding: "8px 12px", fontSize: 12,
              }}>
                {fetchError}
              </div>
              <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => loadVersionsFor(serverType)}>
                🔄 Retry
              </button>
            </div>
          ) : (
            <select
              value={mcVersion}
              onChange={(e) => pickMcVersion(e.target.value)}
              disabled={installing}
              style={{ width: "100%", marginBottom: 14 }}
            >
              {(serverType === "paper" ? paperVersions : versions.map((v) => v.id)).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          )}

          {meta.needsLoader && (
            <>
              <div className="label">
                {serverType === "paper"
                  ? t("settings.paperBuild")
                  : t("settings.loaderVersion", { name: meta.name })}
              </div>
              {loadingLoaders ? (
                <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>{t("settings.fetchingLoaders")}</div>
              ) : loaderVersions.length === 0 ? (
                <div style={{
                  color: "var(--yellow)", background: "#2a2200",
                  border: "1px solid var(--yellow)", borderRadius: 6,
                  padding: "8px 12px", fontSize: 12, marginBottom: 14,
                }}>
                  {t("settings.noLoaderFound", { name: meta.name, mc: mcVersion })}
                </div>
              ) : (
                <select
                  value={loaderVersion ?? ""}
                  onChange={(e) => setLoaderVersion(e.target.value)}
                  disabled={installing}
                  style={{ width: "100%", marginBottom: 14 }}
                >
                  {loaderVersions.map((v) => (
                    <option key={v.version} value={v.version}>{v.label}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {installing && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "var(--blue)", marginBottom: 6 }}>
                {progress.message || t("settings.reinstalling")}
              </div>
              <div style={{ background: "var(--surface2)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{
                  background: "var(--accent)", height: "100%",
                  width: `${Math.round(progress.progress * 100)}%`,
                  transition: "width 0.3s ease", borderRadius: 4,
                }} />
              </div>
            </div>
          )}

          {installError && (
            <div style={{
              color: "var(--red)", background: "#2a1515",
              border: "1px solid var(--red)", borderRadius: 6,
              padding: "8px 12px", fontSize: 12, marginBottom: 14,
            }}>
              {installError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-sm"
              disabled={installing}
              onClick={() => {
                setEditing(false);
                setServerType(config.server_type);
                setMcVersion(config.minecraft_version);
                setLoaderVersion(config.loader_version);
                setInstallError("");
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={
                installing ||
                loadingVersions ||
                loadingLoaders ||
                (meta.needsLoader && !loaderVersion)
              }
              onClick={reinstall}
            >
              {installing ? t("settings.reinstalling") : t("settings.reinstallButton")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Friendly server.properties editor — typed inputs grouped by category
// ─────────────────────────────────────────────────────────────────────────────

function PropertiesEditor({
  loadingProps,
  props,
  setProps,
  propsSaved,
  saveProps,
}: {
  loadingProps: boolean;
  props: Record<string, string>;
  setProps: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  propsSaved: boolean;
  saveProps: () => void;
}) {
  const { t, locale } = useT();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (loadingProps) {
    return (
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 14 }}>{t("settings.serverProperties")}</div>
        <div style={{ color: "var(--text-muted)" }}>{t("common.loading")}</div>
      </div>
    );
  }

  const knownKeys = new Set(PROPERTY_META.map((m) => m.key));
  const unknownKeys = Object.keys(props).filter((k) => !knownKeys.has(k)).sort();

  // Group known props by category, only including ones that exist in props
  const byCategory: Record<string, PropMeta[]> = {};
  for (const meta of PROPERTY_META) {
    if (!(meta.key in props)) continue;
    if (!byCategory[meta.category]) byCategory[meta.category] = [];
    byCategory[meta.category].push(meta);
  }

  const categoryOrder: PropMeta["category"][] = ["gameplay", "world", "players", "network", "advanced"];

  const setValue = (key: string, value: string) => {
    setProps((p) => ({ ...p, [key]: value }));
  };

  return (
    <div className="card">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600 }}>🌐 {t("settings.serverProperties")}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
          {t("settings.serverPropertiesSubtitle")}
        </div>
      </div>

      {categoryOrder.map((cat) => {
        const items = byCategory[cat] ?? [];
        if (items.length === 0) return null;
        if (cat === "advanced" && !showAdvanced) {
          return (
            <button
              key={cat}
              className="btn btn-sm"
              onClick={() => setShowAdvanced(true)}
              style={{ marginBottom: 12 }}
            >
              ▸ {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label[locale]} ({items.length})
            </button>
          );
        }
        return (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label[locale]}
            </div>
            {items.map((meta) => (
              <PropRow
                key={meta.key}
                meta={meta}
                value={props[meta.key] ?? ""}
                onChange={(v) => setValue(meta.key, v)}
                locale={locale}
              />
            ))}
          </div>
        );
      })}

      {unknownKeys.length > 0 && (
        <>
          <button
            className="btn btn-sm"
            onClick={() => setShowRaw(!showRaw)}
            style={{ marginBottom: 12 }}
          >
            {showRaw ? "▾" : "▸"} {t("settings.unknownProperties")} ({unknownKeys.length})
          </button>
          {showRaw && (
            <div style={{ marginBottom: 14 }}>
              {unknownKeys.map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 200,
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                      wordBreak: "break-all",
                    }}
                  >
                    {key}
                  </div>
                  <input
                    value={props[key] ?? ""}
                    onChange={(e) => setValue(key, e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button className="btn btn-primary btn-sm" style={{ marginTop: 4 }} onClick={saveProps}>
        {propsSaved ? `✓ ${t("common.saved")}` : t("common.save")}
      </button>
      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>
        {t("settings.restartHint")}
      </div>
    </div>
  );
}

function PropRow({
  meta,
  value,
  onChange,
  locale,
}: {
  meta: PropMeta;
  value: string;
  onChange: (v: string) => void;
  locale: Locale;
}) {
  const isRecommended = meta.recommended != null && value === meta.recommended;
  const { t } = useT();
  const recommendedLabel = t("settings.recommended");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1.2fr)",
        gap: 14,
        alignItems: "start",
        padding: "10px 0",
        borderBottom: "1px dashed var(--border)",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, opacity: meta.locked ? 0.6 : 1 }}>
          {meta.label[locale]}
        </div>
        {meta.desc && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 4 }}>
            {meta.desc[locale]}
          </div>
        )}
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }}>
          {meta.key}
        </div>
        {meta.locked && meta.lockReason && (
          <div style={{
            marginTop: 4, fontSize: 10, color: "var(--yellow)",
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
            padding: "3px 8px", borderRadius: 4, display: "inline-block",
          }}>
            🔒 {meta.lockReason[locale]}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {renderInput(meta, value, onChange, locale)}
        {meta.recommended != null && !isRecommended && !meta.locked && (
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {recommendedLabel}: <code style={{ color: "var(--accent)" }}>{meta.recommended}</code>
            <button
              onClick={() => onChange(meta.recommended!)}
              style={{
                marginLeft: 8, fontSize: 10, padding: "2px 8px",
                background: "transparent", color: "var(--accent)",
                border: "1px solid rgba(139,92,246,0.45)", borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {t("common.apply")}
            </button>
          </div>
        )}
        {isRecommended && !meta.locked && (
          <div style={{ fontSize: 10, color: "var(--accent)" }}>
            ✓ {recommendedLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function renderInput(
  meta: PropMeta,
  value: string,
  onChange: (v: string) => void,
  locale: Locale,
) {
  const disabled = meta.locked === true;

  if (meta.kind === "toggle") {
    const isOn = value === "true";
    return (
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer" }}>
        <input
          type="checkbox"
          checked={isOn}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          style={{ width: "auto", padding: 0, margin: 0 }}
        />
        <span style={{ fontSize: 12, color: isOn ? "var(--accent)" : "var(--text-muted)" }}>
          {isOn ? (locale === "vi" ? "Bật" : "On") : (locale === "vi" ? "Tắt" : "Off")}
        </span>
      </label>
    );
  }

  if (meta.kind === "select" && meta.options) {
    return (
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%" }}
      >
        {meta.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label[locale]}
          </option>
        ))}
      </select>
    );
  }

  if (meta.kind === "number") {
    return (
      <input
        type="number"
        value={value}
        disabled={disabled}
        min={meta.min}
        max={meta.max}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%" }}
      />
    );
  }

  // text
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools & Maintenance — backup + debug export
// ─────────────────────────────────────────────────────────────────────────────

interface BackupProgress { files: number; bytes: number; current: string }

function ToolsSection() {
  const { t } = useT();
  const [busy, setBusy] = useState<"backup" | "restore" | "debug" | null>(null);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");

  useEffect(() => {
    invoke<ServerStatus>("get_server_status").then(setServerStatus).catch(() => {});
    const u1 = listen<ServerStatus>("server-status", (e) => setServerStatus(e.payload));
    const u2 = listen<BackupProgress>("backup-progress", (e) => setProgress(e.payload));
    const u3 = listen<BackupProgress>("restore-progress", (e) => setProgress(e.payload));
    return () => { u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); };
  }, []);

  async function runRestore() {
    setResultMsg(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const src = await open({
        multiple: false,
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });
      if (typeof src !== "string") return;
      setRestoreConfirm(src);
    } catch (e) {
      setResultMsg({ type: "err", text: String(e) });
    }
  }

  async function confirmRestore(src: string) {
    setRestoreConfirm(null);
    setBusy("restore");
    setProgress(null);
    try {
      const files = await invoke<number>("restore_backup", { src });
      setResultMsg({ type: "ok", text: t("tools.restore.success", { files: String(files) }) });
    } catch (e) {
      setResultMsg({ type: "err", text: String(e) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function runBackup() {
    setResultMsg(null);
    setProgress(null);
    try {
      const defaultName = await invoke<string>("default_backup_filename");
      const downloads   = await invoke<string>("default_downloads_dir");
      const dest = await saveFileDialog({
        defaultPath: `${downloads}/${defaultName}`,
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });
      if (!dest) return;
      setBusy("backup");
      const result = await invoke<{ files: number; bytes: number; path: string }>(
        "create_backup",
        { dest, includeLogs }
      );
      const mb = (result.bytes / (1024 * 1024)).toFixed(1);
      setResultMsg({
        type: "ok",
        text: t("tools.backup.success", { files: String(result.files), mb, path: result.path }),
      });
    } catch (e) {
      setResultMsg({ type: "err", text: String(e) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function runDebugExport() {
    setResultMsg(null);
    try {
      const defaultName = await invoke<string>("default_debug_filename");
      const downloads   = await invoke<string>("default_downloads_dir");
      const dest = await saveFileDialog({
        defaultPath: `${downloads}/${defaultName}`,
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });
      if (!dest) return;
      setBusy("debug");
      const files = await invoke<number>("export_debug", { dest });
      setResultMsg({
        type: "ok",
        text: t("tools.debug.success", { files: String(files), path: dest }),
      });
    } catch (e) {
      setResultMsg({ type: "err", text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  const serverRunning = serverStatus === "running" || serverStatus === "starting";

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 14 }}>🛠 {t("tools.title")}</div>

      {/* Backup */}
      <div style={{
        padding: "12px 14px",
        background: "var(--surface2)",
        borderRadius: "var(--radius-sm)",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>📦 {t("tools.backup.title")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
              {t("tools.backup.desc")}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy === "backup"}
            onClick={runBackup}
          >
            {busy === "backup" ? "…" : t("tools.backup.button")}
          </button>
        </div>

        <label style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginTop: 10, fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={includeLogs}
            onChange={(e) => setIncludeLogs(e.target.checked)}
            style={{ width: "auto", padding: 0, margin: 0 }}
          />
          {t("tools.backup.includeLogs")}
        </label>

        {serverRunning && (
          <div style={{
            marginTop: 10, fontSize: 12, color: "var(--yellow)",
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)",
            padding: "6px 10px", borderRadius: "var(--radius-sm)",
          }}>
            {t("tools.backup.warnRunning")}
          </div>
        )}

        {busy === "backup" && progress && (
          <div className="fade-in" style={{
            marginTop: 10, fontSize: 12, color: "var(--blue)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              display: "inline-block", width: 10, height: 10,
              border: "2px solid var(--blue)", borderRightColor: "transparent",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
            {t("tools.backup.running", {
              files: String(progress.files),
              mb: (progress.bytes / 1024 / 1024).toFixed(1),
            })}
          </div>
        )}
      </div>

      {/* Restore */}
      <div style={{
        padding: "12px 14px",
        background: "var(--surface2)",
        borderRadius: "var(--radius-sm)",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>♻ {t("tools.restore.title")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
              {t("tools.restore.desc")}
            </div>
          </div>
          <button
            className="btn btn-sm"
            disabled={busy === "restore" || serverRunning}
            onClick={runRestore}
            title={serverRunning ? t("tools.restore.warnRunning") : ""}
          >
            {busy === "restore" ? "…" : t("tools.restore.button")}
          </button>
        </div>
        {serverRunning && (
          <div style={{
            marginTop: 10, fontSize: 12, color: "var(--yellow)",
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)",
            padding: "6px 10px", borderRadius: "var(--radius-sm)",
          }}>
            {t("tools.restore.warnRunning")}
          </div>
        )}
        {busy === "restore" && progress && (
          <div className="fade-in" style={{
            marginTop: 10, fontSize: 12, color: "var(--blue)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              display: "inline-block", width: 10, height: 10,
              border: "2px solid var(--blue)", borderRightColor: "transparent",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
            {t("tools.restore.running", { files: String(progress.files) })}
          </div>
        )}
      </div>

      {/* Restore confirmation */}
      {restoreConfirm && (
        <div className="modal-backdrop" onClick={() => setRestoreConfirm(null)}>
          <div className="modal" style={{ padding: 24, maxWidth: 460, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, marginBottom: 14, lineHeight: 1.6 }}>
              {t("tools.restore.confirmTitle")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, fontFamily: "monospace", wordBreak: "break-all" }}>
              {restoreConfirm}
            </div>
            <div style={{
              fontSize: 12, color: "var(--yellow)",
              background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)",
              padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 16, lineHeight: 1.5,
            }}>
              ⚠ {t("tools.restore.confirmWarning")}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={() => setRestoreConfirm(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => confirmRestore(restoreConfirm)}>
                {t("tools.restore.button")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-generate chunks */}
      <PregenCard serverRunning={serverRunning} />

      {/* Debug Export */}
      <div style={{
        padding: "12px 14px",
        background: "var(--surface2)",
        borderRadius: "var(--radius-sm)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>🐞 {t("tools.debug.title")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
              {t("tools.debug.desc")}
            </div>
          </div>
          <button
            className="btn btn-sm"
            disabled={busy === "debug"}
            onClick={runDebugExport}
          >
            {busy === "debug" ? "…" : t("tools.debug.button")}
          </button>
        </div>
      </div>

      {/* Result message */}
      {resultMsg && (
        <div className="fade-in" style={{
          marginTop: 12,
          padding: "8px 12px",
          fontSize: 12,
          color: resultMsg.type === "ok" ? "var(--green)" : "var(--red)",
          background: resultMsg.type === "ok" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
          border: `1px solid ${resultMsg.type === "ok" ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
          borderRadius: "var(--radius-sm)",
          wordBreak: "break-all",
        }}>
          {resultMsg.text}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-generate Chunks card
// ─────────────────────────────────────────────────────────────────────────────

interface PregenState {
  running: boolean;
  total: number;
  completed: number;
  cancel_requested: boolean;
}

function PregenCard({ serverRunning }: { serverRunning: boolean }) {
  const { t } = useT();
  const [count, setCount] = useState(1000);
  const [state, setState] = useState<PregenState>({
    running: false, total: 0, completed: 0, cancel_requested: false,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<PregenState>("get_pregen_state").then(setState).catch(() => {});
    const u = listen<PregenState>("pregen-update", (e) => setState(e.payload));
    return () => { u.then((f) => f()); };
  }, []);

  // Estimate: ~120ms per chunk + 1.5s minimum per batch (16x16=256 chunks per batch)
  const estimatedSecs = Math.ceil(count * 0.12);
  const estMins = Math.max(1, Math.ceil(estimatedSecs / 60));
  const side = Math.ceil(Math.sqrt(count));
  const sideOdd = side % 2 === 0 ? side + 1 : side;
  const blocksAcross = sideOdd * 16;

  async function start() {
    setError("");
    try {
      await invoke("pregenerate_chunks", { totalChunks: count });
    } catch (e) {
      setError(String(e));
    }
  }

  async function cancel() {
    try { await invoke("cancel_pregenerate"); } catch {}
  }

  const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;

  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--surface2)",
      borderRadius: "var(--radius-sm)",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>🗺 {t("tools.pregen.title")}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
            {t("tools.pregen.desc")}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div className="label">{t("tools.pregen.field")}</div>
          <input
            type="number"
            value={count}
            min={9}
            max={50000}
            step={100}
            disabled={state.running}
            onChange={(e) => setCount(Math.max(9, Number(e.target.value)))}
            style={{ width: 140 }}
          />
        </div>
        {!state.running ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={!serverRunning}
            onClick={start}
            title={!serverRunning ? t("tools.pregen.serverNeeded") : ""}
          >
            ▶ {t("tools.pregen.button")}
          </button>
        ) : (
          <button className="btn btn-sm btn-danger" onClick={cancel} disabled={state.cancel_requested}>
            ■ {t("tools.pregen.cancel")}
          </button>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
        {t("tools.pregen.fieldHint")}
      </div>

      {!state.running && !serverRunning && (
        <div style={{
          marginTop: 10, fontSize: 12, color: "var(--yellow)",
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)",
          padding: "6px 10px", borderRadius: "var(--radius-sm)",
        }}>
          {t("tools.pregen.serverNeeded")}
        </div>
      )}

      {!state.running && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          {t("tools.pregen.estTime", { mins: String(estMins), area: String(blocksAcross) })}
        </div>
      )}

      {state.running && (
        <div className="fade-in" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--blue)", marginBottom: 6 }}>
            {t("tools.pregen.progress", {
              done: String(state.completed),
              total: String(state.total),
              pct: String(pct),
            })}
          </div>
          <div style={{ background: "var(--surface3)", borderRadius: 999, height: 8, overflow: "hidden" }}>
            <div style={{
              background: "var(--accent)", height: "100%",
              width: `${pct}%`, transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, fontSize: 12, color: "var(--red)",
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.4)",
          padding: "6px 10px", borderRadius: "var(--radius-sm)",
        }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

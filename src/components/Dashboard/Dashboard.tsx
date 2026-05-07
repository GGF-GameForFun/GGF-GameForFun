import { useEffect, useState } from "react";
import { invoke, listen } from "../../tauri";
import { ServerConfig, ServerStatus, ServerStats, ServerType, PlayitState, SERVER_TYPES } from "../../types";
import { useT } from "../../i18n";
import RingMeter from "./RingMeter";

interface Props {
  config: ServerConfig;
}

const EMPTY_STATS: ServerStats = {
  cpu_percent: 0, ram_used_mb: 0, ram_max_mb: 0,
  disk_read_kb_s: 0, disk_write_kb_s: 0,
  disk_used_mb: 0, disk_total_mb: 0,
  tps: 0,
  players_online: 0, players_max: 0, uptime_seconds: 0,
};

const TPS_SUPPORTED: ServerType[] = ["vanilla", "paper", "forge", "fabric", "neoforge"];

export default function Dashboard({ config }: Props) {
  const { t } = useT();
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [stats, setStats] = useState<ServerStats>(EMPTY_STATS);
  const [playit, setPlayit] = useState<PlayitState>({ running: false, address: null, claim_url: null, pid: null });
  const [actionErr, setActionErr] = useState("");
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    invoke<ServerStatus>("get_server_status").then(setStatus).catch(() => {});
    invoke<ServerStats>("get_server_stats").then(setStats).catch(() => {});
    invoke<PlayitState>("get_playit_status").then(setPlayit).catch(() => {});
    const u1 = listen<ServerStatus>("server-status", (e) => setStatus(e.payload));
    const u2 = listen<ServerStats>("server-stats", (e) => setStats(e.payload));
    const u3 = listen<PlayitState>("playit-update", (e) => setPlayit(e.payload));
    return () => { u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (status !== "running") { setUptime(0); return; }
    const t = setInterval(() => setUptime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  async function action(cmd: string) {
    setActionErr("");
    try { await invoke(cmd); } catch (e) { setActionErr(String(e)); }
  }

  function fmtUptime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  const meta = SERVER_TYPES.find((x) => x.id === config.server_type);
  const ramMax = stats.ram_max_mb || config.ram_mb;
  const ramPct = ramMax > 0 ? Math.min(100, (stats.ram_used_mb / ramMax) * 100) : 0;
  const cpuPct = Math.min(100, stats.cpu_percent);

  // Disk usage on the volume containing the server
  const diskTotal = stats.disk_total_mb;
  const diskUsed  = stats.disk_used_mb;
  const diskPct   = diskTotal > 0 ? Math.min(100, (diskUsed / diskTotal) * 100) : null;
  const diskUsedTotal = diskTotal > 0
    ? `${(diskUsed / 1024).toFixed(1)} / ${(diskTotal / 1024).toFixed(1)} GB`
    : t("tier.na");

  // TPS: 20 = perfect (vanilla MC tick rate). For unsupported server types,
  // pass null so the ring renders as N/A with a gray tier badge.
  const tpsSupported = TPS_SUPPORTED.includes(config.server_type);
  const tpsPct =
    !tpsSupported || stats.tps <= 0
      ? null
      : Math.min(100, (stats.tps / 20) * 100);
  const tpsCenter = !tpsSupported ? t("tier.na") : stats.tps > 0 ? stats.tps.toFixed(1) : "…";
  const tpsSubText = !tpsSupported ? "—" : "/ 20.0";

  const STATUS_LABEL: Record<ServerStatus, string> = {
    stopped:  t("common.offline"),
    starting: t("common.starting"),
    running:  t("common.online"),
    stopping: t("common.stopping"),
  };
  const STATUS_COLOR: Record<ServerStatus, string> = {
    stopped: "var(--text-muted)",
    starting: "var(--yellow)",
    running: "var(--accent)",
    stopping: "var(--yellow)",
  };

  return (
    <div className="page-transition" style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t("dashboard.title")}</h2>

      {/* Status / controls card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="label">{t("dashboard.serverStatus")}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: STATUS_COLOR[status], marginTop: 2 }}>
              <span className={`status-dot ${status}`} style={{ marginRight: 8 }} />
              {STATUS_LABEL[status]}
            </div>
            {status === "running" && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {t("dashboard.uptime")}: {fmtUptime(uptime)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {status === "stopped" && (
              <button className="btn btn-primary" onClick={() => action("start_server")}>
                ▶ {t("common.start")}
              </button>
            )}
            {status === "running" && (
              <>
                <button className="btn" onClick={() => action("restart_server")}>↻ {t("common.restart")}</button>
                <button className="btn" onClick={() => action("stop_server")}>■ {t("common.stop")}</button>
              </>
            )}
            {(status === "starting" || status === "stopping") && (
              <button className="btn" disabled>{STATUS_LABEL[status]}</button>
            )}
          </div>
        </div>
        {actionErr && (
          <div className="fade-in" style={{
            marginTop: 12, padding: "8px 12px", fontSize: 12, color: "var(--red)",
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.4)",
            borderRadius: "var(--radius-sm)",
          }}>⚠ {actionErr}</div>
        )}
      </div>

      {/* Rings: RAM · CPU · Disk · TPS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        marginBottom: 14,
      }}>
        <RingMeter
          icon="🧠"
          label={t("dashboard.ram")}
          percent={ramPct}
          centerText={`${ramPct.toFixed(0)}%`}
          subText={`${stats.ram_used_mb} / ${ramMax} MB`}
        />
        <RingMeter
          icon="⚡"
          label={t("dashboard.cpu")}
          percent={cpuPct}
          centerText={`${cpuPct.toFixed(0)}%`}
          subText={`${cpuPct.toFixed(1)} %`}
        />
        <RingMeter
          icon="💾"
          label={t("dashboard.disk")}
          percent={diskPct}
          centerText={diskPct === null ? "—" : `${diskPct.toFixed(0)}%`}
          subText={diskUsedTotal}
        />
        <RingMeter
          icon="🎯"
          label={t("dashboard.tps")}
          percent={tpsPct}
          centerText={tpsCenter}
          subText={tpsSubText}
          invert
        />
      </div>

      {/* Secondary stats row: players + disk I/O rates */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
        <Stat icon="👥" label={t("dashboard.players")} value={`${stats.players_online} / ${stats.players_max || config.max_players}`} />
        <Stat icon="📤" label={t("dashboard.diskWrite")} value={fmtRate(stats.disk_write_kb_s, t)} />
        <Stat icon="📥" label={t("dashboard.diskRead")}  value={fmtRate(stats.disk_read_kb_s, t)} />
      </div>

      {/* Server / Tunnel info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 14 }}>
        <div className="card card-hover">
          <div className="label">{t("dashboard.server")}</div>
          <div style={{ fontWeight: 600, marginTop: 4, fontSize: 14 }}>
            {meta?.icon ?? ""} {meta?.name ?? config.server_type}
            {config.loader_version ? ` ${config.loader_version}` : ""}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Minecraft {config.minecraft_version}
          </div>
        </div>

        <div className="card card-hover">
          <div className="label">{t("dashboard.tunnel")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span className={`status-dot ${playit.running ? "running" : "stopped"}`}
                  style={{ width: 8, height: 8 }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {playit.running
                ? (playit.address ?? t("dashboard.connectingTunnel"))
                : t("common.disconnected")}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            {t("dashboard.tunnelHint")}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>{t("dashboard.quickActions")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm" onClick={() => action("open_server_folder")}>
            📁 {t("dashboard.openServerFolder")}
          </button>
        </div>
      </div>
    </div>
  );
}


function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="card card-hover">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span className="label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function fmtRate(kbPerSec: number, t: (k: string) => string): string {
  if (kbPerSec < 0.1) return t("common.idle");
  if (kbPerSec < 1024) return `${kbPerSec.toFixed(1)} KB/s`;
  return `${(kbPerSec / 1024).toFixed(2)} MB/s`;
}

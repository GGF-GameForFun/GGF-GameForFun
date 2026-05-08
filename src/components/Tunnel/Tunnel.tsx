import { useEffect, useRef, useState } from "react";
import { invoke, listen } from "../../tauri";
import { PlayitState, ServerStatus } from "../../types";
import { useT } from "../../i18n";

export default function Tunnel() {
  const { t } = useT();
  const [playit, setPlayit] = useState<PlayitState>({
    running: false, address: null, claim_url: null, pid: null,
  });
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");
  const [serverPort, setServerPort] = useState("25565");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<PlayitState>("get_playit_status").then(setPlayit).catch(() => {});
    invoke<ServerStatus>("get_server_status").then(setServerStatus).catch(() => {});
    invoke<Record<string, string>>("get_server_properties")
      .then((props) => setServerPort(props["server-port"] || "25565"))
      .catch(() => {});
    const u1 = listen<PlayitState>("playit-update", (e) => setPlayit(e.payload));
    const u2 = listen<string>("playit-line", (e) => {
      setLines((l) => [...l.slice(-1500), e.payload]);
    });
    const u3 = listen<ServerStatus>("server-status", (e) => setServerStatus(e.payload));
    return () => { u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function action(cmd: string, label?: string) {
    setErr("");
    if (label) setBusy(label);
    try {
      const result = await invoke<PlayitState | null>(cmd);
      if (result && typeof result === "object" && "running" in result) {
        setPlayit(result);
      }
    }
    catch (e) { setErr(String(e)); }
    finally { setBusy(""); }
  }

  function copyAddress() {
    if (playit.address) {
      navigator.clipboard.writeText(playit.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="page-transition" style={{
      display: "flex", flexDirection: "column", height: "100%",
      padding: 24, paddingBottom: 0,
      maxWidth: 1100, margin: "0 auto", width: "100%",
    }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t("tunnel.title")}</h2>

      {/* Status card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`status-dot ${playit.running ? "running" : "stopped"}`} style={{ width: 10, height: 10 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{playit.running ? t("common.connected") : t("common.disconnected")}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {playit.running ? t("tunnel.active") : t("tunnel.inactive")}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!playit.running ? (
              <button
                className="btn btn-primary btn-sm"
                disabled={!!busy}
                onClick={() => action("setup_playit", t("tunnel.starting"))}
              >
                {busy ? "…" : `▶ ${t("common.start")}`}
              </button>
            ) : (
              <>
                <button
                  className="btn btn-sm"
                  disabled={!!busy}
                  onClick={() => action("refresh_playit_address", t("tunnel.refreshingAddress"))}
                >
                  ↻ {t("tunnel.refreshAddress")}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => action("stop_playit")}
                >
                  ■ {t("common.stop")}
                </button>
              </>
            )}
          </div>
        </div>

        {busy && (
          <div style={{
            color: "var(--blue)", fontSize: 12, marginTop: 10,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              display: "inline-block", width: 10, height: 10,
              border: "2px solid var(--blue)", borderRightColor: "transparent",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
            {busy}
          </div>
        )}

        {err && (
          <div style={{
            marginTop: 10, padding: "8px 12px", fontSize: 12,
            color: "var(--red)", background: "#2a1515",
            border: "1px solid var(--red)", borderRadius: 6,
          }}>⚠ {err}</div>
        )}
      </div>

      {/* Claim banner */}
      {playit.claim_url && !playit.address && (
        <div style={{
          background: "#2a2200", border: "1px solid var(--yellow)",
          borderRadius: 8, padding: "12px 16px", marginBottom: 14,
        }}>
          <div style={{ color: "var(--yellow)", fontWeight: 600, marginBottom: 6 }}>
            {t("tunnel.claimTitle")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            {t("tunnel.claimDesc")}
          </div>
          <a
            href={playit.claim_url} target="_blank" rel="noreferrer"
            style={{
              display: "inline-block", color: "var(--yellow)",
              background: "#1a1500", padding: "6px 10px", borderRadius: 4,
              fontFamily: "monospace", fontSize: 12, wordBreak: "break-all",
              textDecoration: "underline",
            }}
          >
            {playit.claim_url}
          </a>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🧪 {t("tunnel.diagnostics")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <DiagnosticRow ok={playit.running} label={t("tunnel.diagAgent")} />
          <DiagnosticRow ok={!playit.claim_url} warn={!!playit.claim_url} label={playit.claim_url ? t("tunnel.diagClaimNeeded") : t("tunnel.diagClaimReady")} />
          <DiagnosticRow ok={!!playit.address} warn={playit.running && !playit.address} label={playit.address ? t("tunnel.diagAddressFound") : t("tunnel.diagAddressMissing")} />
          <DiagnosticRow ok={serverStatus === "running"} warn={serverStatus === "starting"} label={serverStatus === "running" ? t("tunnel.diagServerRunning") : t("tunnel.diagServerNotRunning")} />
          <DiagnosticRow ok={serverPort === "25565"} warn={serverPort !== "25565"} label={t("tunnel.diagLocalPort", { port: serverPort })} />
        </div>
      </div>

      {playit.running && !playit.address && !playit.claim_url && (
        <div className="card" style={{ marginBottom: 14, background: "#101827", borderColor: "rgba(59,130,246,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div style={{ color: "var(--blue)", fontWeight: 700, marginBottom: 4 }}>
                {t("tunnel.waitingAddress")}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {t("tunnel.waitingAddressHint")}
              </div>
            </div>
            <button
              className="btn btn-sm"
              disabled={!!busy}
              onClick={() => action("refresh_playit_address", t("tunnel.refreshingAddress"))}
              style={{ flexShrink: 0 }}
            >
              ↻ {t("tunnel.refreshAddress")}
            </button>
          </div>
        </div>
      )}

      {/* Address card */}
      {playit.address && (
        <div className="card" style={{ marginBottom: 14, background: "#0d2a17", borderColor: "var(--accent-dim)" }}>
          <div className="label" style={{ color: "var(--accent)" }}>{t("tunnel.serverAddress")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <code style={{
              flex: 1, fontFamily: "monospace", fontSize: 16,
              color: "var(--accent)", fontWeight: 600,
            }}>
              {playit.address}
            </code>
            <button className="btn btn-sm" onClick={copyAddress}>
              {copied ? `✓ ${t("common.copied")}` : `📋 ${t("common.copy")}`}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            {t("tunnel.shareHint")}
          </div>
        </div>
      )}

      {/* Log area */}
      <div className="label" style={{ marginBottom: 6 }}>{t("tunnel.agentLog")}</div>
      <div
        style={{
          flex: 1, overflowY: "auto",
          background: "#0a0a0a", border: "1px solid var(--border)",
          borderRadius: 8, padding: "12px 14px",
          fontFamily: "monospace", fontSize: 11, lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>
            {t("tunnel.logPlaceholder")}
          </div>
        ) : (
          lines.map((line, i) => {
            let color = "var(--text)";
            if (line.includes("ERROR")) color = "var(--red)";
            else if (line.includes("WARN")) color = "var(--yellow)";
            else if (line.includes("INFO")) color = "var(--text-muted)";
            return <div key={i} style={{ color }}>{line}</div>;
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function DiagnosticRow({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const color = ok ? "var(--green)" : warn ? "var(--yellow)" : "var(--text-muted)";
  const symbol = ok ? "✓" : warn ? "!" : "•";
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      minHeight: 32,
      padding: "7px 9px",
      background: "var(--surface2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      fontSize: 12,
      color: "var(--text-muted)",
    }}>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: 999,
        color,
        border: `1px solid ${color}`,
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 800,
      }}>
        {symbol}
      </span>
      <span>{label}</span>
    </div>
  );
}

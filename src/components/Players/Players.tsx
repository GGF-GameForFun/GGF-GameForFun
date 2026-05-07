import { useEffect, useState } from "react";
import { invoke, listen } from "../../tauri";
import { ServerStatus } from "../../types";
import { useT } from "../../i18n";

// Parse player join/leave from MC log lines.
// Vanilla / Paper / Forge / Fabric all emit:
//   "[Server thread/INFO]: PlayerName joined the game"
//   "[Server thread/INFO]: PlayerName left the game"
//   "[Server thread/INFO]: PlayerName lost connection: ..."
const JOIN_RE  = /:\s*([A-Za-z0-9_]{2,16})\s+joined the game/;
const LEAVE_RE = /:\s*([A-Za-z0-9_]{2,16})\s+(?:left the game|lost connection)/;

interface Confirm {
  message: string;
  onYes: () => void;
}

export default function Players() {
  const { t } = useT();
  const [players, setPlayers] = useState<string[]>([]);
  const [ops, setOps] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  useEffect(() => {
    invoke<ServerStatus>("get_server_status").then(setStatus).catch(() => {});
    const u1 = listen<ServerStatus>("server-status", (e) => {
      setStatus(e.payload);
      // Reset roster when server stops
      if (e.payload === "stopped") {
        setPlayers([]);
        setOps(new Set());
      }
    });
    const u2 = listen<string>("mc-line", (e) => {
      const line = e.payload;
      const join = line.match(JOIN_RE);
      const leave = line.match(LEAVE_RE);
      if (join) {
        const name = join[1];
        setPlayers((p) => p.includes(name) ? p : [...p, name]);
      } else if (leave) {
        const name = leave[1];
        setPlayers((p) => p.filter((x) => x !== name));
        setOps((o) => { const n = new Set(o); n.delete(name); return n; });
      }
    });
    return () => { u1.then((f) => f()); u2.then((f) => f()); };
  }, []);

  async function send(cmd: string) {
    try { await invoke("send_command", { cmd }); } catch {}
  }

  function handleOp(name: string) {
    const isOp = ops.has(name);
    setConfirm({
      message: t(isOp ? "players.confirmDeop" : "players.confirmOp", { name }),
      onYes: async () => {
        await send(isOp ? `deop ${name}` : `op ${name}`);
        setOps((o) => {
          const n = new Set(o);
          if (isOp) n.delete(name); else n.add(name);
          return n;
        });
        setConfirm(null);
      },
    });
  }

  function handleKick(name: string) {
    setConfirm({
      message: t("players.confirmKick", { name }),
      onYes: async () => {
        await send(`kick ${name}`);
        setConfirm(null);
      },
    });
  }

  const offline = status === "stopped";

  return (
    <div className="page-transition" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("players.title")}</h2>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("players.online")}: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{players.length}</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {offline ? (
          <Empty>{t("players.serverOffline")}</Empty>
        ) : players.length === 0 ? (
          <Empty>{t("players.empty")}</Empty>
        ) : (
          <div>
            {players.map((name, i) => {
              const isOp = ops.has(name);
              return (
                <div
                  key={name}
                  className="fade-in-up"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <Avatar name={name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {name}
                      {isOp && (
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 600,
                          color: "var(--accent)", background: "rgba(74,222,128,0.15)",
                          padding: "2px 7px", borderRadius: 999, letterSpacing: 0.4,
                        }}>OP</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    style={isOp ? { color: "var(--accent)", borderColor: "rgba(74,222,128,0.4)" } : {}}
                    onClick={() => handleOp(name)}
                  >
                    {isOp ? `✓ ${t("players.op")}` : t("players.op")}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleKick(name)}>
                    {t("players.kick")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div
            className="modal"
            style={{ padding: 24, maxWidth: 380, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, marginBottom: 18, lineHeight: 1.6, textAlign: "center" }}>
              {confirm.message}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={confirm.onYes}>
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "40px 20px", textAlign: "center",
      color: "var(--text-muted)", fontSize: 13,
    }}>
      {children}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  // Tiny deterministic colored circle based on name hash
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [142, 200, 280, 25, 340, 180, 50];
  const hue = hues[hash % hues.length];
  return (
    <div
      style={{
        width: 32, height: 32, borderRadius: 999,
        background: `linear-gradient(135deg, hsl(${hue}, 65%, 45%), hsl(${hue}, 65%, 30%))`,
        color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: 13, flexShrink: 0,
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

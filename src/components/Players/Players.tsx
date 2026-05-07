import { useEffect, useState } from "react";
import { invoke, listen } from "../../tauri";
import { ServerStatus } from "../../types";
import { useT } from "../../i18n";

interface Confirm {
  message: string;
  onYes: () => void;
}

type RecentPlayer = [string, string]; // [name, ISO timestamp]

export default function Players() {
  const { t } = useT();
  const [players, setPlayers] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentPlayer[]>([]);
  const [ops, setOps] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [teleportFrom, setTeleportFrom] = useState<string | null>(null);

  useEffect(() => {
    invoke<ServerStatus>("get_server_status").then(setStatus).catch(() => {});
    // Hydrate from backend on mount so we don't miss players who joined before this tab opened
    invoke<string[]>("get_online_players").then((list) => setPlayers(list.sort())).catch(() => {});
    invoke<RecentPlayer[]>("get_recent_players").then(setRecent).catch(() => {});

    const u1 = listen<ServerStatus>("server-status", (e) => {
      setStatus(e.payload);
      if (e.payload === "stopped") {
        setPlayers([]);
        setOps(new Set());
      }
    });
    const u2 = listen<string[]>("players-update", (e) => {
      setPlayers([...e.payload].sort());
      // Drop ops for players who left
      setOps((o) => {
        const n = new Set<string>();
        for (const name of o) if (e.payload.includes(name)) n.add(name);
        return n;
      });
    });
    const u3 = listen<RecentPlayer[]>("recent-players-update", (e) => setRecent(e.payload));
    return () => { u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); };
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

  function handleBan(name: string) {
    setConfirm({
      message: t("players.confirmBan", { name }),
      onYes: async () => {
        await send(`ban ${name}`);
        setConfirm(null);
      },
    });
  }

  function handleTeleport(name: string) {
    setTeleportFrom(name);
  }

  function fmtSince(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t("players.justNow");
    if (mins < 60) return t("players.minsAgo", { n: String(mins) });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("players.hoursAgo", { n: String(hrs) });
    const days = Math.floor(hrs / 24);
    return t("players.daysAgo", { n: String(days) });
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
                  <button
                    className="btn btn-sm"
                    onClick={() => handleTeleport(name)}
                    disabled={players.length < 2}
                    title={players.length < 2 ? t("players.teleportNeedTwo") : ""}
                  >
                    {t("players.teleport")}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleKick(name)}>
                    {t("players.kick")}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleBan(name)}
                    style={{ background: "rgba(248,113,113,0.08)" }}
                  >
                    🚫 {t("players.ban")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently Joined */}
      {recent.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="label" style={{ marginBottom: 10 }}>
            🕒 {t("players.recentlyJoined")}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {recent.map(([name, iso], i) => {
              const isOnline = players.includes(name);
              return (
                <div
                  key={`${name}-${iso}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    opacity: isOnline ? 1 : 0.6,
                  }}
                >
                  <Avatar name={name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {name}
                      {isOnline && (
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 600,
                          color: "var(--accent)", background: "rgba(74,222,128,0.15)",
                          padding: "1px 6px", borderRadius: 999,
                        }}>● {t("common.online")}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {fmtSince(iso)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Teleport destination picker */}
      {teleportFrom && (
        <div className="modal-backdrop" onClick={() => setTeleportFrom(null)}>
          <div
            className="modal"
            style={{ padding: 24, maxWidth: 380, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>
              {t("players.teleportTo", { name: teleportFrom })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {players
                .filter((p) => p !== teleportFrom)
                .map((dest) => (
                  <button
                    key={dest}
                    className="btn"
                    style={{ justifyContent: "flex-start", gap: 10 }}
                    onClick={async () => {
                      await send(`tp ${teleportFrom} ${dest}`);
                      setTeleportFrom(null);
                    }}
                  >
                    <Avatar name={dest} />
                    <span>{dest}</span>
                  </button>
                ))}
            </div>
            <button className="btn btn-sm" onClick={() => setTeleportFrom(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

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
  // Use Minecraft head from mc-heads.net (works with username only — no Mojang lookup needed,
  // falls back to Steve for unknown players). Deterministic colored circle as fallback if image fails.
  const [failed, setFailed] = useState(false);
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [142, 200, 280, 25, 340, 180, 50];
  const hue = hues[hash % hues.length];
  if (failed) {
    return (
      <div
        style={{
          width: 32, height: 32, borderRadius: 6,
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
  return (
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/32`}
      alt={name}
      width={32}
      height={32}
      onError={() => setFailed(true)}
      style={{
        width: 32, height: 32, borderRadius: 6,
        flexShrink: 0,
        imageRendering: "pixelated",
        background: "var(--surface2)",
      }}
    />
  );
}

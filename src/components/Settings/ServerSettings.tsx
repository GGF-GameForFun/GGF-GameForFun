import { useEffect, useState } from "react";
import { invoke, listen, saveFileDialog } from "../../tauri";
import {
  ServerConfig,
  ServerStatus,
  ServerType,
  McVersion,
  LoaderVersion,
  InstallProgress,
  SERVER_TYPES,
} from "../../types";
import { useT } from "../../i18n";

interface Props {
  config: ServerConfig;
  onSave: (cfg: ServerConfig) => void;
}

export default function ServerSettings({ config, onSave }: Props) {
  const { t } = useT();
  const [form, setForm] = useState(config);
  const [props, setProps] = useState<Record<string, string>>({});
  const [loadingProps, setLoadingProps] = useState(true);
  const [saved, setSaved] = useState(false);
  const [propsSaved, setPropsSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<Record<string, string>>("get_server_properties")
      .then((p) => { setProps(p); setLoadingProps(false); })
      .catch(() => setLoadingProps(false));
  }, []);

  async function saveConfig() {
    setError("");
    try {
      await invoke("save_config", { cfg: form });
      onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
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

  const KEY_PROPS = ["max-players", "motd", "server-port", "difficulty", "gamemode", "pvp", "view-distance", "online-mode"];

  return (
    <div className="page-transition" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{t("settings.title")}</h2>

      {error && (
        <div
          style={{
            color: "var(--red)",
            background: "#2a1515",
            border: "1px solid var(--red)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

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

        <button className="btn btn-primary btn-sm" onClick={saveConfig}>
          {saved ? `✓ ${t("common.saved")}` : t("common.save")}
        </button>
      </div>

      {/* Version / Mod Loader change */}
      <VersionChangeCard config={config} onSave={onSave} />

      {/* Server properties */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 14 }}>{t("settings.serverProperties")}</div>

        {loadingProps ? (
          <div style={{ color: "var(--text-muted)" }}>{t("common.loading")}</div>
        ) : (
          <>
            {KEY_PROPS.filter((k) => k in props).map((key) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div
                  style={{
                    width: 160,
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: key === "online-mode" ? "var(--text-muted)" : "var(--text)",
                    flexShrink: 0,
                  }}
                >
                  {key}
                </div>
                <input
                  value={props[key] ?? ""}
                  onChange={(e) =>
                    setProps((p) => ({ ...p, [key]: e.target.value }))
                  }
                  style={{ flex: 1 }}
                  disabled={key === "online-mode"}
                />
              </div>
            ))}

            {/* Remaining props */}
            {Object.keys(props)
              .filter((k) => !KEY_PROPS.includes(k))
              .sort()
              .map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 160, fontFamily: "monospace", fontSize: 12, flexShrink: 0 }}>
                    {key}
                  </div>
                  <input
                    value={props[key] ?? ""}
                    onChange={(e) =>
                      setProps((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{ flex: 1 }}
                  />
                </div>
              ))}

            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={saveProps}>
              {propsSaved ? `✓ ${t("common.saved")}` : t("common.save")}
            </button>
            <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>
              {t("settings.restartHint")}
            </div>
          </>
        )}
      </div>

      <ToolsSection />
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
      setFetchError(`Failed to fetch versions: ${String(e)}`);
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
      setFetchError(`Failed to fetch loader versions: ${String(e)}`);
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
      <div style={{ fontWeight: 600, marginBottom: 14 }}>🎮 Server Type & Version</div>

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
            🔄 Change version / mod loader…
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
            Changing the version or loader will re-download and reinstall the server jar. Your <code>world/</code> folder is not deleted.
          </div>
        </>
      ) : (
        <>
          <div className="label">Server Type</div>
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

          <div className="label">Minecraft Version</div>
          {loadingVersions ? (
            <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>Fetching versions…</div>
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
              <div className="label">{serverType === "paper" ? "Paper Build" : `${meta.name} Version`}</div>
              {loadingLoaders ? (
                <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>Fetching loaders…</div>
              ) : loaderVersions.length === 0 ? (
                <div style={{
                  color: "var(--yellow)", background: "#2a2200",
                  border: "1px solid var(--yellow)", borderRadius: 6,
                  padding: "8px 12px", fontSize: 12, marginBottom: 14,
                }}>
                  No {meta.name} version found for Minecraft {mcVersion}.
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
                {progress.message || "Reinstalling…"}
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
              {t("common.cancel") || "Cancel"}
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
              {installing ? "Reinstalling…" : "Reinstall server"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools & Maintenance — backup + debug export
// ─────────────────────────────────────────────────────────────────────────────

interface BackupProgress { files: number; bytes: number; current: string }

function ToolsSection() {
  const { t } = useT();
  const [busy, setBusy] = useState<"backup" | "debug" | null>(null);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [resultMsg, setResultMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");

  useEffect(() => {
    invoke<ServerStatus>("get_server_status").then(setServerStatus).catch(() => {});
    const u1 = listen<ServerStatus>("server-status", (e) => setServerStatus(e.payload));
    const u2 = listen<BackupProgress>("backup-progress", (e) => setProgress(e.payload));
    return () => { u1.then((f) => f()); u2.then((f) => f()); };
  }, []);

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
          color: resultMsg.type === "ok" ? "var(--accent)" : "var(--red)",
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

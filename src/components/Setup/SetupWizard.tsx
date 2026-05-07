import { useEffect, useState } from "react";
import { invoke, listen } from "../../tauri";
import {
  McVersion,
  LoaderVersion,
  ServerConfig,
  ServerType,
  InstallProgress,
  SERVER_TYPES,
} from "../../types";
import { useT } from "../../i18n";

interface Props {
  onComplete: (cfg: ServerConfig) => void;
}

type Step = "welcome" | "type" | "version" | "loader" | "serverconfig" | "installing" | "playit";

const DEFAULT_RAM = 2048;

export default function SetupWizard({ onComplete }: Props) {
  const { t } = useT();
  const [step, setStep] = useState<Step>("welcome");
  const [versions, setVersions] = useState<McVersion[]>([]);
  const [paperVersions, setPaperVersions] = useState<string[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingLoaders, setLoadingLoaders] = useState(false);
  const [javaPath, setJavaPath] = useState("");
  const [javaError, setJavaError] = useState("");

  const [form, setForm] = useState<Partial<ServerConfig>>({
    minecraft_version: "",
    server_type: "vanilla",
    loader_version: null,
    ram_mb: DEFAULT_RAM,
    max_players: 10,
    server_name: "My Minecraft Server",
    server_path: "",
  });

  const [progress, setProgress] = useState<InstallProgress>({ message: "", progress: 0 });
  const [installError, setInstallError] = useState("");
  const [playitError, setPlayitError] = useState("");

  useEffect(() => {
    invoke<string>("default_server_path").then((p) => setForm((f) => ({ ...f, server_path: p })));
    invoke<string>("check_java").then(setJavaPath).catch((e) => setJavaError(String(e)));
  }, []);

  const set = <K extends keyof ServerConfig>(k: K, v: ServerConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const meta = SERVER_TYPES.find((t) => t.id === form.server_type)!;

  async function pickType(t: ServerType) {
    set("server_type", t);
    set("loader_version", null);
    setLoadingVersions(true);
    try {
      if (t === "paper") {
        const v = await invoke<string[]>("fetch_paper_versions");
        setPaperVersions(v);
        if (v.length > 0) set("minecraft_version", v[0]);
      } else {
        const v = await invoke<McVersion[]>("fetch_mc_versions");
        setVersions(v);
        if (v.length > 0) set("minecraft_version", v[0].id);
      }
    } finally {
      setLoadingVersions(false);
    }
    setStep("version");
  }

  async function loadLoaderVersions(serverType: ServerType, mcVersion: string) {
    setLoadingLoaders(true);
    setLoaderVersions([]);
    try {
      let cmd: string;
      switch (serverType) {
        case "paper":    cmd = "fetch_paper_builds"; break;
        case "forge":    cmd = "fetch_forge_versions"; break;
        case "fabric":   cmd = "fetch_fabric_versions"; break;
        case "neoforge": cmd = "fetch_neoforge_versions"; break;
        default: return;
      }
      const v = await invoke<LoaderVersion[]>(cmd, { mcVersion });
      setLoaderVersions(v);
      if (v.length > 0) set("loader_version", v[0].version);
    } finally {
      setLoadingLoaders(false);
    }
  }

  async function runInstall() {
    setStep("installing");
    setInstallError("");
    const unlisten = await listen<InstallProgress>("install-progress", (e) => setProgress(e.payload));
    try {
      const cfg = await invoke<ServerConfig>("install_server", {
        cfg: { ...form, java_path: javaPath, setup_complete: false },
      });
      unlisten();
      setStep("playit");
      runPlayit(cfg);
    } catch (e) {
      unlisten();
      setInstallError(String(e));
    }
  }

  async function runPlayit(cfg: ServerConfig) {
    setPlayitError("");
    const unlisten = await listen<InstallProgress>("install-progress", (e) => setProgress(e.payload));
    try {
      await invoke("setup_playit");
      unlisten();
      onComplete(cfg);
    } catch (e) {
      unlisten();
      setPlayitError(String(e));
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", padding: 24 }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 40, width: "100%", maxWidth: 560,
      }}>
        {/* Welcome */}
        {step === "welcome" && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⛏</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t("setup.welcomeTitle")}</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
              {t("setup.welcomeDesc")}
            </p>
            {javaError ? (
              <Alert color="red">⚠ {javaError}</Alert>
            ) : javaPath ? (
              <Alert color="green">{t("setup.javaDetected", { path: javaPath })}</Alert>
            ) : null}
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: 12, marginTop: 16 }}
              onClick={() => setStep("type")}
            >
              {t("setup.getStarted")}
            </button>
          </div>
        )}

        {/* Server type */}
        {step === "type" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t("setup.chooseType")}</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              {t("setup.chooseTypeDesc")}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              {SERVER_TYPES.map((stype) => {
                const selected = form.server_type === stype.id;
                return (
                  <button
                    key={stype.id}
                    onClick={() => pickType(stype.id)}
                    style={{
                      padding: 14, textAlign: "left", borderRadius: 8,
                      background: selected ? "var(--surface3)" : "var(--surface2)",
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      color: "var(--text)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{stype.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{stype.name}</span>
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>
                      {stype.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <button className="btn" onClick={() => setStep("welcome")}>← {t("common.back")}</button>
          </div>
        )}

        {/* Version picker */}
        {step === "version" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {t("setup.chooseVersion", { name: meta.name })}
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              {t("setup.chooseVersionDesc", { name: meta.name })}
            </p>

            <div className="label">{t("setup.minecraftVersion")}</div>
            {loadingVersions ? (
              <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>{t("setup.fetchingVersions")}</div>
            ) : (
              <select
                value={form.minecraft_version}
                onChange={(e) => set("minecraft_version", e.target.value)}
                style={{ width: "100%", marginBottom: 20 }}
              >
                {form.server_type === "paper"
                  ? paperVersions.map((v) => <option key={v} value={v}>{v}</option>)
                  : versions.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)
                }
              </select>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep("type")}>← {t("common.back")}</button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                disabled={!form.minecraft_version}
                onClick={async () => {
                  if (meta.needsLoader) {
                    await loadLoaderVersions(form.server_type!, form.minecraft_version!);
                    setStep("loader");
                  } else {
                    setStep("serverconfig");
                  }
                }}
              >
                {t("common.next")} →
              </button>
            </div>
          </div>
        )}

        {/* Loader version */}
        {step === "loader" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {form.server_type === "paper"
                ? t("setup.loaderHeaderBuild", { name: meta.name })
                : t("setup.loaderHeaderVersion", { name: meta.name })}
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              {form.server_type === "paper"
                ? t("setup.loaderDescBuild", { name: meta.name, mc: form.minecraft_version! })
                : t("setup.loaderDescVersion", { name: meta.name, mc: form.minecraft_version! })}
            </p>

            <div className="label">
              {form.server_type === "paper"
                ? t("setup.loaderLabelBuild", { name: meta.name })
                : t("setup.loaderLabelVersion", { name: meta.name })}
            </div>
            {loadingLoaders ? (
              <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>{t("setup.fetching")}</div>
            ) : loaderVersions.length === 0 ? (
              <Alert color="yellow">
                {t("setup.notFoundFor", { name: meta.name, mc: form.minecraft_version! })}
              </Alert>
            ) : (
              <select
                value={form.loader_version ?? ""}
                onChange={(e) => set("loader_version", e.target.value)}
                style={{ width: "100%", marginBottom: 20 }}
              >
                {loaderVersions.map((v) => (
                  <option key={v.version} value={v.version}>{v.label}</option>
                ))}
              </select>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep("version")}>← Back</button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                disabled={loaderVersions.length === 0}
                onClick={() => setStep("serverconfig")}
              >
                {t("common.next")} →
              </button>
            </div>
          </div>
        )}

        {/* Server config */}
        {step === "serverconfig" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t("setup.serverConfig")}</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>{t("setup.serverConfigDesc")}</p>

            <div className="label">{t("setup.serverNameMOTD")}</div>
            <input
              value={form.server_name}
              onChange={(e) => set("server_name", e.target.value)}
              style={{ width: "100%", marginBottom: 16 }}
            />

            <div className="label">{t("setup.installPath")}</div>
            <input
              value={form.server_path}
              onChange={(e) => set("server_path", e.target.value)}
              style={{ width: "100%", marginBottom: 16, fontFamily: "monospace", fontSize: 12 }}
            />

            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="label">{t("settings.ram")}</div>
                <input type="number"
                  value={form.ram_mb}
                  onChange={(e) => set("ram_mb", Number(e.target.value))}
                  style={{ width: "100%" }}
                  min={512} max={16384} step={512}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">{t("settings.maxPlayers")}</div>
                <input type="number"
                  value={form.max_players}
                  onChange={(e) => set("max_players", Number(e.target.value))}
                  style={{ width: "100%" }}
                  min={1} max={100}
                />
              </div>
            </div>

            <Alert color="green">
              {t("setup.crackedNote")}
            </Alert>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn" onClick={() => setStep(meta.needsLoader ? "loader" : "version")}>
                ← {t("common.back")}
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                disabled={!form.server_path || !form.server_name}
                onClick={runInstall}
              >
                {t("setup.installButton")}
              </button>
            </div>
          </div>
        )}

        {/* Installing */}
        {step === "installing" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t("setup.installing")}</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              {progress.message || t("setup.preparing")}
            </p>
            <ProgressBar progress={progress.progress} color="var(--accent)" />
            {installError && (
              <div style={{ marginTop: 16 }}>
                <Alert color="red">{installError}</Alert>
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setStep("serverconfig")}>
                  ← {t("common.retry")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* playit setup */}
        {step === "playit" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t("setup.playitTitle")}</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              {t("setup.playitDesc")}
            </p>
            {!playitError && (
              <>
                <div style={{ color: "var(--text-muted)", marginBottom: 12 }}>
                  {progress.message || t("setup.playitDownloading")}
                </div>
                <ProgressBar progress={progress.progress} color="var(--blue)" />
              </>
            )}
            {playitError && (
              <Alert color="yellow">{t("setup.playitFailed", { err: playitError })}</Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Alert({ color, children }: { color: "red" | "green" | "yellow"; children: React.ReactNode }) {
  const styles = {
    red:    { bg: "#2a1515", border: "var(--red)",        text: "var(--red)"    },
    green:  { bg: "#0d2a17", border: "var(--accent-dim)", text: "var(--accent)" },
    yellow: { bg: "#2a2200", border: "var(--yellow)",     text: "var(--yellow)" },
  }[color];
  return (
    <div style={{
      background: styles.bg, border: `1px solid ${styles.border}`,
      borderRadius: 6, padding: "10px 14px", color: styles.text, fontSize: 13,
    }}>
      {children}
    </div>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 4, height: 8, overflow: "hidden" }}>
      <div style={{
        background: color, height: "100%",
        width: `${Math.round(progress * 100)}%`,
        transition: "width 0.3s ease", borderRadius: 4,
      }} />
    </div>
  );
}

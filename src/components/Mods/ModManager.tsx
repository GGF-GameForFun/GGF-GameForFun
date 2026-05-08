import { useEffect, useState } from "react";
import { invoke, openFileDialog } from "../../tauri";
import { useT } from "../../i18n";

export default function ModManager() {
  const { t } = useT();
  const [mods, setMods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    file: string;
    failed: string[];
  } | null>(null);

  async function loadMods() {
    setLoading(true);
    setError("");
    try {
      const list = await invoke<string[]>("list_mods");
      setMods(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMods(); }, []);

  async function addMod() {
    try {
      const selected = await openFileDialog([{ name: "Forge Mod", extensions: ["jar"] }], true);
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      await importMods(paths);
    } catch (e) {
      setError(String(e));
    }
  }

  async function importMods(paths: string[]) {
    const jarPaths = paths.filter((p) => p.toLowerCase().endsWith(".jar"));
    if (jarPaths.length === 0) return;

    setError("");
    setSuccessMsg("");
    const failed: string[] = [];
    setImportProgress({ current: 0, total: jarPaths.length, file: "", failed });

    let done = 0;
    for (const filePath of jarPaths) {
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      setImportProgress({ current: done, total: jarPaths.length, file: fileName, failed: [...failed] });
      try {
        await invoke("add_mod", { filePath });
      } catch (e) {
        failed.push(`${fileName}: ${e}`);
      }
      done++;
      setImportProgress({ current: done, total: jarPaths.length, file: fileName, failed: [...failed] });
    }

    setImportProgress(null);
    if (failed.length > 0) setError(failed.join("\n"));
    const succeeded = done - failed.length;
    if (succeeded > 0) {
      setSuccessMsg(t("mods.importSuccess", { count: String(succeeded) }));
      setTimeout(() => setSuccessMsg(""), 4000);
    }
    loadMods();
  }

  async function onDropFiles(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const paths = files
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    try {
      await importMods(paths);
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeMod(name: string) {
    setRemoving(name);
    try {
      await invoke("remove_mod", { modName: name });
      setMods((m) => m.filter((n) => n !== name));
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving(null);
    }
  }

  async function deleteAllMods() {
    setConfirmDeleteAll(false);
    setDeletingAll(true);
    setError("");
    setSuccessMsg("");
    const total = mods.length;
    let removedCount = 0;
    const failed: string[] = [];
    for (const name of mods) {
      try {
        await invoke("remove_mod", { modName: name });
        removedCount++;
      } catch (e) {
        failed.push(`${name}: ${e}`);
      }
    }
    setDeletingAll(false);
    if (failed.length > 0) {
      setError(failed.join("\n"));
    }
    if (removedCount > 0) {
      setSuccessMsg(t("mods.deleteAllSuccess", { count: String(removedCount) }));
      setTimeout(() => setSuccessMsg(""), 4000);
    }
    void total; // keep linter quiet — counted via `mods` snapshot
    loadMods();
  }

  return (
    <div className="page-transition" style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("mods.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {mods.length > 0 && (
            <button
              className="btn btn-danger"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={deletingAll || !!importProgress}
            >
              🗑 {deletingAll ? t("mods.deleteAllRunning") : t("mods.deleteAll")}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={addMod}
            disabled={!!importProgress}
          >
            + {t("mods.add")}
          </button>
        </div>
      </div>

      {successMsg && (
        <div
          className="fade-in"
          style={{
            color: "var(--accent)",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.4)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {successMsg}
        </div>
      )}

      {confirmDeleteAll && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteAll(false)}>
          <div
            className="modal"
            style={{ padding: 24, maxWidth: 420, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗑</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              {t("mods.deleteAllConfirmTitle", { count: String(mods.length) })}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
              {t("mods.deleteAllConfirmBody")}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={() => setConfirmDeleteAll(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-danger btn-sm" onClick={deleteAllMods}>
                🗑 {t("mods.deleteAll")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          background: "rgba(139,92,246,0.10)",
          border: "1px solid rgba(139,92,246,0.35)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          color: "var(--accent)",
          marginBottom: 16,
          fontSize: 12,
        }}
      >
        {t("mods.warnRunning")}
      </div>

      {importProgress && (
        <div
          className="fade-in"
          style={{
            background: "var(--surface)",
            border: "1px solid rgba(74,222,128,0.4)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 12, marginBottom: 8, color: "var(--text)",
          }}>
            <span>
              📥 {t("mods.importing", {
                current: String(importProgress.current),
                total: String(importProgress.total),
              })}
            </span>
            <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {Math.round((importProgress.current / importProgress.total) * 100)}%
            </span>
          </div>
          <div style={{
            background: "var(--surface2)",
            borderRadius: 999,
            height: 6,
            overflow: "hidden",
            marginBottom: importProgress.file ? 8 : 0,
          }}>
            <div style={{
              background: "var(--accent)",
              height: "100%",
              width: `${(importProgress.current / importProgress.total) * 100}%`,
              transition: "width 0.2s ease",
            }} />
          </div>
          {importProgress.file && (
            <div style={{
              fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {importProgress.file}
            </div>
          )}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!importProgress) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { if (!importProgress) onDropFiles(e); else e.preventDefault(); }}
        style={{
          border: dragOver ? "1px solid var(--accent)" : "1px dashed var(--border)",
          background: dragOver ? "rgba(139,92,246,0.10)" : "var(--surface2)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 12,
          color: dragOver ? "var(--accent)" : "var(--text-muted)",
          opacity: importProgress ? 0.5 : 1,
          pointerEvents: importProgress ? "none" : "auto",
        }}
      >
        {t("mods.dropHint")}
      </div>

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

      {loading ? (
        <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>{t("mods.loadingList")}</div>
      ) : mods.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧩</div>
          <div>{t("mods.empty")}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mods.map((mod) => (
            <div
              key={mod}
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🧩</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    maxWidth: 360,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {mod}
                </span>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => removeMod(mod)}
                disabled={removing === mod}
              >
                {removing === mod ? "…" : t("mods.remove")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

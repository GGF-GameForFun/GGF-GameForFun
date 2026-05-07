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
    for (const filePath of jarPaths) {
      await invoke("add_mod", { filePath });
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

  return (
    <div className="page-transition" style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("mods.title")}</h2>
        <button className="btn btn-primary" onClick={addMod}>
          + {t("mods.add")}
        </button>
      </div>

      <div
        style={{
          background: "rgba(74,222,128,0.08)",
          border: "1px solid rgba(74,222,128,0.35)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          color: "var(--accent)",
          marginBottom: 16,
          fontSize: 12,
        }}
      >
        {t("mods.warnRunning")}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDropFiles}
        style={{
          border: dragOver ? "1px solid var(--accent)" : "1px dashed var(--border)",
          background: dragOver ? "rgba(74,222,128,0.08)" : "var(--surface2)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 12,
          color: dragOver ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        Drag and drop `.jar` files here to import
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

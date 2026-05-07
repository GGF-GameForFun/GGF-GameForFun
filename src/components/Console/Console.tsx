import { useEffect, useRef, useState } from "react";
import { invoke, listen } from "../../tauri";
import { useT } from "../../i18n";

export default function Console() {
  const { t } = useT();
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleLines = lines.length > 600 ? lines.slice(-600) : lines;
  const hiddenCount = Math.max(0, lines.length - visibleLines.length);

  useEffect(() => {
    // Hydrate from backend buffer so history survives tab switches and component remounts
    invoke<string[]>("get_console_buffer").then(setLines).catch(() => {});
    const unlisten = listen<string>("mc-line", (e) => {
      setLines((l) => [...l.slice(-2000), e.payload]);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [lines]);

  function colorize(line: string): { color: string } {
    if (line.includes("[ERR]") || line.toLowerCase().includes("error") || line.toLowerCase().includes("exception")) {
      return { color: "var(--red)" };
    }
    if (line.includes("WARN") || line.includes("warn")) {
      return { color: "var(--yellow)" };
    }
    if (line.includes("Done") || line.includes("started")) {
      return { color: "var(--accent)" };
    }
    if (line.startsWith("[mchost]")) {
      return { color: "var(--blue)" };
    }
    return { color: "var(--text)" };
  }

  async function sendCommand() {
    const cmd = input.trim();
    if (!cmd) return;
    setHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);
    setInput("");
    setLines((l) => [...l, `> ${cmd}`]);
    try {
      await invoke("send_command", { cmd });
    } catch (e) {
      setLines((l) => [...l, `[GameForFun] Error: ${e}`]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      sendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      setInput(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? "" : history[idx] ?? "");
    }
  }

  return (
    <div
      className="page-transition"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 24,
        paddingBottom: 0,
        maxWidth: 1100,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("console.title")}</h2>
        <button
          className="btn btn-sm"
          onClick={async () => {
            setLines([]);
            try { await invoke("clear_console_buffer"); } catch {}
          }}
          style={{ color: "var(--text-muted)" }}
        >
          {t("common.clear")}
        </button>
      </div>

      {/* Log area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#0a0a0a",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 14px",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.7,
          marginBottom: 12,
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>
            {t("console.placeholder")}
          </div>
        ) : (
          <>
            {hiddenCount > 0 && (
              <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                {t("console.bufferNotice", {
                  visible: String(visibleLines.length),
                  hidden: String(hiddenCount),
                })}
              </div>
            )}
            {visibleLines.map((line, i) => (
              <div key={`${hiddenCount}-${i}`} style={colorize(line)}>
                {line}
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command input */}
      <div
        style={{
          display: "flex",
          gap: 8,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "#0a0a0a",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0 12px",
            gap: 8,
          }}
        >
          <span style={{ color: "var(--accent)", fontFamily: "monospace", fontWeight: 700 }}>
            /
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("console.commandPrompt")}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              padding: "10px 0",
              fontFamily: "monospace",
              fontSize: 13,
              color: "var(--text)",
            }}
          />
        </div>
        <button className="btn btn-primary" onClick={sendCommand} disabled={!input.trim()}>
          {t("common.send")}
        </button>
      </div>
    </div>
  );
}

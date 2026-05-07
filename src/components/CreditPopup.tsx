import { useEffect, useState } from "react";

const STORAGE_KEY = "mchost.creditDismissed";

export default function CreditPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  function close() {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Credit"
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "28px 32px",
          minWidth: 320,
          maxWidth: 400,
          textAlign: "center",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <button
          onClick={close}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 8, right: 8,
            background: "transparent",
            color: "var(--text-muted)",
            width: 28, height: 28,
            borderRadius: 6,
            fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ✕
        </button>

        <div style={{ fontSize: 36, marginBottom: 12 }}>⛏</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
          Credit to
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--accent)",
            marginBottom: 4,
          }}
        >
          Aindrew
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
          aka Aingker
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}

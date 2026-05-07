import { useEffect } from "react";
import { useT } from "../i18n";
import donationQr from "../assets/donation-qr.png";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function InfoPopup({ open, onClose }: Props) {
  const { t } = useT();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label="About">
      <div
        className="modal"
        style={{
          padding: "32px 28px 24px",
          width: "100%",
          maxWidth: 460,
          textAlign: "center",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          style={{
            position: "absolute",
            top: 12, right: 12,
            background: "transparent",
            color: "var(--text-muted)",
            width: 30, height: 30,
            borderRadius: 999,
            fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ✕
        </button>

        <div style={{ fontSize: 36, marginBottom: 12 }}>🎮</div>

        <div
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
            textAlign: "center",
            marginBottom: 22,
          }}
        >
          {t("info.body")}
        </div>

        {/* Donation card — VPBank QR */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-sm)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            marginBottom: 14,
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          }}
        >
          <img
            src={donationQr}
            alt="VPBank donation QR — TRAN DINH TIEN ANH"
            style={{
              width: "100%",
              maxWidth: 360,
              height: "auto",
              display: "block",
              borderRadius: 4,
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
          ❤️ {t("info.donateLabel")}
        </div>

        {/* Discord community link */}
        <a
          href="https://discord.gg/bF62psq97S"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            fontFamily: "monospace",
            padding: "6px 12px",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.25)",
            borderRadius: 999,
            marginBottom: 16,
            transition: "background 0.15s var(--easing)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(74,222,128,0.18)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(74,222,128,0.08)")}
        >
          💬 discord.gg/bF62psq97S
        </a>

        <button
          className="btn btn-primary"
          onClick={onClose}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

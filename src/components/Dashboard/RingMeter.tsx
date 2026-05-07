import { useT } from "../../i18n";

export type Tier = "good" | "normal" | "critical" | "na";

export interface RingMeterProps {
  /** Outer label, e.g. "RAM" / "CPU" / "TPS" */
  label: string;
  /** Icon shown above the label */
  icon: string;
  /** Fill percent (0–100). Pass null when value is unknown / unsupported. */
  percent: number | null;
  /** What goes in the centre of the ring (e.g. "42%", "19.6", "412 GB") */
  centerText: string;
  /** Sub-label shown under the ring, e.g. "1340 / 2048 MB" */
  subText?: string;
  /**
   * For "higher is better" metrics (TPS), pass true so 100 is good and 0 is critical.
   * For "lower is better" metrics (RAM/CPU/Disk), leave false.
   */
  invert?: boolean;
  /** Diameter of the ring in pixels */
  size?: number;
}

const TIER_COLORS: Record<Tier, string> = {
  good:     "var(--green)",
  normal:   "var(--yellow)",
  critical: "var(--red)",
  na:       "var(--text-muted)",
};

export function tierFor(percent: number | null, invert = false): Tier {
  if (percent === null || Number.isNaN(percent)) return "na";
  // For "lower is better": <65 good, <85 normal, ≥85 critical
  // For "higher is better" (invert): >85 good, >50 normal, ≤50 critical
  if (invert) {
    if (percent >= 85) return "good";
    if (percent >= 50) return "normal";
    return "critical";
  }
  if (percent < 65) return "good";
  if (percent < 85) return "normal";
  return "critical";
}

export default function RingMeter({
  label, icon, percent, centerText, subText, invert = false, size = 140,
}: RingMeterProps) {
  const { t } = useT();
  const tier = tierFor(percent, invert);
  const color = TIER_COLORS[tier];
  const tierLabel = tier === "na" ? t("tier.na")
    : tier === "good" ? t("tier.good")
    : tier === "normal" ? t("tier.normal")
    : t("tier.critical");

  // SVG geometry
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const safePct = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const dash = (safePct / 100) * C;

  return (
    <div
      className="card card-hover ring-card"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "20px 16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        {label}
      </div>

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
      >
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--surface3)"
          strokeWidth={stroke}
        />
        {/* Fill */}
        {percent !== null && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: "stroke-dasharray 0.7s var(--easing), stroke 0.4s var(--easing), filter 0.4s var(--easing)",
              filter: tier === "na" ? "none" : `drop-shadow(0 0 6px ${color})`,
            }}
          />
        )}
        {/* Centre text */}
        <text
          x={cx} y={cy - 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.18}
          fontWeight={700}
          fill={color}
          style={{
            fontFamily: "-apple-system, system-ui, sans-serif",
            fontVariantNumeric: "tabular-nums",
            transition: "fill 0.4s var(--easing)",
          }}
        >
          {percent === null ? "—" : centerText}
        </text>
      </svg>

      {subText && (
        <div style={{
          fontSize: 10, color: "var(--text-muted)",
          fontFamily: "monospace", letterSpacing: 0.3,
        }}>
          {subText}
        </div>
      )}

      <span
        className={`tier-pill tier-${tier}`}
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          padding: "3px 10px",
          borderRadius: 999,
          color,
          background: `color-mix(in oklab, ${color} 14%, transparent)`,
          border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
        }}
      >
        {tierLabel}
      </span>
    </div>
  );
}

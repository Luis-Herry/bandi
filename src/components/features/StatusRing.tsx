interface StatusRingProps {
  segments: { label: string; value: number; color: string }[];
  total: number;
  size?: number;
}

/**
 * Donut chart, pure SVG. 5 segments. Center shows `total` + a sublabel.
 * Used in the library sidebar's 状态统计 panel.
 */
export function StatusRing({ segments, total, size = 160 }: StatusRingProps) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = `${frac * C} ${C}`;
    const arc = { ...s, dash, offset, frac };
    offset += frac * C;
    return arc;
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={stroke}
        />
        {arcs.map((a, i) =>
          a.frac > 0 ? (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={a.dash}
              strokeDashoffset={-a.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 600ms var(--ease-default)" }}
            />
          ) : null,
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          data-tabular
          className="text-[36px] font-bold tracking-tight text-[color:var(--text-primary)] leading-none"
        >
          {total}
        </span>
        <span className="mt-1 text-[11px] text-[color:var(--text-muted)]">
          总追番
        </span>
      </div>
    </div>
  );
}

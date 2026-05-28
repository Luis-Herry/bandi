interface WatchHoursChartProps {
  data: number[]; // 7 numbers, in hours
  totalHours: number;
}

/**
 * Simple 7-day bar chart, pure SVG. Used in the library sidebar's
 * 本月观看时长 panel.
 */
export function WatchHoursChart({ data, totalHours }: WatchHoursChartProps) {
  const max = Math.max(...data, 1);
  const w = 220;
  const h = 70;
  const gap = 4;
  const barW = (w - gap * (data.length - 1)) / data.length;
  const days = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span
          data-tabular
          className="text-[28px] font-bold tracking-tight text-[color:var(--text-primary)] leading-none"
        >
          {totalHours.toFixed(1)}
        </span>
        <span className="text-[12px] text-[color:var(--text-muted)]">小时</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 14}`}>
        {data.map((v, i) => {
          const barH = (v / max) * h;
          const x = i * (barW + gap);
          const y = h - barH;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                fill="var(--accent)"
                opacity={v === 0 ? 0.15 : 0.85}
              />
              <text
                x={x + barW / 2}
                y={h + 12}
                fontSize={9}
                fill="var(--text-muted)"
                textAnchor="middle"
              >
                {days[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

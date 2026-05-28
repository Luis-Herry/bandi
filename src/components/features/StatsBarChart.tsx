interface StatsBarChartProps {
  data: {
    label: string;
    value: number;
  }[];
  height?: number;
}

export function StatsBarChart({ data, height = 150 }: StatsBarChartProps) {
  const safeData = data.map((item) => ({
    ...item,
    value: Math.max(0, item.value),
  }));
  const max = Math.max(...safeData.map((item) => item.value), 1);
  const width = 420;
  const gap = 8;
  const barWidth = (width - gap * (safeData.length - 1)) / safeData.length;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height + 24}`}
      role="img"
      aria-label="月度观看时长"
      className="block"
    >
      {safeData.map((item, index) => {
        const barHeight = (item.value / max) * height;
        const x = index * (barWidth + gap);
        const y = height - barHeight;
        return (
          <g key={item.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill="var(--accent)"
              opacity={item.value === 0 ? 0.14 : 0.82}
            />
            <text
              x={x + barWidth / 2}
              y={height + 17}
              fontSize={9}
              fill="var(--text-muted)"
              textAnchor="middle"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

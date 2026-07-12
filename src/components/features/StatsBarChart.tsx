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
  const hasWatchHistory = safeData.some((item) => item.value > 0);

  if (!hasWatchHistory) {
    return (
      <div
        role="status"
        aria-label="暂无月度观看记录"
        className="flex min-h-[174px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[color:var(--border-subtle)] px-6 text-center"
      >
        <p className="text-[13px] font-medium text-[color:var(--text-secondary)]">
          暂无观看记录
        </p>
        <p className="mt-1 max-w-[320px] text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          调整追番进度或完成播放后，这里会按月份统计观看时长。
        </p>
      </div>
    );
  }
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

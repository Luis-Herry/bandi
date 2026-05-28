/**
 * 番剧库（/browse）的 Suspense fallback。
 *
 * 骨架结构对齐 BrowseClient：
 *   - Hero（h-[240px]）
 *   - tabs 行（上一季 / 本季 / 下一季）+ 共 N 部
 *   - 筛选区面板（4 行 chip + 搜索）
 *   - 卡片网格 4 列 × 4 行
 */

function ChipRow({ chips }: { chips: number[] }) {
  return (
    <div className="flex items-start gap-3">
      <div style={{ width: 32 }} className="pt-1">
        <ShimmerInline className="h-3" />
      </div>
      <div className="flex-1 flex flex-wrap gap-2">
        {chips.map((w, i) => (
          <ShimmerInline key={i} className="h-7 rounded-[6px]" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}

function ShimmerInline({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-[color:var(--bg-elevated)] rounded-[8px] ${className ?? ""}`}
      style={style}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(110deg, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 70%)",
          backgroundSize: "200% 100%",
          animation: "skeleton-shimmer 1.4s linear infinite",
        }}
      />
    </div>
  );
}

function CardSkel() {
  return (
    <div className="rounded-[8px] overflow-hidden bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="relative" style={{ aspectRatio: "3/4" }}>
        <ShimmerInline className="absolute inset-0 rounded-none" />
        <div className="absolute bottom-2 left-2 right-2 space-y-1.5">
          <ShimmerInline className="h-3 w-3/4 bg-white/10" />
          <ShimmerInline className="h-2 w-1/2 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export default function BrowseLoading() {
  return (
    <div className="relative">
      <section className="relative h-[240px] w-full overflow-hidden bg-[color:var(--bg-elevated)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.75) 60%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-[1440px] h-full px-8 flex items-end pb-6">
          <div className="space-y-3 w-full max-w-md">
            <ShimmerInline className="h-9 w-1/3" />
            <ShimmerInline className="h-3 w-2/3" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-8 py-8">
        {/* tabs */}
        <div className="flex items-end justify-between gap-6 mb-6">
          <div className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] pb-2">
            <ShimmerInline className="h-5 w-20" />
            <ShimmerInline className="h-5 w-20" />
            <ShimmerInline className="h-5 w-20" />
          </div>
          <ShimmerInline className="h-3 w-40" />
        </div>

        {/* 筛选区 */}
        <div className="mb-6 rounded-[8px] p-4 bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)] space-y-3">
          <ChipRow chips={[40, 48, 48, 48, 64, 48]} />
          <ChipRow chips={[40, 56, 64, 64, 64]} />
          <ChipRow chips={[40, 48, 48, 48, 48, 56, 48, 48, 56, 48, 56, 56]} />
          <ChipRow chips={[40, 48, 56, 48, 48, 48]} />
          {/* 搜索 + 排序 */}
          <div className="flex items-center gap-3 pt-1">
            <div style={{ width: 32 }} className="pt-1">
              <ShimmerInline className="h-3" />
            </div>
            <ShimmerInline className="flex-1 h-9" />
            <ShimmerInline className="h-9 w-28" />
          </div>
        </div>

        {/* 卡片网格 4 × 4 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <CardSkel key={i} />
          ))}
        </div>
      </section>

      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * 番剧库（/browse）的 Suspense fallback。
 *
 * 骨架结构对齐 BrowseClient：
 *   - Hero（移动端 220px，桌面端 240px）
 *   - tabs 行（移动端堆叠，桌面端左右分布）
 *   - 筛选区面板（年份 + 4 行 chip + 搜索）
 *   - 卡片网格（移动端 1 列，520px 起 2 列，桌面最多 4 列）
 */

function ChipRow({ chips }: { chips: number[] }) {
  return (
    <div className="flex min-h-[28px] flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:gap-3">
      <div className="pt-1 min-[520px]:w-12">
        <ShimmerInline className="h-3 w-8" />
      </div>
      <div className="flex flex-1 flex-wrap gap-2">
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
      <div className="t-skel-skeleton is-pulsing">
        <div className="t-skel-block" />
      </div>
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
      <section className="relative min-h-[220px] w-full overflow-hidden bg-[color:var(--bg-elevated)] sm:h-[240px]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.75) 60%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div className="app-page-container relative flex min-h-[220px] items-end pb-6 sm:h-full">
          <div className="space-y-3 w-full max-w-md">
            <ShimmerInline className="h-8 w-32 sm:h-9 sm:w-1/3" />
            <ShimmerInline className="h-3 w-2/3" />
          </div>
        </div>
      </section>

      <section className="app-page-container py-6 sm:py-8">
        {/* tabs */}
        <div className="mb-6 border-b border-[color:var(--border-subtle)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <div className="no-scrollbar grid w-full grid-cols-4 items-center gap-1 overflow-visible pb-2 touch-pan-y sm:flex sm:max-w-full sm:min-w-0 sm:gap-3 sm:overflow-x-auto sm:touch-pan-x">
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
            </div>
            <ShimmerInline className="mb-2 h-3 w-40 lg:shrink-0" />
          </div>
        </div>

        {/* 筛选区 */}
        <div className="mb-6 rounded-[8px] p-4 bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)] space-y-3">
          <ChipRow chips={[56, 56, 56, 56, 56, 56]} />
          <ChipRow chips={[40, 48, 48, 48, 64, 48]} />
          <ChipRow chips={[40, 56, 64, 64, 64]} />
          <ChipRow chips={[40, 48, 48, 48, 48, 56, 48, 48, 56, 48, 56, 56]} />
          <ChipRow chips={[40, 48, 56, 48, 48, 48]} />
          {/* 搜索 + 排序 */}
          <div className="flex flex-col gap-3 border-t border-[color:var(--border-subtle)] pt-3 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:gap-3 md:flex-1">
              <div className="pt-1 min-[520px]:w-12">
                <ShimmerInline className="h-3 w-8" />
              </div>
              <ShimmerInline className="h-9 w-full min-w-0 md:max-w-[360px]" />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <ShimmerInline className="h-3 w-8" />
              <ShimmerInline className="h-9 w-20" />
              <ShimmerInline className="h-9 w-20" />
            </div>
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <CardSkel key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

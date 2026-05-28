/**
 * 首页（/）的 Suspense fallback。
 *
 * 同时也兜底 (main) 路由组下其他没有自己 loading.tsx 的子页面。
 * library / admin 这种纯本地查询页很快，闪一下骨架问题不大。
 *
 * 骨架结构对齐 src/app/(main)/page.tsx：
 *   - Hero 区（h-[240px]）
 *   - 今日更新 / 未来 7 天预告（4 张大卡）
 *   - 继续观看 + 漏看提醒（7+5 双栏）
 *   - 本季新番（按 weekday 多段）
 */

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-[color:var(--bg-elevated)] rounded-[8px] ${className ?? ""}`}
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

function SectionHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="space-y-2">
        <ShimmerBlock className="h-5 w-32" />
        <ShimmerBlock className="h-3 w-48" />
      </div>
      <ShimmerBlock className="h-3 w-20" />
    </div>
  );
}

function CardSkel() {
  return (
    <div className="rounded-[8px] overflow-hidden bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <ShimmerBlock className="rounded-none" />
      <div style={{ aspectRatio: "3/4" }} />
    </div>
  );
}

export default function HomeLoading() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative h-[240px] w-full overflow-hidden bg-[color:var(--bg-elevated)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.75) 60%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-[1440px] h-full px-4 flex items-end pb-6 sm:px-6 lg:px-8">
          <div className="space-y-3 w-full max-w-md">
            <ShimmerBlock className="h-9 w-2/3" />
            <ShimmerBlock className="h-3 w-1/2" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-8 space-y-8 sm:px-6 lg:px-8 lg:py-10 lg:space-y-10">
        {/* 今日更新 */}
        <div>
          <SectionHeader />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkel key={i} />
            ))}
          </div>
        </div>

        {/* 继续观看 + 漏看 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-1 space-y-3 lg:col-span-7">
            <SectionHeader />
            <div className="rounded-[8px] p-2 space-y-2 bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-2">
                  <ShimmerBlock className="h-12 w-[88px] shrink-0 sm:w-20" />
                  <div className="flex-1 space-y-2">
                    <ShimmerBlock className="h-3 w-1/2" />
                    <ShimmerBlock className="h-2 w-1/3" />
                  </div>
                  <ShimmerBlock className="h-8 w-16" />
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-1 space-y-3 lg:col-span-5">
            <SectionHeader />
            <div className="rounded-[8px] p-2 space-y-2 bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-2">
                  <ShimmerBlock className="h-12 w-[88px] shrink-0 sm:w-20" />
                  <div className="flex-1 space-y-2">
                    <ShimmerBlock className="h-3 w-1/2" />
                    <ShimmerBlock className="h-2 w-1/3" />
                  </div>
                  <ShimmerBlock className="h-8 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 本季新番（仿 weekday 分组） */}
        <div>
          <SectionHeader />
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, row) => (
              <div key={row}>
                <ShimmerBlock className="h-4 w-24 mb-3" />
                <div className="grid grid-flow-col gap-3 overflow-x-auto pb-1 [grid-auto-columns:max(156px,calc((100%-60px)/6))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <CardSkel key={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
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

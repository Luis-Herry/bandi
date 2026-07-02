import { redirect } from "next/navigation";
import { BarChart3, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { GlassPanel, NumberPop } from "@/components/ui";
import { AnimeCover } from "@/components/features/AnimeCover";
import { StatsBarChart } from "@/components/features/StatsBarChart";
import { getStatsReport } from "@/lib/db-helpers/stats";
import { formatStarRatingLabel } from "@/lib/rating";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const report = getStatsReport(user.id);

  return (
    <div className="app-page-container space-y-6 py-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="t-stagger is-shown min-w-0">
          <p className="t-stagger-line t-stagger-line--1 text-[12px] text-[color:var(--text-muted)]">
            {report.year} 年度报告
          </p>
          <h1 className="t-stagger-line t-stagger-line--2 mt-2 text-[34px] font-extrabold tracking-tight text-[color:var(--text-primary)]">
            统计
          </h1>
        </div>
        <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2 sm:border-0 sm:bg-transparent sm:p-0 sm:text-right">
          <p className="text-[12px] text-[color:var(--text-muted)]">
            活跃观看日
          </p>
          <p
            data-tabular
            className="mt-1 text-[24px] font-bold text-[color:var(--text-primary)]"
          >
            <NumberPop value={report.overview.activeDays} dirY={-1} />
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Clock size={16} />}
          label="年度观看时长"
          value={report.overview.totalHours.toFixed(1)}
          suffix="小时"
        />
        <MetricCard
          icon={<BarChart3 size={16} />}
          label="已看集数"
          value={String(report.overview.watchedEpisodes)}
          suffix="集"
        />
        <MetricCard
          icon={<CheckCircle2 size={16} />}
          label="今年看完"
          value={String(report.overview.completedAnime)}
          suffix="部"
        />
        <MetricCard
          icon={<CalendarDays size={16} />}
          label="活跃日均"
          value={String(report.overview.averageMinutesPerActiveDay)}
          suffix="分钟"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-8">
          <PanelHeader
            title="月度观看时长"
            subtitle={`${report.year} 年 · 12 个月`}
          />
          <div className="mt-6">
            <StatsBarChart
              data={report.monthlyHours.map((item) => ({
                label: item.label.replace("月", ""),
                value: item.hours,
              }))}
            />
          </div>
        </GlassPanel>

        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-4">
          <PanelHeader title="评分分布" subtitle="当前追番库评分" />
          <div className="mt-5 space-y-3">
            {report.ratingDistribution.map((item) => (
              <DistributionRow
                key={item.rating}
                label={formatStarRatingLabel(item.rating)}
                value={item.count}
                max={Math.max(
                  ...report.ratingDistribution.map((it) => it.count),
                  1,
                )}
              />
            ))}
          </div>
        </GlassPanel>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-5">
          <PanelHeader title="类型分布" subtitle="按观看事件聚合" />
          <div className="mt-5 space-y-3">
            {report.tagDistribution.length === 0 ? (
              <EmptyText>暂无观看类型数据</EmptyText>
            ) : (
              report.tagDistribution.map((item) => (
                <DistributionRow
                  key={item.tag}
                  label={item.tag}
                  value={item.hours}
                  suffix="h"
                  max={Math.max(
                    ...report.tagDistribution.map((it) => it.hours),
                    1,
                  )}
                />
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-7">
          <PanelHeader title="今年看完" subtitle="按完成时刻与观看时长排序" />
          <div className="mt-4 divide-y divide-[color:var(--border-subtle)]">
            {report.completedTop.length === 0 ? (
              <EmptyText>今年还没有通过事件流确认看完的番剧</EmptyText>
            ) : (
              report.completedTop.map((item, index) => (
                <div
                  key={item.animeId}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    data-tabular
                    className="w-7 text-[12px] text-[color:var(--text-muted)]"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="h-12 w-12 overflow-hidden rounded-[6px] shrink-0">
                    <AnimeCover
                      src={item.coverUrl}
                      alt={item.title}
                      ratio="1/1"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                      {formatDate(item.completedAt)} · {item.watchedEpisodes} 集
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      data-tabular
                      className="text-[13px] font-semibold text-[color:var(--text-primary)]"
                    >
                      {item.watchedHours.toFixed(1)}
                    </p>
                    <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                      小时
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassPanel>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <GlassPanel variant="elevated" className="p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[color:var(--accent)]">{icon}</span>
        <span className="text-[11px] text-[color:var(--text-muted)]">
          {label}
        </span>
      </div>
      <div className="mt-5 flex min-w-0 items-baseline gap-2">
        <span
          data-tabular
          className="truncate text-[28px] font-bold leading-none tracking-tight text-[color:var(--text-primary)] sm:text-[30px]"
        >
          <NumberPop value={value} dirY={-1} />
        </span>
        <span className="text-[12px] text-[color:var(--text-muted)]">
          {suffix}
        </span>
      </div>
    </GlassPanel>
  );
}

function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header>
      <h2 className="text-[15px] font-semibold text-[color:var(--text-primary)]">
        {title}
      </h2>
      <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
        {subtitle}
      </p>
    </header>
  );
}

function DistributionRow({
  label,
  value,
  max,
  suffix = "",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="truncate text-[color:var(--text-secondary)]">
          {label}
        </span>
        <span data-tabular className="text-[color:var(--text-primary)]">
          {suffix ? `${value.toFixed(1)}${suffix}` : value}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-surface-hover)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-[12px] text-[color:var(--text-muted)]">
      {children}
    </p>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

import { redirect } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Library,
  PlayCircle,
} from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { BackButton } from "@/components/features/BackButton";
import { GlassPanel, StatusBadge } from "@/components/ui";
import { getContinueWatching, getLibrary, getLibraryStats } from "@/lib/db-helpers/library";
import { getStatsReport } from "@/lib/db-helpers/stats";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  watching: "在看",
  planning: "想看",
  completed: "看完",
  onhold: "搁置",
  dropped: "弃番",
} as const;

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [libraryItems, libraryStats, report, continueWatching] = [
    getLibrary(user.id),
    getLibraryStats(user.id),
    getStatsReport(user.id, { topLimit: 3 }),
    getContinueWatching(user.id, 4),
  ];
  const ratedCount = libraryItems.filter((item) => item.userAnime.rating).length;
  const recentItems = libraryItems.slice(0, 5);

  return (
    <>
      <div className="fixed left-4 top-20 z-40 sm:left-6 lg:left-8">
        <BackButton />
      </div>

      <div className="app-page-container space-y-6 py-6 sm:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] text-[color:var(--text-muted)]">
            个人中心
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-tight text-[color:var(--text-primary)] sm:text-[34px]">
            {user.username} 的追番概览
          </h1>
        </div>
        <a
          href="/stats"
          className="inline-flex h-9 w-fit items-center gap-2 rounded-[6px] border border-[color:var(--border-default)] px-3 text-[12px] text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--bg-surface-hover)]"
        >
          <BarChart3 size={14} />
          查看完整统计
        </a>
      </header>

      <section className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Library size={16} />}
          label="追番总数"
          value={String(libraryStats.total)}
          suffix="部"
        />
        <MetricCard
          icon={<PlayCircle size={16} />}
          label="正在观看"
          value={String(libraryStats.watching)}
          suffix="部"
        />
        <MetricCard
          icon={<Clock3 size={16} />}
          label="年度观看"
          value={report.overview.totalHours.toFixed(1)}
          suffix="小时"
        />
        <MetricCard
          icon={<CheckCircle2 size={16} />}
          label="今年看完"
          value={String(report.overview.completedAnime)}
          suffix="部"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-4">
          <PanelHeader title="追番状态" subtitle="当前片单分布" />
          <div className="mt-5 space-y-3">
            {Object.entries(STATUS_LABEL).map(([status, label]) => (
              <StatusRow
                key={status}
                label={label}
                status={status as keyof typeof STATUS_LABEL}
                value={libraryStats[status as keyof typeof STATUS_LABEL]}
                max={Math.max(libraryStats.total, 1)}
              />
            ))}
          </div>
        </GlassPanel>

        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-4">
          <PanelHeader title="观看节奏" subtitle={`${report.year} 年事件流`} />
          <div className="mt-5 grid grid-cols-2 gap-3 min-[520px]:grid-cols-4 lg:grid-cols-2">
            <MiniStat label="已看集数" value={report.overview.watchedEpisodes} />
            <MiniStat label="活跃观看日" value={report.overview.activeDays} />
            <MiniStat
              label="日均分钟"
              value={report.overview.averageMinutesPerActiveDay}
            />
            <MiniStat label="已评分" value={ratedCount} />
          </div>
        </GlassPanel>

        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-4">
          <PanelHeader title="可继续播放" subtitle="有播放记录或已下载的在看条目" />
          <div className="mt-4 space-y-3">
            {continueWatching.length === 0 ? (
              <EmptyText>
                {libraryStats.watching > 0
                  ? `暂无可直接播放的内容；仍有 ${libraryStats.watching} 部正在观看，可前往追番列表找资源`
                  : "还没有正在观看的番剧"}
              </EmptyText>
            ) : (
              continueWatching.map((item) => (
                <CompactAnimeRow
                  key={item.anime.id}
                  href={`/anime/${item.anime.id}`}
                  coverUrl={item.anime.coverUrl}
                  title={item.anime.title}
                  meta={`${formatEpisode(item.continueEpisodeNumber)} · ${item.anime.type}`}
                />
              ))
            )}
          </div>
        </GlassPanel>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-7">
          <PanelHeader title="最近活动" subtitle="按片单更新时间排序" />
          <div className="mt-3 divide-y divide-[color:var(--border-subtle)]">
            {recentItems.length === 0 ? (
              <EmptyText>片单里还没有番剧</EmptyText>
            ) : (
              recentItems.map((item) => (
                <a
                  key={item.anime.id}
                  href={`/anime/${item.anime.id}`}
                  className="grid grid-cols-[48px_1fr] items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[48px_1fr_auto]"
                >
                  <div className="h-12 w-12 overflow-hidden rounded-[6px]">
                    <AnimeCover
                      src={item.anime.coverUrl}
                      alt={item.anime.title}
                      ratio="1/1"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                      {item.anime.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                      {formatDate(item.userAnime.updatedAt)} ·{" "}
                      {formatEpisode(item.userAnime.currentEpisode)}
                    </p>
                  </div>
                  <div className="col-start-2 sm:col-start-auto">
                    <StatusBadge status={item.userAnime.watchStatus} kind="watch" />
                  </div>
                </a>
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel variant="elevated" className="p-4 sm:p-5 lg:col-span-5">
          <PanelHeader title="年度摘要" subtitle="从统计页提炼" />
          <div className="mt-4 space-y-3">
            {report.completedTop.length === 0 ? (
              <EmptyText>今年还没有确认看完的番剧</EmptyText>
            ) : (
              report.completedTop.map((item, index) => (
                <CompactAnimeRow
                  key={item.animeId}
                  href={`/anime/${item.animeId}`}
                  coverUrl={item.coverUrl}
                  title={`${String(index + 1).padStart(2, "0")} · ${item.title}`}
                  meta={`${formatDate(item.completedAt)} · ${item.watchedHours.toFixed(1)} 小时`}
                />
              ))
            )}
          </div>
        </GlassPanel>
      </section>
      </div>
    </>
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
          {value}
        </span>
        <span className="text-[12px] text-[color:var(--text-muted)]">
          {suffix}
        </span>
      </div>
    </GlassPanel>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
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

function StatusRow({
  label,
  status,
  value,
  max,
}: {
  label: string;
  status: keyof typeof STATUS_LABEL;
  value: number;
  max: number;
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={status} kind="watch" />
        <span className="text-[12px] text-[color:var(--text-primary)]">
          {label} · {value}
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3">
      <p className="text-[11px] text-[color:var(--text-muted)]">{label}</p>
      <p
        data-tabular
        className="mt-2 text-[22px] font-bold text-[color:var(--text-primary)]"
      >
        {value}
      </p>
    </div>
  );
}

function CompactAnimeRow({
  href,
  coverUrl,
  title,
  meta,
}: {
  href: string;
  coverUrl: string | null;
  title: string;
  meta: string;
}) {
  return (
    <a
      href={href}
      className="grid grid-cols-[40px_1fr] items-center gap-3 rounded-[8px] p-2 transition-colors touch-pan-y hover:bg-[color:var(--bg-surface-hover)]"
    >
      <div className="h-10 w-10 overflow-hidden rounded-[6px]">
        <AnimeCover src={coverUrl} alt={title} ratio="1/1" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-[color:var(--text-primary)]">
          {title}
        </p>
        <p className="mt-1 truncate text-[10px] text-[color:var(--text-muted)]">
          {meta}
        </p>
      </div>
    </a>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-[12px] text-[color:var(--text-muted)]">
      {children}
    </p>
  );
}

function padEpisode(value: number) {
  return String(value).padStart(2, "0");
}

function formatEpisode(value: number) {
  return value > 0 ? `EP.${padEpisode(value)}` : "未开始";
}

function formatDate(value: Date | number | string) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value * 1000)
        : new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

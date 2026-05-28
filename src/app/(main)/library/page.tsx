import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/ui";
import { AnimeCover } from "@/components/features/AnimeCover";
import { LibraryClient } from "./LibraryClient";
import { StatusRing } from "@/components/features/StatusRing";
import { WatchHoursChart } from "@/components/features/WatchHoursChart";
import {
  getLibrary,
  getLibraryStats,
} from "@/lib/db-helpers/library";
import { getMonthHours, getWeekDailyHours } from "@/lib/db-helpers/stats";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = getLibrary(user.id);
  const stats = getLibraryStats(user.id);

  // 取最新 4 张封面拼接做 Hero 背景
  const heroCovers = items
    .filter((it) => it.anime.coverUrl)
    .slice(0, 4)
    .map((it) => it.anime.coverUrl as string);

  // 环形图数据
  const ringSegments = [
    { label: "在看", value: stats.watching, color: "var(--accent)" },
    { label: "想看", value: stats.planning, color: "#94a3b8" },
    { label: "看完", value: stats.completed, color: "#4ade80" },
    { label: "搁置", value: stats.onhold, color: "#e5772e" },
    { label: "弃番", value: stats.dropped, color: "#b85a4a" },
  ];

  const weekData = getWeekDailyHours(user.id);
  const monthHours = getMonthHours(user.id);

  return (
    <div className="relative">
      {/* ============ Hero 横幅 ============ */}
      <section className="relative h-[240px] w-full overflow-hidden">
        {/* 背景：4 张封面横排拼 + 强模糊 + 暗罩 */}
        <div className="absolute inset-0 flex">
          {heroCovers.length > 0 ? (
            heroCovers.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className="flex-1 object-cover h-full"
                style={{ filter: "blur(18px) saturate(0.85)" }}
              />
            ))
          ) : (
            <div className="flex-1 bg-[color:var(--bg-elevated)]" />
          )}
        </div>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.75) 60%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 50%, rgb(var(--accent-rgb) / 0.10) 0%, transparent 60%)",
          }}
        />

        <div className="relative mx-auto max-w-[1440px] h-full px-8 flex items-center justify-between">
          <div>
            <h1
              className="text-[44px] font-extrabold tracking-[-0.03em] leading-none text-[color:var(--text-primary)]"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}
            >
              我的追番
            </h1>
            <p className="mt-3 text-[13px] text-[color:var(--text-secondary)]">
              管理你的追番收藏 · 共 {stats.total} 部
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatCard label="正在看" value={stats.watching} />
            <StatCard label="本季在追" value={stats.seasonal} accent />
            <StatCard label="已看完" value={stats.completed} />
          </div>
        </div>
      </section>

      {/* ============ Body ============ */}
      <section className="mx-auto max-w-[1440px] px-8 py-8 grid grid-cols-12 gap-6">
        {/* 左侧统计 */}
        <aside className="col-span-3 space-y-4">
          <GlassPanel variant="elevated" className="p-5">
            <h3 className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-4">
              状态统计
            </h3>
            <div className="flex justify-center">
              <StatusRing segments={ringSegments} total={stats.total} />
            </div>
            <ul className="mt-5 space-y-2">
              {ringSegments.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="flex items-center gap-2 text-[color:var(--text-secondary)]">
                    <span
                      aria-hidden
                      className="block w-2 h-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </span>
                  <span
                    data-tabular
                    className="text-[color:var(--text-primary)]"
                  >
                    {s.value}
                  </span>
                </li>
              ))}
            </ul>
          </GlassPanel>

          <GlassPanel variant="elevated" className="p-5">
            <h3 className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-3">
              本月观看时长
            </h3>
            <WatchHoursChart data={weekData} totalHours={monthHours} />
          </GlassPanel>

          {items.length > 0 && (
            <GlassPanel className="p-4">
              <h3 className="text-[12px] font-medium text-[color:var(--text-muted)] mb-3">
                最近添加
              </h3>
              <div className="space-y-2">
                {items.slice(0, 3).map((it) => (
                  <a
                    key={it.anime.id}
                    href={`/anime/${it.anime.id}`}
                    className="flex items-center gap-2 group"
                  >
                    <div className="w-10 h-10 rounded-[6px] overflow-hidden shrink-0">
                      <AnimeCover
                        src={it.anime.coverUrl}
                        alt={it.anime.title}
                        ratio="1/1"
                      />
                    </div>
                    <span className="text-[12px] text-[color:var(--text-secondary)] group-hover:text-[color:var(--accent)] truncate transition-colors">
                      {it.anime.title}
                    </span>
                  </a>
                ))}
              </div>
            </GlassPanel>
          )}
        </aside>

        {/* 右侧主区 */}
        <div className="col-span-9">
          <LibraryClient items={items} />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className="px-5 py-3 rounded-[8px] min-w-[100px]"
      style={{
        background: "rgba(20,20,22,0.7)",
        backdropFilter: "blur(16px)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <p
        data-tabular
        className="text-[28px] font-bold tracking-tight leading-none"
        style={{
          color: accent ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">{label}</p>
    </div>
  );
}

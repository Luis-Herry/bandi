import { redirect } from "next/navigation";
import { Search, ArrowRight, Play, Clock, AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import {
  getHeroCandidates,
  getTodayUpdates,
  getContinueWatching,
  getMissedUpdates,
  getUpcomingEpisodes,
} from "@/lib/db-helpers/library";
import { getSeasonalBrowse } from "@/lib/db-helpers/browse";
import { currentSeason } from "@/lib/bangumi";
import { Button, GlassPanel, Tag } from "@/components/ui";
import { HomeHero, type HeroSlide } from "@/components/features/HomeHero";
import { EmberBackground } from "@/components/features/EmberBackground";
import {
  SeasonalBrowseWeekday,
} from "@/components/features/SeasonalBrowseWeekday";
import { AnimeRowItem } from "@/components/features/AnimeRowItem";
import { PlayButton } from "@/components/features/PlayButton";
import { MissedUpdateActions } from "@/components/features/MissedUpdateActions";
import {
  TodayOrUpcomingSection,
  type TodayUpdateView,
  type UpcomingItemView,
} from "@/components/features/TodayOrUpcomingSection";
import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";

export const dynamic = "force-dynamic";

const SEASON_CN = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋",
} as const;

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const heroItems = getHeroCandidates(user.id, 5);
  const todayUpdatesRaw = getTodayUpdates(user.id);
  const continueItems = getContinueWatching(user.id, 4);
  const missedItems = getMissedUpdates(user.id, 4);
  // 始终拿两份：客户端用来切换视图，不再以"今日为空"作分支
  const upcomingItemsRaw = getUpcomingEpisodes(user.id, 7);

  // 本季全集（与番剧库同源）
  const season = currentSeason();
  let seasonalAll: SeasonalBrowseItem[] = [];
  try {
    seasonalAll = await getSeasonalBrowse(user.id, season.season, season.year);
  } catch (err) {
    // Bangumi API 失败时降级为空数组，主页不该被外部依赖打挂
    console.error("[home] getSeasonalBrowse failed:", err);
  }

  // 空库状态
  if (heroItems.length === 0 && continueItems.length === 0) {
    return (
      <HomeShell>
        <EmptyHome username={user.username} />
      </HomeShell>
    );
  }

  const slides: HeroSlide[] = heroItems.map((it) => ({
    id: it.anime.id,
    title: it.anime.title,
    titleJa: it.anime.titleJa,
    synopsis: it.anime.synopsis,
    coverUrl: it.anime.coverUrl,
    year: it.anime.year,
    type: it.anime.type,
    tags: it.anime.tags ?? null,
    currentEpisode: it.userAnime.currentEpisode,
    totalEpisodes: it.anime.totalEpisodes,
    rating: it.userAnime.rating ?? undefined,
  }));

  // 转成 JSON-friendly 给 client 组件
  const todayUpdates: TodayUpdateView[] = todayUpdatesRaw.map((u) => ({
    animeId: u.anime.id,
    title: u.anime.title,
    titleJa: u.anime.titleJa,
    coverUrl: u.anime.coverUrl,
    totalEpisodes: u.anime.totalEpisodes,
    episodeNumber: u.episode.number,
    watched: u.watched,
    isDownloaded: u.episode.isDownloaded,
  }));

  const upcomingItems: UpcomingItemView[] = upcomingItemsRaw.map((u) => ({
    key: `${u.anime.id}-${u.episode.id}`,
    animeId: u.anime.id,
    title: u.anime.title,
    titleJa: u.anime.titleJa,
    coverUrl: u.anime.coverUrl,
    totalEpisodes: u.anime.totalEpisodes,
    episodeNumber: u.episode.number,
    airedAt: u.episode.airedAt ? u.episode.airedAt.toISOString() : null,
  }));

  // 本季按更新日分组
  const seasonalGroups = groupSeasonalByWeekday(seasonalAll);
  const seasonalTotal = seasonalAll.filter((it) => it.date).length;

  return (
    <HomeShell>
      {/* Hero 区 */}
      {slides.length > 0 && <HomeHero slides={slides} />}

      {/* 主体信息流 */}
      <section className="mx-auto max-w-[1440px] px-4 py-8 space-y-8 sm:px-6 lg:px-8 lg:py-10 lg:space-y-10">
        {/* ── 今日更新 / 未来 7 天预告 ── */}
        <TodayOrUpcomingSection
          todayUpdates={todayUpdates}
          upcomingItems={upcomingItems}
        />

        {/* ── 继续观看 + 漏看提醒（左右两栏） ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-1 lg:col-span-7">
            <Section
              icon={<Play size={16} />}
              title="继续观看"
              subtitle="上次中断的进度，从这里接着看"
              right={
                <a
                  href="/library"
                  className="text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)] inline-flex items-center gap-1 transition-colors"
                >
                  全部追番 <ArrowRight size={12} />
                </a>
              }
            >
              {continueItems.length === 0 ? (
                <GlassPanel className="p-6 text-center">
                  <p className="text-[13px] text-[color:var(--text-secondary)]">
                    暂无在看的番剧
                  </p>
                </GlassPanel>
              ) : (
                <GlassPanel className="p-2 space-y-1">
                  {continueItems.map((it) => {
                    const denom = it.anime.totalEpisodes ?? null;
                    // 继续观看 = 用户当前进度本身（0 时降级到 1）
                    const playEp =
                      it.userAnime.currentEpisode > 0
                        ? it.userAnime.currentEpisode
                        : 1;
                    const meta = denom
                      ? `EP.${String(it.userAnime.currentEpisode).padStart(2, "0")} / ${String(denom).padStart(2, "0")} · ${it.anime.type}`
                      : `EP.${String(it.userAnime.currentEpisode).padStart(2, "0")} · ${it.anime.type}`;
                    return (
                      <AnimeRowItem
                        key={it.anime.id}
                        id={it.anime.id}
                        title={it.anime.title}
                        coverUrl={it.anime.coverUrl}
                        meta={meta}
                        progress={denom ? it.userAnime.currentEpisode / denom : undefined}
                        action={
                          <PlayButton
                            animeId={it.anime.id}
                            episode={playEp}
                            label={`EP.${String(playEp).padStart(2, "0")}`}
                            variant="ghost"
                            size="sm"
                          />
                        }
                      />
                    );
                  })}
                </GlassPanel>
              )}
            </Section>
          </div>

          <div className="col-span-1 lg:col-span-5">
            <Section
              icon={<AlertCircle size={16} />}
              title="漏看提醒"
              subtitle={
                missedItems.length > 0
                  ? `${missedItems.length} 部番剧有新集数待观看`
                  : "没有遗漏的更新"
              }
            >
              {missedItems.length === 0 ? (
                <GlassPanel className="p-6 text-center">
                  <p className="text-[13px] text-[color:var(--text-secondary)]">
                    你已经追上了所有进度
                  </p>
                </GlassPanel>
              ) : (
                <GlassPanel className="p-2 space-y-1">
                  {missedItems.map((m) => {
                    const behind = m.latestAiredEpisode - m.userAnime.currentEpisode;
                    return (
                      <AnimeRowItem
                        key={m.anime.id}
                        id={m.anime.id}
                        title={m.anime.title}
                        coverUrl={m.anime.coverUrl}
                        meta={`落后 ${behind} 集 · ${m.daysSince === 0 ? "今天更新" : `${m.daysSince} 天前`}`}
                        action={
                          <MissedUpdateActions
                            animeId={m.anime.id}
                            animeTitle={m.anime.title}
                            episodeNumber={m.latestAiredEpisode}
                            isDownloaded={m.latestEpisodeIsDownloaded}
                          />
                        }
                      />
                    );
                  })}
                </GlassPanel>
              )}
            </Section>
          </div>
        </div>

        {/* ── 本季新番（按星期，来自 Bangumi 全集） ── */}
        <Section
          icon={<Clock size={16} />}
          title="本季新番"
          subtitle={`${season.year} ${SEASON_CN[season.season]}季 · 共 ${seasonalTotal} 部在播`}
          right={
            <a
              href="/browse"
              className="text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)] inline-flex items-center gap-1 transition-colors"
            >
              查看全部 <ArrowRight size={12} />
            </a>
          }
        >
          <SeasonalBrowseWeekday groups={seasonalGroups} />
        </Section>
      </section>
    </HomeShell>
  );
}

function HomeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <EmberBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

/**
 * 把 SeasonalBrowseItem 按 date 字段派生的 weekday 分组。
 * - date 为 null 跳过
 * - date 已经是 YYYY-MM-DD（首播日），weekday 即为每周更新日
 * - 服务端 list 已按 heat / score 排序，分组时保留顺序即可
 */
function groupSeasonalByWeekday(
  items: SeasonalBrowseItem[],
): { day: number; items: SeasonalBrowseItem[] }[] {
  const groups: SeasonalBrowseItem[][] = Array.from({ length: 7 }, () => []);
  for (const it of items) {
    if (!it.date) continue;
    // 直接 parse YYYY-MM-DD；Date 构造 ISO 字符串走 UTC，
    // 但只取 weekday 不取小时，UTC vs 本地差异不会跨日（首播日不会带时区）
    const d = new Date(it.date);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.getDay();
    groups[day].push(it);
  }
  // 周一 ~ 周日 顺序更直观；周日(0) 放最后
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((day) => ({ day, items: groups[day] }));
}

/* ─── Sub-components ────────────────────────────────────────── */

function Section({
  icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
            <span className="text-[color:var(--accent)]">{icon}</span>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function EmptyHome({ username }: { username: string }) {
  return (
    <div className="relative min-h-[calc(100vh-56px)] overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgb(var(--accent-rgb) / 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[720px] px-4 pt-28 pb-20 text-center sm:px-8 sm:pt-32 sm:pb-24">
        <Tag variant="accent">追番中心</Tag>
        <h1 className="mt-5 text-[40px] font-extrabold tracking-[-0.03em] leading-[1.1] text-[color:var(--text-primary)]">
          {username}，欢迎回来
        </h1>
        <p className="mt-3 text-[14px] text-[color:var(--text-secondary)] leading-relaxed">
          你的追番库还是空的。添加第一部番剧，开始管理你的追番清单。
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" size="lg" leftIcon={<Search size={14} />}>
            搜索番剧
          </Button>
          <Button variant="secondary" size="lg" asChild>
            <a href="/library">前往追番库</a>
          </Button>
        </div>

        <p className="mt-5 text-[11px] text-[color:var(--text-muted)]">
          提示：任何页面按 <kbd className="px-1.5 py-0.5 mx-0.5 rounded-[4px] bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)] text-[10px]">⌘K</kbd> 快速搜索
        </p>

        <div className="mt-16">
          <GlassPanel className="p-6 text-left">
            <h3 className="text-[13px] font-semibold text-[color:var(--text-primary)] mb-3">
              你可以做什么
            </h3>
            <ul className="space-y-2 text-[12px] text-[color:var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                追踪每部番剧的进度、评分、笔记
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                自动从 Bangumi/AniList 同步集数与放送日期
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                配置 RSS 自动下载到 qBittorrent
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                按星期查看本季所有追番的更新日历
              </li>
            </ul>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

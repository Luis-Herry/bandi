"use client";

import Link from "next/link";
import { ArrowRight, HardDrive } from "lucide-react";
import { AnimeCard } from "@/components/features/AnimeCard";
import { AnimeDataRefreshButton } from "@/components/features/AnimeDataRefreshButton";
import { AnimeLocalScanButton } from "@/components/features/CinemaScanButton";
import { PageHeader } from "@/components/features/PageHeader";
import { Button, GlassPanel } from "@/components/ui";
import { useCardGlow } from "@/hooks/useCardGlow";
import type { LocalAnimeItem } from "@/lib/db-helpers/library";

/**
 * 番剧侧「本地库」：你的自有动漫片（mediaType=anime + 本地文件），可直接播放。
 * 独立于「我的追番」（追的）和「番剧库」（发现新番）；点卡片进详情，剧集列表里有文件的集可播。
 */
export function LocalLibraryClient({ items }: { items: LocalAnimeItem[] }) {
  const gridRef = useCardGlow<HTMLDivElement>([items]);

  return (
    <div className="app-page-container space-y-6 py-6 sm:py-8">
      <PageHeader
        title="本地库"
        description={`你保存在本地的动漫 · 可直接播放 · 共 ${items.length} 部`}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <AnimeDataRefreshButton
              scope="local-library"
              label="刷新资料"
            />
            {items.length > 0 && <AnimeLocalScanButton />}
          </div>
        }
      />

      {items.length > 0 ? (
        <div
          ref={gridRef}
          className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3"
        >
          {items.map((it) => (
            <AnimeCard
              key={it.anime.id}
              id={it.anime.id}
              title={it.anime.title}
              titleJa={it.anime.titleJa}
              coverUrl={it.anime.coverUrl}
              watchStatus={it.userAnime?.watchStatus}
              currentEpisode={it.userAnime?.currentEpisode ?? 0}
              totalEpisodes={it.totalEpisodes}
              airedCount={it.downloadedEpisodes}
              cornerLabel={`本地 ${it.downloadedEpisodes}/${it.totalEpisodes}`}
              href={`/anime/${it.anime.id}?from=local`}
            />
          ))}
        </div>
      ) : (
        <GlassPanel className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <HardDrive size={28} className="text-[color:var(--text-muted)]" />
          <p className="text-[14px] font-medium text-[color:var(--text-primary)]">
            本地库还没有动漫
          </p>
          <p className="max-w-[460px] text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            选择已有动漫目录，先预览识别结果，再确认导入。导入只新增本地播放记录，不会自动加入“我的追番”。
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <AnimeLocalScanButton />
            <Button
              asChild
              size="sm"
              variant="secondary"
              rightIcon={<ArrowRight size={14} />}
            >
              <Link href="/admin/downloads">前往下载管理</Link>
            </Button>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

"use client";

import { HardDrive } from "lucide-react";
import { AnimeCard } from "@/components/features/AnimeCard";
import { GlassPanel } from "@/components/ui";
import { useCardGlow } from "@/hooks/useCardGlow";
import type { LocalAnimeItem } from "@/lib/db-helpers/library";

/**
 * 番剧侧「本地库」：你的自有动漫片（mediaType=anime + 本地文件），可直接播放。
 * 独立于「我的追番」（追的）和「番剧库」（发现新番）；点卡片进详情，剧集列表里有文件的集可播。
 */
export function LocalLibraryClient({ items }: { items: LocalAnimeItem[] }) {
  const gridRef = useCardGlow<HTMLDivElement>([items]);

  return (
    <div className="app-page-container py-6 space-y-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <HardDrive size={20} className="text-[color:var(--accent)]" />
          <h1 className="text-[22px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            本地库
          </h1>
        </div>
        <p className="text-[13px] text-[color:var(--text-secondary)]">
          你保存在本地的动漫 · 可直接播放 · 共 {items.length} 部
        </p>
      </header>

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
          <p className="max-w-[420px] text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            扫描你的自有动漫片并匹配 Bangumi 后，会出现在这里、可直接播放（独立于追番）。
          </p>
        </GlassPanel>
      )}
    </div>
  );
}

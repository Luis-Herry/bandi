import { db } from "@/db";
import { anime } from "@/db/schema";
import { isNotNull, desc } from "drizzle-orm";
import { OrbitCardDemo, type DemoItem } from "./OrbitCardDemo";

export const dynamic = "force-dynamic";

export default function OrbitDemoPage() {
  // 拿 6 部带封面的本地 anime 用作真实视觉素材；没数据就走 placeholder fallback
  const rows = db
    .select({
      id: anime.id,
      title: anime.title,
      titleJa: anime.titleJa,
      coverUrl: anime.coverUrl,
      year: anime.year,
      totalEpisodes: anime.totalEpisodes,
      type: anime.type,
    })
    .from(anime)
    .where(isNotNull(anime.coverUrl))
    .orderBy(desc(anime.id))
    .limit(6)
    .all();

  const items: DemoItem[] =
    rows.length > 0
      ? rows.map((r, i) => ({
          id: r.id,
          title: r.title,
          subtitle: r.titleJa ?? "",
          meta: [r.year, r.totalEpisodes ? `${r.totalEpisodes} 集` : null, r.type]
            .filter(Boolean)
            .join(" · "),
          cover: r.coverUrl ?? "/cover-placeholder.svg",
          rating: 8.5 + ((i * 13) % 10) / 10,
          tags: [r.type ?? "TV", r.year ? `${r.year}` : "2026"],
        }))
      : Array.from({ length: 6 }, (_, i) => ({
          id: i + 1,
          title: "示例番剧 " + (i + 1),
          subtitle: "Sample Anime " + (i + 1),
          meta: "2024 · 12 集 · TV",
          cover: "/cover-placeholder.svg",
          rating: 8.5,
          tags: ["TV", "2024"],
        }));

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-12">
      <div className="mb-10">
        <h1 className="text-[24px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-2">
          卡片动效重做 · Demo
        </h1>
        <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed">
          搬自 radesign-style-skeleton 的 .card--glow（1px conic orbit ring + 鼠标
          边缘描边）+ TravelCard 风格复合悬浮（整卡上浮、封面放大、文字上滑、
          底部按钮滑入）。独立 CSS、独立 class、独立 hook，和 .anime-card-glow
          完全隔离 — 这页有效 = 现网卡片的问题在融合层，不在动效本身。
        </p>
      </div>
      <OrbitCardDemo items={items} />
    </div>
  );
}

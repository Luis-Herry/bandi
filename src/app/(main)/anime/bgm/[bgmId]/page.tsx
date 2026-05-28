/**
 * /anime/bgm/[bgmId] — Bangumi → 本地详情页的按需同步重定向。
 *
 * 番剧库的卡片大多对应 Bangumi 上的番但本地还没建过 `anime` 行（用户没"想看"
 * 也没下载过），直接链 `/anime/[id]` 拿不到 id。这里做按需同步：
 *   1. 先 lookup 本地 anime by bangumiId
 *   2. 命中就直接 redirect 走
 *   3. 没命中调 syncFromBangumi 拉详情 + 集数入库，再 redirect
 *   4. Bangumi 也找不到 → notFound
 *
 * 服务端 `redirect()` 会 throw 一个 NEXT_REDIRECT，由 Next 转成 307 给浏览器，
 * 浏览器拿到后会替换地址栏到目标 URL — 不需要也不应该用 `RedirectType` 参数
 * （那个只在 Server Action 里影响 client 端 push/replace 决策，在 Server
 * Component 里多余且某些版本会触发奇怪行为）。
 */

import { notFound, redirect } from "next/navigation";
import { getAnimeByBangumiId, syncFromBangumi } from "@/db/queries/anime";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ bgmId: string }>;
}

export default async function AnimeByBangumiPage({ params }: PageProps) {
  const { bgmId } = await params;
  const id = Number(bgmId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const existing = getAnimeByBangumiId(id);
  if (existing) {
    redirect(`/anime/${existing.id}`);
  }

  const synced = await syncFromBangumi(id);
  if (!synced) notFound();

  redirect(`/anime/${synced.animeId}`);
}

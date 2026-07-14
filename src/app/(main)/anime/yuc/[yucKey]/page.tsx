import { ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { GlassPanel } from "@/components/ui";
import { lookupYucEntryBySourceKey } from "@/lib/yuc/client";
import {
  resolveYucAnime,
  YucIdentityConflictError,
} from "@/lib/yuc/identity";
import {
  decodeYucSourceKeyParam,
  parseYucSourceKey,
} from "@/lib/yuc/parser";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ yucKey: string }>;
}

export default async function AnimeByYucPage({ params }: PageProps) {
  const routeParams = await params;
  const yucKey = decodeYucSourceKeyParam(routeParams.yucKey);
  if (!yucKey) notFound();
  const parts = parseYucSourceKey(yucKey);
  if (!parts) notFound();

  const lookup = await lookupYucEntryBySourceKey(yucKey);
  if (lookup.status !== "found") {
    if (lookup.status === "unavailable") {
      return (
        <YucUnavailable
          sourceUrl={sourcePageUrl(parts.sourceKind, parts.pageId)}
        />
      );
    }
    notFound();
  }
  const entry = lookup.entry;

  try {
    const resolved = resolveYucAnime(entry);
    redirect(`/anime/${resolved.anime.id}`);
  } catch (error) {
    if (error instanceof YucIdentityConflictError) {
      return <YucIdentityConflict sourceUrl={entry.sourceUrl} />;
    }
    throw error;
  }
}

function YucUnavailable({ sourceUrl }: { sourceUrl: string }) {
  return (
    <main className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 lg:px-8">
      <GlassPanel className="p-6 sm:p-8">
        <h1 className="text-[20px] font-semibold text-[color:var(--text-primary)]">
          长门番堂情报暂时无法读取
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
          已保留本地最后一次有效数据保护；当前条目尚未缓存，稍后重试即可。
        </p>
        <SourceLink href={sourceUrl} />
      </GlassPanel>
    </main>
  );
}

function YucIdentityConflict({ sourceUrl }: { sourceUrl: string }) {
  return (
    <main className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 lg:px-8">
      <GlassPanel className="p-6 sm:p-8">
        <h1 className="text-[20px] font-semibold text-[color:var(--text-primary)]">
          需要确认这部动画的本地匹配
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
          找到多个同名候选，为避免把追番进度写到错误作品，系统已停止自动关联。
        </p>
        <SourceLink href={sourceUrl} />
      </GlassPanel>
    </main>
  );
}

function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-5 inline-flex h-10 items-center gap-2 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-4 text-[13px] text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--bg-surface-hover)]"
    >
      <ExternalLink size={15} />
      打开长门番堂来源页
    </a>
  );
}

function sourcePageUrl(sourceKind: string, pageId: string): string {
  if (sourceKind === "season") return `https://yuc.wiki/${pageId}/`;
  if (sourceKind === "future") return "https://yuc.wiki/new/";
  if (sourceKind === "special") return "https://yuc.wiki/sp/";
  return "https://yuc.wiki/movie/";
}

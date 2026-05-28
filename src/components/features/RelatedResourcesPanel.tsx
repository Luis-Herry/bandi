import Link from "next/link";
import { ExternalLink, Tv } from "lucide-react";
import { GlassPanel, Tag } from "@/components/ui";
import { AnimeCover } from "@/components/features/AnimeCover";
import type { RelatedResourceView } from "@/lib/bangumi-relations";
import { getRelatedResourcesHint } from "@/lib/bangumi-relations";
import { cn } from "@/lib/cn";

interface RelatedResourcesPanelProps {
  bangumiId: number | null;
  anilistId: number | null;
  resources: RelatedResourceView[];
}

export function RelatedResourcesPanel({
  bangumiId,
  anilistId,
  resources,
}: RelatedResourcesPanelProps) {
  const hint =
    resources.length > 0
      ? getRelatedResourcesHint(resources)
      : "Bangumi 暂时没有整理更多关联资源。";

  return (
    <GlassPanel className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            关联资源
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            {hint}
          </p>
        </div>
        <Tv size={14} className="mt-0.5 text-[color:var(--text-muted)] shrink-0" />
      </div>

      {resources.length > 0 ? (
        <div className="space-y-2">
          {resources.map((item) => (
            <RelatedResourceItem key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[color:var(--text-primary)] truncate">
              Bangumi #{bangumiId ?? "—"}
            </p>
            <p className="text-[11px] text-[color:var(--text-muted)] truncate">
              AniList #{anilistId ?? "—"}
            </p>
          </div>
        </div>
      )}

      {bangumiId && resources.length > 0 && (
        <a
          href={`https://bangumi.tv/subject/${bangumiId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          查看 Bangumi 完整关联
          <ExternalLink size={11} />
        </a>
      )}
    </GlassPanel>
  );
}

function RelatedResourceItem({ item }: { item: RelatedResourceView }) {
  return (
    <article
      className={cn(
        "anime-card-glow group relative flex items-center gap-3 rounded-[8px] border p-2.5",
        "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]",
        "transition-[border-color,background-color,transform] duration-500",
        "hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)]",
      )}
      style={{
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {item.external ? (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.title}
          className="absolute inset-0 z-10 rounded-[8px]"
        />
      ) : (
        <Link
          href={item.href}
          aria-label={item.title}
          className="absolute inset-0 z-10 rounded-[8px]"
        />
      )}

      <div className="w-12 h-12 rounded-[6px] overflow-hidden shrink-0">
        <AnimeCover
          src={item.imageUrl}
          alt={item.title}
          ratio="1/1"
          sizes="48px"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <Tag variant="outline">{item.kind}</Tag>
          <span className="text-[10px] text-[color:var(--text-muted)] truncate">
            {item.relation}
          </span>
        </div>
        <p className="text-[12px] leading-snug text-[color:var(--text-primary)] line-clamp-2">
          {item.title}
        </p>
      </div>
      {item.external && (
        <ExternalLink
          size={12}
          className="text-[color:var(--text-muted)] shrink-0"
        />
      )}
    </article>
  );
}

import Link from "next/link";
import { UserRound } from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { cn } from "@/lib/cn";

interface CharacterCardProps {
  name: string;
  role: string;
  imageUrl?: string | null;
  actorName?: string | null;
  actorHref?: string | null;
  href: string;
  className?: string;
}

export function CharacterCard({
  name,
  role,
  imageUrl,
  actorName,
  actorHref,
  href,
  className,
}: CharacterCardProps) {
  return (
    <article
      className={cn(
        "anime-card-glow group relative overflow-hidden rounded-[8px]",
        "border border-[color:var(--border-subtle)]",
        "bg-[color:var(--bg-surface)]",
        className,
      )}
    >
      <Link
        href={href}
        aria-label={`查看角色 ${name}`}
        className="absolute inset-0 z-[8] rounded-[8px]"
      >
        <span className="sr-only">查看角色 {name}</span>
      </Link>

      <div className="relative z-[9] flex min-h-[104px] gap-3 p-3 pointer-events-none">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)]">
          <AnimeCover
            src={imageUrl}
            alt={name}
            ratio="1/1"
            sizes="80px"
            className="h-full w-full"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex h-5 max-w-full items-center rounded-[4px] border border-[color:var(--accent)]/35 bg-[color:var(--accent-muted)] px-1.5 text-[10px] font-medium text-[color:var(--accent)]">
              <span className="truncate">{role}</span>
            </div>
            <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--text-primary)]">
              {name}
            </h3>
          </div>

          {actorName ? (
            <div className="mt-3 flex min-w-0 items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
              <UserRound size={12} className="shrink-0" />
              <span className="shrink-0">CV</span>
              {actorHref ? (
                <Link
                  href={actorHref}
                  className="pointer-events-auto relative z-[10] truncate text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--accent)]"
                >
                  {actorName}
                </Link>
              ) : (
                <span className="truncate text-[color:var(--text-secondary)]">
                  {actorName}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-[color:var(--text-muted)]">
              暂无声优数据
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

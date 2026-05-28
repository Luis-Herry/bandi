import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { cn } from "@/lib/cn";

interface StaffCardProps {
  name: string;
  role: string;
  imageUrl?: string | null;
  href: string;
  className?: string;
}

export function StaffCard({
  name,
  role,
  imageUrl,
  href,
  className,
}: StaffCardProps) {
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
        aria-label={`查看制作人员 ${name}`}
        className="absolute inset-0 z-[8] rounded-[8px]"
      >
        <span className="sr-only">查看制作人员 {name}</span>
      </Link>

      <div className="relative z-[9] flex min-h-[96px] gap-3 p-3 pointer-events-none">
        <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)]">
          <AnimeCover
            src={imageUrl}
            alt={name}
            ratio="1/1"
            sizes="72px"
            className="h-full w-full"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] px-1.5 py-1 text-[10px] font-medium text-[color:var(--text-secondary)]">
              <BriefcaseBusiness size={11} className="shrink-0" />
              <span className="truncate">{role}</span>
            </div>
            <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--text-primary)]">
              {name}
            </h3>
          </div>
          <p className="mt-3 text-[11px] text-[color:var(--text-muted)]">
            Bangumi 制作资料
          </p>
        </div>
      </div>
    </article>
  );
}

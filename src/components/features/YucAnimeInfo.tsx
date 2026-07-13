import { ExternalLink, Film, Radio, Tv } from "lucide-react";
import { GlassPanel } from "@/components/ui";
import {
  getYucSourceHref,
  sanitizeYucExternalUrl,
  type YucDetailMatch,
} from "@/lib/yuc/detail";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/";

interface YucAnimeInfoProps {
  match: YucDetailMatch;
}

export function YucAnimeInfo({ match }: YucAnimeInfoProps) {
  const { entry } = match;
  const sourceHref = getYucSourceHref(match);
  const officialHref = sanitizeYucExternalUrl(entry.officialUrl);
  const pvHref = sanitizeYucExternalUrl(entry.pvUrl);
  const providers = entry.providers
    .map((provider) => ({
      ...provider,
      safeUrl: sanitizeYucExternalUrl(provider.url),
    }))
    .filter((provider) => provider.safeUrl != null);
  const facts = [
    ["每周播出", formatSchedule(entry.weeklyDay, entry.weeklyTime, entry.scheduleRaw)],
    ["开播日期", entry.premiereRaw ?? entry.premiereDate],
    ["总话数", entry.totalEpisodes ? `${entry.totalEpisodes} 话` : null],
    ["制作公司", entry.studio],
    ["原作", entry.original],
    ["声优", entry.cast.length > 0 ? entry.cast.join("、") : null],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            长门番堂情报
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            补充播出时间、正版入口和动画官方资料
          </p>
        </div>
        <Radio size={14} className="mt-0.5 shrink-0 text-[color:var(--text-muted)]" />
      </div>

      {facts.length > 0 && (
        <dl className="space-y-2 text-[12px]">
          {facts.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-[color:var(--text-muted)]">{label}</dt>
              <dd className="min-w-0 text-right leading-relaxed text-[color:var(--text-primary)] [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {providers.length > 0 && (
        <div className={facts.length > 0 ? "mt-4" : ""}>
          <p className="mb-2 text-[11px] text-[color:var(--text-muted)]">正版播放</p>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <SafeExternalLink
                key={`${provider.label}:${provider.safeUrl}`}
                href={provider.safeUrl!}
                label={`${provider.label}${provider.service ? ` · ${provider.service}` : ""}`}
                icon={<Tv size={12} />}
              />
            ))}
          </div>
        </div>
      )}

      {(officialHref || pvHref) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {officialHref && (
            <SafeExternalLink
              href={officialHref}
              label="动画官网"
              icon={<ExternalLink size={12} />}
            />
          )}
          {pvHref && (
            <SafeExternalLink href={pvHref} label="观看 PV" icon={<Film size={12} />} />
          )}
        </div>
      )}

      <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-3 text-[10px] leading-relaxed text-[color:var(--text-muted)]">
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        >
          长门番堂 · CC BY-NC-SA 4.0
        </a>
        {sourceHref && (
          <>
            <span aria-hidden> · </span>
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            >
              来源页
              <ExternalLink size={10} />
            </a>
          </>
        )}
      </div>
    </GlassPanel>
  );
}

function SafeExternalLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-2.5 py-1.5 text-[11px] leading-tight text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function formatSchedule(
  weeklyDay: number | null,
  weeklyTime: string | null,
  scheduleRaw: string | null,
): string | null {
  if (weeklyDay != null && WEEKDAYS[weeklyDay]) {
    return `${WEEKDAYS[weeklyDay]}${weeklyTime ? ` ${weeklyTime}` : ""}`;
  }
  return scheduleRaw;
}

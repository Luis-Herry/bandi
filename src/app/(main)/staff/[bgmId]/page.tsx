import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { BackButton } from "@/components/features/BackButton";
import { GlassPanel, Tag } from "@/components/ui";
import { getPerson, getPersonSubjects } from "@/lib/bangumi";
import {
  selectBangumiImage,
  toPersonWorkView,
} from "@/lib/bangumi-credits";

interface PageProps {
  params: Promise<{ bgmId: string }>;
}

export const dynamic = "force-dynamic";

export default async function StaffPage({ params }: PageProps) {
  const { bgmId } = await params;
  const id = Number(bgmId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const [person, subjects] = await Promise.all([
    getPerson(id),
    getPersonSubjects(id),
  ]);
  if (!person) notFound();

  const imageUrl = selectBangumiImage(person.images);
  const works = subjects
    .filter((item) => item.type === 2)
    .map(toPersonWorkView)
    .slice(0, 18);

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <div className="mb-6">
        <BackButton />
      </div>

      <section className="grid grid-cols-12 gap-6">
        <GlassPanel variant="elevated" className="col-span-4 overflow-hidden p-0">
          <AnimeCover
            src={imageUrl}
            alt={person.name}
            ratio="3/4"
            priority
            sizes="360px"
          />
        </GlassPanel>

        <div className="col-span-8 space-y-5">
          <header>
            <p className="text-[12px] text-[color:var(--text-muted)]">
              Bangumi 人物 #{person.id}
            </p>
            <h1 className="mt-2 text-[40px] font-extrabold leading-tight tracking-tight text-[color:var(--text-primary)]">
              {person.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(person.career?.length ? person.career : ["制作人员"])
                .slice(0, 4)
                .map((career) => (
                  <Tag key={career} variant="outline">
                    {career}
                  </Tag>
                ))}
              <a
                href={`https://bangumi.tv/person/${person.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
              >
                <ExternalLink size={12} />
                Bangumi
              </a>
            </div>
          </header>

          <GlassPanel className="p-5">
            <h2 className="text-[15px] font-semibold text-[color:var(--text-primary)]">
              简介
            </h2>
            <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.8] text-[color:var(--text-secondary)]">
              {(person.summary || person.short_summary)?.trim() || "暂无简介。"}
            </p>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                参与动画
              </h2>
              <span className="text-[11px] text-[color:var(--text-muted)]">
                {works.length} 部
              </span>
            </div>
            {works.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {works.map((work) => (
                  <a
                    key={`${work.id}-${work.role}`}
                    href={work.href}
                    className="group flex min-w-0 items-center gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-2 transition-colors hover:bg-[color:var(--bg-surface-hover)]"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-[color:var(--border-subtle)]">
                      <AnimeCover
                        src={work.imageUrl}
                        alt={work.title}
                        ratio="1/1"
                        sizes="56px"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                        {work.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                        {work.role}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[12px] text-[color:var(--text-muted)]">
                暂无动画作品数据
              </p>
            )}
          </GlassPanel>
        </div>
      </section>
    </div>
  );
}

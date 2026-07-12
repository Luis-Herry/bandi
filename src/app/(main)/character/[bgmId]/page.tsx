import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { BackButton } from "@/components/features/BackButton";
import { GlassPanel, Tag } from "@/components/ui";
import { getCharacter } from "@/lib/bangumi";
import { selectBangumiImage } from "@/lib/bangumi-credits";

interface PageProps {
  params: Promise<{ bgmId: string }>;
}

export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: PageProps) {
  const { bgmId } = await params;
  const id = Number(bgmId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const character = await getCharacter(id);
  if (!character) notFound();

  const imageUrl = selectBangumiImage(character.images);
  const infoRows = character.infobox?.flatMap((item) => {
    if (typeof item.value === "string") {
      return [{ key: item.key, value: item.value }];
    }
    return item.value
      .map((entry) => ({
        key: entry.k ? `${item.key} · ${entry.k}` : item.key,
        value: entry.v ?? "",
      }))
      .filter((entry) => entry.value);
  }) ?? [];

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <div className="mb-6">
        <BackButton />
      </div>

      <section className="grid grid-cols-12 gap-6">
        <GlassPanel variant="elevated" className="col-span-4 overflow-hidden p-0">
          <AnimeCover
            src={imageUrl}
            alt={character.name}
            ratio="3/4"
            priority
            sizes="360px"
            fit="contain"
            objectPosition="center top"
          />
        </GlassPanel>

        <div className="col-span-8 space-y-5">
          <header>
            <p className="text-[12px] text-[color:var(--text-muted)]">
              Bangumi 角色 #{character.id}
            </p>
            <h1 className="mt-2 text-[40px] font-extrabold leading-tight tracking-tight text-[color:var(--text-primary)]">
              {character.name}
            </h1>
            <div className="mt-4 flex items-center gap-2">
              <Tag variant="outline">角色</Tag>
              <a
                href={`https://bangumi.tv/character/${character.id}`}
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
              {character.summary?.trim() || "暂无简介。"}
            </p>
          </GlassPanel>

          <GlassPanel className="p-5">
            <h2 className="text-[15px] font-semibold text-[color:var(--text-primary)]">
              资料
            </h2>
            {infoRows.length > 0 ? (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
                {infoRows.slice(0, 12).map((row) => (
                  <div
                    key={`${row.key}-${row.value}`}
                    className="flex items-baseline justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-2"
                  >
                    <dt className="shrink-0 text-[color:var(--text-muted)]">
                      {row.key}
                    </dt>
                    <dd className="truncate text-right text-[color:var(--text-primary)]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-[12px] text-[color:var(--text-muted)]">
                暂无补充资料
              </p>
            )}
          </GlassPanel>
        </div>
      </section>
    </div>
  );
}

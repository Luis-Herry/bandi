"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useState, type ReactNode } from "react";
import { GlassPanel, Tag } from "@/components/ui";
import { CharacterCard } from "@/components/features/CharacterCard";
import { CreditCardGrid } from "@/components/features/CreditCardGrid";
import { StaffCard } from "@/components/features/StaffCard";
import type {
  CharacterCardView,
  StaffCardView,
} from "@/lib/bangumi-credits";

type CreditKind = "characters" | "staff";
type TabKey = "intro" | CreditKind;

interface LoadState<T> {
  status: "idle" | "loading" | "loaded" | "error";
  items: T[];
}

interface AnimeCreditsTabsProps {
  animeId: number;
  synopsis: string | null;
  tags: string[] | null;
  hasBangumi: boolean;
}

export function AnimeCreditsTabs({
  animeId,
  synopsis,
  tags,
  hasBangumi,
}: AnimeCreditsTabsProps) {
  const [active, setActive] = useState<TabKey>("intro");
  const [characters, setCharacters] = useState<LoadState<CharacterCardView>>({
    status: "idle",
    items: [],
  });
  const [staff, setStaff] = useState<LoadState<StaffCardView>>({
    status: "idle",
    items: [],
  });

  const loadCredits = useCallback(
    async (kind: CreditKind) => {
      if (!hasBangumi) return;
      const state = kind === "characters" ? characters : staff;
      if (state.status === "loading" || state.status === "loaded") return;

      const setState = kind === "characters" ? setCharacters : setStaff;
      setState({ status: "loading", items: [] });
      try {
        const res = await fetch(`/api/anime/${animeId}/credits?type=${kind}`);
        if (!res.ok) throw new Error(`credits ${kind} failed: ${res.status}`);
        const data = (await res.json()) as {
          items?: CharacterCardView[] | StaffCardView[];
        };
        if (kind === "characters") {
          setCharacters({
            status: "loaded",
            items: (data.items ?? []) as CharacterCardView[],
          });
        } else {
          setStaff({
            status: "loaded",
            items: (data.items ?? []) as StaffCardView[],
          });
        }
      } catch (error) {
        console.error("[anime-credits] load failed:", error);
        setState({ status: "error", items: [] });
      }
    },
    [animeId, characters, hasBangumi, staff],
  );

  function handleTabChange(value: string) {
    const next = value as TabKey;
    setActive(next);
    if (next === "characters" || next === "staff") {
      void loadCredits(next);
    }
  }

  return (
    <Tabs.Root value={active} onValueChange={handleTabChange}>
      <Tabs.List className="relative z-10 flex items-center gap-1 border-b border-[color:var(--border-subtle)] mb-5">
        {[
          { v: "intro", label: "简介" },
          { v: "characters", label: "角色" },
          { v: "staff", label: "制作组" },
        ].map((t) => (
          <Tabs.Trigger
            key={t.v}
            value={t.v}
            className="relative h-10 cursor-pointer px-4 text-[13px] text-[color:var(--text-secondary)] data-[state=active]:text-[color:var(--text-primary)] data-[state=active]:font-medium transition-colors hover:text-[color:var(--text-primary)] outline-none data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:-bottom-px data-[state=active]:after:left-3 data-[state=active]:after:right-3 data-[state=active]:after:h-[2px] data-[state=active]:after:bg-[color:var(--accent)] data-[state=active]:after:rounded-full"
          >
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="intro" className="outline-none">
        <p className="text-[14px] leading-[1.75] text-[color:var(--text-secondary)] whitespace-pre-line">
          {synopsis ?? "暂无简介。"}
        </p>
        {tags && tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Tag key={t} variant="default">
                {t}
              </Tag>
            ))}
          </div>
        )}
      </Tabs.Content>

      <Tabs.Content value="characters" className="outline-none">
        {renderCharacters(hasBangumi, characters)}
      </Tabs.Content>

      <Tabs.Content value="staff" className="outline-none">
        {renderStaff(hasBangumi, staff)}
      </Tabs.Content>
    </Tabs.Root>
  );
}

function renderCharacters(
  hasBangumi: boolean,
  state: LoadState<CharacterCardView>,
) {
  if (!hasBangumi) return <CreditsEmptyText>暂无 Bangumi 关联数据</CreditsEmptyText>;
  if (state.status === "idle" || state.status === "loading") {
    return <CreditsEmptyText>正在加载角色数据…</CreditsEmptyText>;
  }
  if (state.status === "error") {
    return <CreditsEmptyText>角色数据加载失败</CreditsEmptyText>;
  }
  if (state.items.length === 0) {
    return <CreditsEmptyText>暂无角色数据</CreditsEmptyText>;
  }
  return (
    <CreditCardGrid depsKey={`characters-${state.items.length}`}>
      {state.items.map((item) => (
        <CharacterCard
          key={item.id}
          name={item.name}
          role={item.role}
          imageUrl={item.imageUrl}
          actorName={item.actorName}
          actorHref={item.actorHref}
          href={item.href}
        />
      ))}
    </CreditCardGrid>
  );
}

function renderStaff(hasBangumi: boolean, state: LoadState<StaffCardView>) {
  if (!hasBangumi) return <CreditsEmptyText>暂无 Bangumi 关联数据</CreditsEmptyText>;
  if (state.status === "idle" || state.status === "loading") {
    return <CreditsEmptyText>正在加载制作组数据…</CreditsEmptyText>;
  }
  if (state.status === "error") {
    return <CreditsEmptyText>制作组数据加载失败</CreditsEmptyText>;
  }
  if (state.items.length === 0) {
    return <CreditsEmptyText>暂无制作组数据</CreditsEmptyText>;
  }
  return (
    <CreditCardGrid depsKey={`staff-${state.items.length}`}>
      {state.items.map((item) => (
        <StaffCard
          key={item.id}
          name={item.name}
          role={item.role}
          imageUrl={item.imageUrl}
          href={item.href}
        />
      ))}
    </CreditCardGrid>
  );
}

function CreditsEmptyText({ children }: { children: ReactNode }) {
  return (
    <GlassPanel className="p-6 text-center text-[13px] text-[color:var(--text-muted)]">
      {children}
    </GlassPanel>
  );
}

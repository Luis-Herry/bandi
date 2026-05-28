import { redirect } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  HardDrive,
  Palette,
  Rss,
  SlidersHorizontal,
} from "lucide-react";
import { sql } from "drizzle-orm";
import { AutomationSettingsClient } from "@/components/features/AutomationSettingsClient";
import { BackButton } from "@/components/features/BackButton";
import { GlassPanel } from "@/components/ui";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { getUserTheme } from "@/lib/theme";
import { THEME_OPTIONS } from "@/lib/theme-options";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const currentTheme = await getUserTheme();
  const currentThemeMeta = THEME_OPTIONS.find((item) => item.value === currentTheme);
  const downloadSummary = getDownloadSummary();

  return (
    <>
      <div className="fixed top-20 left-8 z-40">
        <BackButton />
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-[240px_1fr] gap-6 px-8 py-8">
      <aside className="sticky top-20 h-fit space-y-2">
        <p className="px-2 text-[12px] text-[color:var(--text-muted)]">
          设置中心
        </p>
        <nav className="space-y-1">
          {SETTING_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex h-9 items-center gap-2 rounded-[6px] px-2 text-[12px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <header>
          <p className="text-[12px] text-[color:var(--text-muted)]">
            自动化与环境配置
          </p>
          <h1 className="mt-2 text-[34px] font-extrabold tracking-tight text-[color:var(--text-primary)]">
            设置中心
          </h1>
        </header>

        <section id="appearance" className="scroll-mt-20">
          <SettingsSection
            icon={<Palette size={16} />}
            title="外观"
            subtitle="主题切换继续放在顶栏，设置页展示当前状态"
          >
            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <div>
                <p className="text-[13px] font-medium text-[color:var(--text-primary)]">
                  当前主题：{currentThemeMeta?.label ?? currentTheme}
                </p>
                <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  {currentThemeMeta?.tone ?? "使用系统内置主题"}
                </p>
              </div>
              <div
                className="h-10 w-10 rounded-[8px] border border-white/15"
                style={{ background: currentThemeMeta?.bgBase ?? "var(--bg-base)" }}
              />
            </div>
          </SettingsSection>
        </section>

        <AutomationSettingsClient />

        <section id="data-maintenance" className="scroll-mt-20">
          <SettingsSection
            icon={<Archive size={16} />}
            title="数据与维护"
            subtitle="这里只做状态提示，高风险操作后续单独设计"
          >
            <div className="grid grid-cols-3 gap-3">
              <SummaryTile
                label="下载队列"
                value={downloadSummary.total}
                suffix="条"
              />
              <SummaryTile
                label="已完成"
                value={downloadSummary.completed}
                suffix="条"
              />
              <SummaryTile
                label="失败记录"
                value={downloadSummary.failed}
                suffix="条"
              />
            </div>
            <div className="mt-4 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3">
              <p className="flex items-center gap-2 text-[12px] font-medium text-[color:var(--text-primary)]">
                <CheckCircle2 size={14} className="text-[color:var(--accent)]" />
                备份、恢复、导出、批量清理需要单独确认范围和回滚方式
              </p>
            </div>
          </SettingsSection>
        </section>
      </div>
      </div>
    </>
  );
}

const SETTING_NAV = [
  { href: "#appearance", label: "外观", icon: <Palette size={14} /> },
  {
    href: "#download-preferences",
    label: "下载偏好",
    icon: <SlidersHorizontal size={14} />,
  },
  { href: "#rss", label: "RSS 源", icon: <Rss size={14} /> },
  { href: "#qbit", label: "qBittorrent", icon: <HardDrive size={14} /> },
  { href: "#data-maintenance", label: "数据与维护", icon: <Archive size={14} /> },
];

function SettingsSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GlassPanel variant="elevated" className="p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[color:var(--accent)]">{icon}</span>
          <div>
            <h2 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {subtitle}
            </p>
          </div>
        </div>
      </header>
      <div className="mt-5 space-y-4">{children}</div>
    </GlassPanel>
  );
}

function SummaryTile({
  label,
  value,
  suffix,
  compact = false,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3">
      <p className="text-[11px] text-[color:var(--text-muted)]">{label}</p>
      <p
        data-tabular
        className={
          compact
            ? "mt-2 truncate text-[13px] font-medium text-[color:var(--text-primary)]"
            : "mt-2 text-[22px] font-bold text-[color:var(--text-primary)]"
        }
      >
        {value}
        {suffix && (
          <span className="ml-1 text-[11px] font-normal text-[color:var(--text-muted)]">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function getDownloadSummary() {
  const rows = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${downloadQueue.status} = 'completed' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${downloadQueue.status} = 'failed' then 1 else 0 end)`,
    })
    .from(downloadQueue)
    .get();
  return {
    total: Number(rows?.total ?? 0),
    completed: Number(rows?.completed ?? 0),
    failed: Number(rows?.failed ?? 0),
  };
}

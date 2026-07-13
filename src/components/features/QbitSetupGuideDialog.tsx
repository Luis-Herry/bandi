"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  KeyRound,
  MonitorCog,
  MousePointerClick,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

interface QbitSetupGuideDialogProps {
  trigger?: ReactNode;
}

const STEPS = [
  {
    title: "打开设置",
    text: "在 qBittorrent 顶部工具栏点击齿轮图标，进入“选项”。",
    icon: <Settings2 size={15} />,
  },
  {
    title: "进入 Web UI",
    text: "左侧选择“Web UI”，勾选“Web 用户界面（远程控制）”。",
    icon: <MonitorCog size={15} />,
  },
  {
    title: "填连接地址",
    text: "IP 地址填 127.0.0.1，端口填 18080，HTTPS 保持关闭。",
    icon: <MousePointerClick size={15} />,
  },
  {
    title: "确认验证方式",
    text: "用户名填 admin，勾选“对本地主机上的客户端跳过身份验证”。",
    icon: <KeyRound size={15} />,
  },
  {
    title: "保存并刷新",
    text: "点击“应用”或“确定”，回到追番中心刷新 qBittorrent 状态。",
    icon: <CheckCircle2 size={15} />,
  },
];

const SCREENSHOTS = [
  {
    title: "1. 先点顶部齿轮",
    text: "在 qBittorrent 主窗口顶部工具栏点齿轮，进入选项设置。",
    src: "/qbit-guide/main-settings.png",
  },
  {
    title: "2. 再按 Web UI 页面填写",
    text: "勾选 Web UI，IP 填 127.0.0.1，端口填 18080。",
    src: "/qbit-guide/webui-options.png",
  },
];

export function QbitSetupGuideDialog({ trigger }: QbitSetupGuideDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<HelpCircle size={12} />}
          >
            不会设置看这里
          </Button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[900px] max-w-[94vw] max-h-[88vh] overflow-y-auto",
            "glass-panel-elevated p-5 focus:outline-none",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-[18px] font-semibold tracking-[-0.01em] text-[color:var(--text-primary)]">
                qBittorrent Web UI 设置
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                按截图里的位置依次设置，追番中心就能连接本机下载器。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <GuideValue label="IP 地址" value="127.0.0.1" />
            <GuideValue label="端口" value="18080" />
            <GuideValue label="用户名" value="admin" />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {SCREENSHOTS.map((screenshot) => (
              <GuideScreenshot
                key={screenshot.src}
                title={screenshot.title}
                text={screenshot.text}
                src={screenshot.src}
              />
            ))}
          </div>

          <ol className="mt-4 space-y-2.5">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[28px_1fr] gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] text-[color:var(--accent)]">
                  {step.icon}
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-[color:var(--text-primary)]">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3">
            <p className="text-[12px] font-medium text-[color:var(--text-primary)]">
              看第二张截图时重点确认四处
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
              “Web 用户界面”已勾选，IP 是 127.0.0.1，端口是 8080，“对本地主机上的客户端跳过身份验证”已勾选。
            </p>
          </div>

          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button size="sm" variant="primary">
                我知道了
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GuideValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2">
      <p className="text-[10px] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function GuideScreenshot({
  title,
  text,
  src,
}: {
  title: string;
  text: string;
  src: string;
}) {
  return (
    <figure className="overflow-hidden rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]">
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="block bg-black/20"
        aria-label={`${title}，打开大图`}
      >
        <img
          src={src}
          alt={title}
          className="block aspect-[1.45] w-full bg-white object-contain"
        />
      </a>
      <figcaption className="flex items-start justify-between gap-3 p-3">
        <div>
          <p className="text-[12px] font-semibold text-[color:var(--text-primary)]">
            {title}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            {text}
          </p>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
          aria-label={`${title}，打开大图`}
        >
          <ExternalLink size={14} />
        </a>
      </figcaption>
    </figure>
  );
}

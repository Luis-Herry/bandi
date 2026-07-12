"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getDesktopBridge } from "@/lib/desktop-bridge";

const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "首页"],
  [/^\/onboarding/, "首次设置"],
  [/^\/library\/local/, "本地库"],
  [/^\/library/, "我的追番"],
  [/^\/browse/, "番剧库"],
  [/^\/stats/, "统计"],
  [/^\/admin\/downloads/, "下载管理"],
  [/^\/settings/, "设置中心"],
  [/^\/profile/, "个人中心"],
  [/^\/player/, "正在播放"],
  [/^\/anime/, "番剧详情"],
  [/^\/cinema-library/, "影视库"],
  [/^\/cinema\/[^/]+/, "影视详情"],
  [/^\/cinema\/?$/, "影视本地库"],
  [/^\/character/, "角色资料"],
  [/^\/staff/, "制作人员资料"],
];

function getRouteTitle(pathname: string) {
  return ROUTE_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "私人放映厅";
}

export function DesktopTitlebar() {
  const pathname = usePathname();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    let mounted = true;
    void bridge.getWindowState().then((state) => {
      if (mounted) setIsMaximized(state.isMaximized);
    });
    const unsubscribe = bridge.onWindowStateChange((state) => {
      setIsMaximized(state.isMaximized);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const bridge = getDesktopBridge();
  const maximizeLabel = isMaximized ? "还原窗口" : "最大化";

  return (
    <header className="desktop-titlebar" role="toolbar" aria-label="Bandi 窗口栏">
      <div className="desktop-titlebar-brand" aria-label="Bandi 桌面版">
        <span className="desktop-titlebar-mark">
          <img src="/brand/app-logo.png" alt="" aria-hidden />
        </span>
        <span>Bandi</span>
      </div>

      <span className="desktop-titlebar-section" aria-live="polite">
        {getRouteTitle(pathname)}
      </span>

      <div className="desktop-titlebar-controls" role="group" aria-label="窗口控制">
        <button
          type="button"
          className="desktop-titlebar-window-button"
          aria-label="最小化"
          title="最小化"
          onClick={() => void bridge?.minimizeWindow()}
        >
          <Minus size={13} strokeWidth={1.6} aria-hidden />
        </button>
        <button
          type="button"
          className="desktop-titlebar-window-button"
          aria-label={maximizeLabel}
          title={maximizeLabel}
          onClick={async () => {
            if (!bridge) return;
            const state = await bridge.toggleMaximizeWindow();
            setIsMaximized(state.isMaximized);
          }}
        >
          <span
            aria-hidden
            className={cn(
              "desktop-titlebar-maximize-glyph",
              isMaximized && "is-restore",
            )}
          />
        </button>
        <button
          type="button"
          className="desktop-titlebar-window-button desktop-titlebar-close-button"
          aria-label="关闭"
          title="关闭"
          onClick={() => void bridge?.closeWindow()}
        >
          <X size={13} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
    </header>
  );
}

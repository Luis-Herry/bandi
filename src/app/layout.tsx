import type { Metadata } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";
import { ThemeSync } from "@/components/features/ThemeSync";
import { DesktopTitlebar } from "@/components/features/DesktopTitlebar";
import { getUserTheme } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bandi",
    template: "%s · Bandi",
  },
  applicationName: "Bandi",
  description: "你的私人放映厅",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/app-logo.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/brand/app-logo.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getUserTheme();
  const isDesktop = process.env.ANIME_DESKTOP_APP === "1";

  return (
    // suppressHydrationWarning: 容忍浏览器扩展（通义、沉浸式翻译、暗色主题插件等）
    // 在 hydrate 前往 <html> / <body> 注入 class / data-* 属性导致的 SSR 不一致。
    // 仅作用于这一层节点，不会掩盖应用内真正的 hydration mismatch。
    <html
      lang="zh-CN"
      data-theme={theme}
      data-desktop-app={isDesktop ? "true" : undefined}
      className={`${inter.variable} ${notoSansSC.variable}`}
      suppressHydrationWarning
    >
      <body className="noise antialiased" suppressHydrationWarning>
        <ThemeSync initialTheme={theme} />
        {isDesktop && <DesktopTitlebar />}
        <div className={isDesktop ? "desktop-app-content" : undefined}>
          {children}
        </div>
      </body>
    </html>
  );
}

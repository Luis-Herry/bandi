# 追番中心 — 视觉系统规范

> 版本：v1.0 | 日期：2026-05-24

## 色彩系统

### 基础色板

```css
:root {
  /* 背景层 */
  --bg-base: #0a0a0b;
  --bg-elevated: #141416;
  --bg-surface: rgba(255, 255, 255, 0.04);
  --bg-surface-hover: rgba(255, 255, 255, 0.08);

  /* 边框 */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.16);

  /* 文字 */
  --text-primary: #e8e8e8;
  --text-secondary: #888888;
  --text-muted: #555555;

  /* 状态 */
  --status-success: #4ade80;
  --status-warning: #fbbf24;
  --status-error: #ef4444;
  --status-info: #94a3b8;

  /* 强调色 — 主题级 fallback；详情页可由番剧封面局部覆盖 */
  --accent: #d4a853;
  --accent-rgb: 212 168 83;
  --accent-muted: rgba(212, 168, 83, 0.2);
  --accent-subtle: rgba(212, 168, 83, 0.1);
  --accent-contrast: #1a1408;
}
```

### 强调色提取方案

使用 colorthief 或 vibrant.js 从番剧封面提取：
- `dominant` — 用于进度条、active 状态
- `muted` — 用于背景 halo、hover 状态
- 提取后注入 CSS 变量 `--accent` / `--accent-muted` / `--accent-subtle`
- 确保与深色背景的对比度 ≥ 4.5:1

### 外观主题切换规则

- 外观主题切换必须覆盖完整强调色 token：`--accent`、`--accent-rgb`、`--accent-muted`、`--accent-subtle`、`--accent-contrast`。
- 只改变 `--bg-*`、`--border-*`、`--surface-noise-opacity` 属于氛围底色切换，不能算完整主题切换。
- 所有主行动、选中态、卡片 orbit ring、hover halo、进度条、顶部导航 active underline、主题菜单选中 dot 都必须引用同一组 accent token。
- 蓝色可以作为主题色；紫色主题只能走偏红暖紫，避开蓝紫倾向、蓝紫粉三色组合、蓝紫渐变和廉价渐变。
- 番剧详情页可以使用番剧封面提取色做局部覆盖，但离开详情页后不能污染全局主题 accent。
- `--status-success`、`--status-warning`、`--status-error`、`--status-info` 是状态语义色，不跟随主题 accent 批量替换。
- 主题级 `--accent` 用作小号文字 / 图标时，对 `--bg-base` 和 `--bg-elevated` 的对比度必须 ≥ 4.5:1；`--accent-contrast` 放在实心 accent 按钮上也必须 ≥ 4.5:1。

### 全局氛围模式

| 模式 | --bg-base | 色温调整 | 氛围 |
|------|-----------|---------|------|
| 潮流 | #0c0808 | 赤红暖底 | 高对比，街头 |
| 治愈 | #0d0c08 | 暖米色底 | 低对比，柔光 |
| 复古 | #0c0710 | 偏红暖紫 | 中对比，质感 |
| 蜜桃 | #0d0809 | 蜜桃粉底 | 柔和，轻甜 |
| 科幻 | #060a0c | 冷青底 | 高对比，锐利 |

截至 2026-05-27，外观主题已覆盖完整 accent token；新增或替换主题色时需要同步更新 `src/lib/theme-options.ts` 与 `src/app/globals.css`，并通过主题 token 与 WCAG AA 对比度测试。

## 排版

### 字体栈

```css
--font-sans: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Cascadia Code', monospace;
```

### 字号梯度

| 用途 | 大小 | 字重 | 行高 | 字距 |
|------|------|------|------|------|
| Hero 标题 | 48-64px | 800 | 1.1 | -0.03em |
| 页面标题 | 32-36px | 700 | 1.2 | -0.02em |
| 区块标题 | 20-24px | 600 | 1.3 | -0.01em |
| 卡片标题 | 16-18px | 600 | 1.4 | 0 |
| 正文 | 14-16px | 400 | 1.6 | 0 |
| 辅助文字 | 12-13px | 400 | 1.5 | 0.01em |
| 数据/集数 | 14px | 500 | 1 | tabular-nums |

## 质感层

### 玻璃拟态

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.glass-panel-elevated {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

### Noise Texture

```css
.noise::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url('/noise.svg');
  opacity: 0.025;
  pointer-events: none;
}
```

### 精制微光（允许的发光效果）

```css
/* 封面色低透明度 halo */
.accent-halo {
  box-shadow: 0 0 40px rgba(var(--accent-rgb), 0.15);
}

/* 卡片 hover 边框微亮 */
.card:hover {
  border-color: rgba(var(--accent-rgb), 0.2);
}

/* Hero 海报边缘柔光外溢 */
.hero-glow {
  background: radial-gradient(
    ellipse at 30% 50%,
    rgba(var(--accent-rgb), 0.08) 0%,
    transparent 70%
  );
}
```

## 间距系统

基础单位：4px

| Token | 值 | 用途 |
|-------|-----|------|
| space-1 | 4px | 图标与文字间距 |
| space-2 | 8px | 组件内部间距 |
| space-3 | 12px | 紧凑列表项间距 |
| space-4 | 16px | 卡片内部 padding |
| space-6 | 24px | 区块间距 |
| space-8 | 32px | 页面区域间距 |
| space-12 | 48px | 大区块分隔 |
| space-16 | 64px | 页面顶部/底部留白 |

## 圆角

| 用途 | 值 |
|------|-----|
| 按钮/徽标 | 6px |
| 卡片 | 8px |
| 弹窗/面板 | 12px |
| 最大值 | 12px（禁止更大） |

## 阴影

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
--shadow-md: 0 8px 32px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.4);
```

## 动效规范

### Transitions.dev 基线

- 生产动效统一走 `src/app/globals.css` 的 `t-*` 命名空间、`src/components/ui` 小组件和 `src/hooks` 小 hook，避免业务组件各自散落独立 timing。
- 卡片 hover tilt 仅用于 `BrowseCard`、`AnimeCard`、`CinemaCard` 这类封面卡片，并保留 `.anime-card-glow` 与 `useCardGlow` 的 orbit 基线。
- Radix Dropdown / Dialog / Command 和播放器侧栏使用同一组开合质感；修改时同步检查 scroll lock、右侧黑缝和横向抖动。
- 标题 reveal 不改变宿主 display。`t-stagger-line` 不能覆盖 flex 标题行，否则左侧图标会错位。
- `t-badge` 用固定 `16px` inline-flex 承载通知数字和 dot，避免被按钮行高拉偏。
- 长等待文案可使用 `ShimmerText`，范围控制在“正在整理推荐”“加载 RSS 源中”“扫描中”“保存中”等明确等待状态。
- 所有新动效必须照顾 `prefers-reduced-motion`，并优先退化为 opacity / transform 的静态状态。

### 基础曲线

```css
--ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
```

### 时长

| 类型 | 时长 |
|------|------|
| 微交互（hover/active） | 150-200ms |
| 状态切换 | 250-300ms |
| 页面过渡 | 400-500ms |
| Hero 轮播 | 600ms |
| Stagger 间隔 | 50ms |

### Motion 代码模式

```tsx
// Stagger container
<motion.div
  initial="hidden"
  animate="visible"
  variants={{
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } }
  }}
>

// Stagger child
<motion.div
  variants={{
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  }}
/>

// Card hover
<motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ duration: 0.2 }} />
```

### 卡片动效基线

- 番剧卡片进入视口时使用 1px conic orbit ring，一次性扫过整张卡片，随后保留 subtle border。
- `.anime-card-glow` 的 DOM 宿主必须是非链接元素，当前基准为 `article`。整卡点击通过卡片内部的绝对定位 overlay link 实现，避免链接子树里的 pseudo-element 丢失 `conic-gradient(from var(--glow-angle))` 运行时角度。
- `/admin/orbit-demo` 是 orbit ring 和复合 hover 的视觉 sandbox。产品页改动需要对照 demo 的 computed style，而不能只对齐 JSX 结构。
- BrowseCard 底部操作浮层使用 `transform: translateY(...)` 做位移，过渡曲线为 `cubic-bezier(0.22, 1, 0.36, 1)`，时长 500ms；透明度可稍短，约 380ms。
- Tailwind CSS 4 的 `translate-*` 会生成独立 transform 属性。使用这类工具类时，`transition-property` 需要包含 `translate`；否则改用内联或 class 里的 `transform` 过渡。

### 弹层锁滚与横向稳定性

- Radix Dialog / Dropdown / Command palette 打开时不能造成页面横向抖动或右侧黑缝。
- 当前基线依赖 `src/app/globals.css` 里的 `html { overflow-y: scroll; scrollbar-gutter: stable; }` 和 `body[data-scroll-locked] { padding-right: 0 !important; margin-right: 0 !important; }`。
- 这组规则用于抵消 react-remove-scroll 给 body 添加的滚动条补偿。后续改 Dialog、Dropdown、全局导航或 body/html 布局时必须保留。

## UI 参考图

所有 Phase 1 页面的视觉参考位于 `docs/design/references/`：

| 文件 | 页面 |
|------|------|
| 首页信息流.png | 首页完整布局 |
| 番剧详情页.png | 番剧详情页 |
| 我的追番页.png | 我的追番列表页 |
| 登录页.png | 登录页 |
| RSS & 下载管理.png | RSS 源管理 + 下载队列 |

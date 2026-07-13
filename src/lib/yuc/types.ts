export type YucSourceKind = "season" | "future" | "special" | "movie";

export interface YucSourceKeyParts {
  sourceKind: YucSourceKind;
  pageId: string;
  stableHash: string;
}

export interface YucProvider {
  /** 长门番堂页面上的区域标签，例如“大陆”“港台”“环大陆”。 */
  label: string;
  /** 从链接域名推断出的服务名；未知服务保留为 null。 */
  service: string | null;
  url: string;
}

export interface YucEntry {
  /** 由来源路径和规范化中日文标题组成，不依赖页面内易变的排序编号。 */
  sourceKey: string;
  sourceKind: YucSourceKind;
  sourceUrl: string;
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  /** 页面原文，例如“7/4~”“2026/9/4上映”。 */
  premiereRaw: string | null;
  /** 可确认的公历日期，格式 YYYY-MM-DD；季度或延期信息不会伪装成精确日期。 */
  premiereDate: string | null;
  /** 与项目 anime.airingDay 一致：0=周日，1=周一，…，6=周六。 */
  weeklyDay: number | null;
  /** 页面上的 24 小时制时间，允许 24:00、25:30 等日本深夜档写法。 */
  weeklyTime: string | null;
  scheduleRaw: string | null;
  totalEpisodes: number | null;
  format: string | null;
  tags: string[];
  staff: string[];
  cast: string[];
  studio: string | null;
  original: string | null;
  officialUrl: string | null;
  pvUrl: string | null;
  providers: YucProvider[];
  seasonYear: number | null;
  seasonMonth: number | null;
}

export interface YucAtomEntry {
  title: string;
  url: string | null;
  id: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  summaryHtml: string | null;
}

export interface YucAtomPage {
  title: string;
  subtitle: string | null;
  sourceUrl: string;
  siteUrl: string | null;
  updatedAt: string | null;
  entries: YucAtomEntry[];
}

export interface YucSeasonParseOptions {
  year: number;
  month: number;
  sourceUrl: string;
}

export interface YucPageParseOptions {
  sourceUrl?: string;
}

export interface ThemeAccentTokens {
  accent: string;
  accentRgb: string;
  accentMuted: string;
  accentSubtle: string;
  accentContrast: string;
}

export interface ThemeOption extends ThemeAccentTokens {
  value: string;
  label: string;
  tone: string;
  bgBase: string;
}

export const THEME_OPTIONS = [
  {
    value: "default",
    label: "琥珀金（默认）",
    tone: "琥珀金",
    bgBase: "#0a0a0b",
    accent: "#d4a853",
    accentRgb: "212 168 83",
    accentMuted: "rgb(212 168 83 / 0.2)",
    accentSubtle: "rgb(212 168 83 / 0.1)",
    accentContrast: "#1a1408",
  },
  {
    value: "trend",
    label: "赤红珊瑚",
    tone: "赤红珊瑚",
    bgBase: "#0c0808",
    accent: "#e4575c",
    accentRgb: "228 87 92",
    accentMuted: "rgb(228 87 92 / 0.2)",
    accentSubtle: "rgb(228 87 92 / 0.1)",
    accentContrast: "#1b0908",
  },
  {
    value: "healing",
    label: "鼠尾草绿",
    tone: "鼠尾草绿",
    bgBase: "#0d0c08",
    accent: "#9dbd7f",
    accentRgb: "157 189 127",
    accentMuted: "rgb(157 189 127 / 0.2)",
    accentSubtle: "rgb(157 189 127 / 0.1)",
    accentContrast: "#081307",
  },
  {
    value: "retro",
    label: "暖紫",
    tone: "暖紫",
    bgBase: "#0c0710",
    accent: "#d184d9",
    accentRgb: "209 132 217",
    accentMuted: "rgb(209 132 217 / 0.2)",
    accentSubtle: "rgb(209 132 217 / 0.1)",
    accentContrast: "#19051a",
  },
  {
    value: "peach",
    label: "蜜桃粉",
    tone: "蜜桃粉",
    bgBase: "#0d0809",
    accent: "#f29aa2",
    accentRgb: "242 154 162",
    accentMuted: "rgb(242 154 162 / 0.2)",
    accentSubtle: "rgb(242 154 162 / 0.1)",
    accentContrast: "#1d080a",
  },
  {
    value: "sci-fi",
    label: "冷青蓝",
    tone: "冷青蓝",
    bgBase: "#060a0c",
    accent: "#5fc9c8",
    accentRgb: "95 201 200",
    accentMuted: "rgb(95 201 200 / 0.2)",
    accentSubtle: "rgb(95 201 200 / 0.1)",
    accentContrast: "#031514",
  },
] as const satisfies readonly ThemeOption[];

export type UserTheme = (typeof THEME_OPTIONS)[number]["value"];

export const DEFAULT_THEME: UserTheme = "default";
export const DEFAULT_THEME_OPTION = THEME_OPTIONS[0];

const VALID_THEMES = new Set<UserTheme>(
  THEME_OPTIONS.map((item) => item.value),
);

export function normalizeUserTheme(value: unknown): UserTheme {
  return typeof value === "string" && VALID_THEMES.has(value as UserTheme)
    ? (value as UserTheme)
    : DEFAULT_THEME;
}

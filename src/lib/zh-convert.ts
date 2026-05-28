/**
 * 简体 ↔ 繁体（台湾正字）转换。
 *
 * 背景：ANi、字幕组、巴哈姆特发布的 release 标题多为繁体（"進擊的巨人 第四季"），
 * 而追番库里的番名常是简体（"进击的巨人 第四季"），导致 RSS 关键词匹配失效。
 *
 * 用法：在生成匹配候选词时调用 `expandZhVariants(s)`，得到原文 + 简体 + 繁体的去重数组。
 * 转换器是惰性初始化的单例（opencc-js 的字典构建有一定开销）。
 */

import { Converter } from "opencc-js";

let _cn2tw: ((s: string) => string) | null = null;
let _tw2cn: ((s: string) => string) | null = null;

function cn2tw(): (s: string) => string {
  if (!_cn2tw) _cn2tw = Converter({ from: "cn", to: "tw" });
  return _cn2tw;
}

function tw2cn(): (s: string) => string {
  if (!_tw2cn) _tw2cn = Converter({ from: "tw", to: "cn" });
  return _tw2cn;
}

/** 简体 → 台湾正字繁体。非字符串安全返回原值。 */
export function toTrad(s: string): string {
  if (!s) return s;
  try {
    return cn2tw()(s);
  } catch {
    return s;
  }
}

/** 繁体 → 简体（大陆规范）。非字符串安全返回原值。 */
export function toSimp(s: string): string {
  if (!s) return s;
  try {
    return tw2cn()(s);
  } catch {
    return s;
  }
}

/**
 * 返回原文 + 繁体 + 简体 的去重数组。
 * 输入只有 ASCII / 日文假名时三者相同，返回长度 1。
 * 空串返回空数组。
 */
export function expandZhVariants(s: string | null | undefined): string[] {
  if (!s) return [];
  const t = s.trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  out.add(toTrad(t));
  out.add(toSimp(t));
  return [...out];
}

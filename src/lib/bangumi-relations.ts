import type { BgmRelatedSubject } from "@/lib/bangumi";
import { selectBangumiImage } from "@/lib/bangumi-credits";

export interface RelatedResourceView {
  id: number;
  href: string;
  external: boolean;
  title: string;
  relation: string;
  kind: string;
  imageUrl: string | null;
}

const KIND_PRIORITY = new Map<string, number>([
  ["系列动画", 0],
  ["剧场版", 1],
  ["电台", 2],
  ["现场 / 舞台", 3],
  ["音乐", 4],
  ["书籍", 5],
  ["游戏", 6],
  ["联动动画", 7],
  ["相关作品", 8],
]);

export function toRelatedResourceView(
  subject: BgmRelatedSubject,
): RelatedResourceView {
  return {
    id: subject.id,
    href:
      subject.type === 2
        ? `/anime/bgm/${subject.id}`
        : `https://bangumi.tv/subject/${subject.id}`,
    external: subject.type !== 2,
    title: subject.name_cn || subject.name,
    relation: subject.relation || getDefaultRelation(subject.type),
    kind: getRelatedResourceKind(subject),
    imageUrl: selectBangumiImage(subject.images),
  };
}

export function selectRelatedResourceViews(
  subjects: BgmRelatedSubject[],
  currentBangumiId: number,
  limit = 8,
): RelatedResourceView[] {
  return subjects
    .filter((subject) => subject.id !== currentBangumiId)
    .map(toRelatedResourceView)
    .sort(compareRelatedResourceViews)
    .slice(0, limit);
}

export function getRelatedResourcesHint(items: RelatedResourceView[]): string {
  if (items.some((item) => item.kind === "剧场版")) {
    return "还想看剧场版？看这里。";
  }
  if (items.some((item) => item.kind === "系列动画")) {
    return "前作、续作和同系列都在这里。";
  }
  if (items.some((item) => item.kind === "电台")) {
    return "电台、广播和衍生活动也整理在这里。";
  }
  if (items.some((item) => item.kind === "现场 / 舞台")) {
    return "Live、舞台和线下企划也可以从这里跳转。";
  }
  return "同系列动画、音乐和衍生资源在这里。";
}

function compareRelatedResourceViews(
  a: RelatedResourceView,
  b: RelatedResourceView,
): number {
  const priority =
    (KIND_PRIORITY.get(a.kind) ?? 99) - (KIND_PRIORITY.get(b.kind) ?? 99);
  if (priority !== 0) return priority;
  const relation = a.relation.localeCompare(b.relation, "zh-CN");
  if (relation !== 0) return relation;
  return a.id - b.id;
}

function getRelatedResourceKind(subject: BgmRelatedSubject): string {
  const title = `${subject.name_cn ?? ""} ${subject.name}`;
  const relation = subject.relation ?? "";
  const text = `${title} ${relation}`.toLowerCase();

  if (subject.type === 2) {
    if (/剧场|劇場|映画|movie|总集篇|總集篇/.test(text)) return "剧场版";
    if (/联动|聯動|collab/.test(text)) return "联动动画";
    return "系列动画";
  }
  if (/ラジオ|ラジ|radio|电台|電台|广播|廣播/.test(text)) return "电台";
  if (subject.type === 6) return "现场 / 舞台";
  if (subject.type === 3) return "音乐";
  if (subject.type === 1) return "书籍";
  if (subject.type === 4) return "游戏";
  return "相关作品";
}

function getDefaultRelation(type: number): string {
  if (type === 2) return "动画";
  if (type === 3) return "音乐";
  if (type === 1) return "书籍";
  if (type === 4) return "游戏";
  if (type === 6) return "三次元";
  return "关联";
}

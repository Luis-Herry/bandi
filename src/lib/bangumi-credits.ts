import type {
  BgmImages,
  BgmPersonSubject,
  BgmRelatedCharacter,
  BgmRelatedPerson,
} from "@/lib/bangumi";

export interface CharacterCardView {
  id: number;
  href: string;
  name: string;
  role: string;
  imageUrl: string | null;
  actorName: string | null;
  actorHref: string | null;
}

export interface StaffCardView {
  id: number;
  href: string;
  name: string;
  role: string;
  imageUrl: string | null;
}

export interface PersonWorkView {
  id: number;
  href: string;
  title: string;
  role: string;
  imageUrl: string | null;
}

export function selectBangumiImage(images?: BgmImages | null): string | null {
  return (
    images?.large ??
    images?.common ??
    images?.medium ??
    images?.grid ??
    images?.small ??
    null
  );
}

export function toCharacterCardView(
  character: BgmRelatedCharacter,
): CharacterCardView {
  const actor = character.actors?.[0] ?? null;
  return {
    id: character.id,
    href: `/character/${character.id}`,
    name: character.name,
    role: character.relation || "角色",
    imageUrl: selectBangumiImage(character.images),
    actorName: actor?.name ?? null,
    actorHref: actor ? `/staff/${actor.id}` : null,
  };
}

export function toStaffCardView(person: BgmRelatedPerson): StaffCardView {
  return {
    id: person.id,
    href: `/staff/${person.id}`,
    name: person.name,
    role: person.relation || person.career?.[0] || "制作人员",
    imageUrl: selectBangumiImage(person.images),
  };
}

export function toPersonWorkView(subject: BgmPersonSubject): PersonWorkView {
  return {
    id: subject.id,
    href: subject.type === 2 ? `/anime/bgm/${subject.id}` : `https://bangumi.tv/subject/${subject.id}`,
    title: subject.name_cn || subject.name,
    role: subject.staff || subject.eps || "参与作品",
    imageUrl: subject.image ?? null,
  };
}

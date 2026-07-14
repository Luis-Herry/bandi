import { NextResponse } from "next/server";
import { getAnimeById } from "@/db/queries/anime";
import { getSubjectCharacters, getSubjectPersons } from "@/lib/bangumi";
import {
  toCharacterCardView,
  toStaffCardView,
} from "@/lib/bangumi-credits";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STAFF_PRIORITY = [
  "导演",
  "监督",
  "系列构成",
  "脚本",
  "人物设定",
  "角色设计",
  "音乐",
  "动画制作",
  "制作",
  "原作",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const type = new URL(req.url).searchParams.get("type");
  if (type !== "characters" && type !== "staff") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const anime = getAnimeById(animeId);
  if (!anime) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!anime.bangumiId) {
    return NextResponse.json({ items: [] });
  }

  if (type === "characters") {
    const items = (await getSubjectCharacters(anime.bangumiId))
      .map(toCharacterCardView)
      .slice(0, 12);
    return NextResponse.json({ items });
  }

  const items = (await getSubjectPersons(anime.bangumiId))
    .map(toStaffCardView)
    .sort((a, b) => staffPriority(a.role) - staffPriority(b.role))
    .slice(0, 16);
  return NextResponse.json({ items });
}

function staffPriority(role: string) {
  const index = STAFF_PRIORITY.findIndex((keyword) => role.includes(keyword));
  return index === -1 ? STAFF_PRIORITY.length : index;
}

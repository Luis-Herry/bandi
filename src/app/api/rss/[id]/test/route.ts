import { NextResponse } from "next/server";
import { db } from "@/db";
import { rssSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchRss } from "@/lib/rss";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const row = db
    .select()
    .from(rssSources)
    .where(eq(rssSources.id, rowId))
    .get();
  if (!row)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const items = await fetchRss(row.url);
  db.update(rssSources)
    .set({ lastCheckedAt: new Date() })
    .where(eq(rssSources.id, rowId))
    .run();
  return NextResponse.json({
    ok: true,
    itemCount: items.length,
    sample: items.slice(0, 3).map((i) => ({
      title: i.title,
      hasMagnet: !!i.magnet,
      pubDate: i.pubDate,
    })),
  });
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { rssSources, type RssFilters } from "@/db/schema";

export const dynamic = "force-dynamic";

interface RssBody {
  name?: string;
  url?: string;
  filters?: RssFilters;
  isActive?: boolean;
}

export async function GET() {
  const rows = db.select().from(rssSources).all();
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RssBody;
  if (!body.name || !body.url) {
    return NextResponse.json(
      { error: "name and url required" },
      { status: 400 },
    );
  }
  const inserted = db
    .insert(rssSources)
    .values({
      name: body.name,
      url: body.url,
      filters: body.filters ?? {},
      isActive: body.isActive ?? true,
    })
    .returning({ id: rssSources.id })
    .get();
  return NextResponse.json({ id: inserted.id, created: true });
}

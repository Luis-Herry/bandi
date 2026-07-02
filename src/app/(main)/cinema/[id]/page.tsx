import { notFound, redirect } from "next/navigation";
import { CinemaDetail } from "../../anime/[id]/CinemaDetail";
import { getAnimeDetail } from "@/lib/db-helpers/library";
import { getCurrentUser } from "@/lib/session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: "影视详情",
};

export default async function CinemaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const detail = getAnimeDetail(animeId, user.id);
  if (!detail || detail.anime.mediaType === "anime") notFound();

  return <CinemaDetail detail={detail} />;
}

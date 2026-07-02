import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getCinemaWatchlist } from "@/lib/db-helpers/cinema";
import { CinemaLibraryClient } from "./CinemaLibraryClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "影视库",
};

export default async function CinemaLibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = getCinemaWatchlist(user.id);

  return <CinemaLibraryClient items={items} />;
}

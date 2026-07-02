import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getAnimeLocalLibrary } from "@/lib/db-helpers/library";
import { LocalLibraryClient } from "./LocalLibraryClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "本地库",
};

export default async function LocalLibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = getAnimeLocalLibrary(user.id);

  return <LocalLibraryClient items={items} />;
}

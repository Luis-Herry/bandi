import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { DownloadsAdminClient } from "./Client";

export const dynamic = "force-dynamic";

export default async function DownloadsAdminPage() {
  const user = await getCurrentUser();
  const canOpenLocalDirectory =
    process.env.ANIME_LOCAL_SERVER_APP !== "1" || user?.isLocalHost === true;

  return (
    <Suspense>
      <DownloadsAdminClient canOpenLocalDirectory={canOpenLocalDirectory} />
    </Suspense>
  );
}

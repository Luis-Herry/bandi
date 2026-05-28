import { Suspense } from "react";
import { DownloadsAdminClient } from "./Client";

export const dynamic = "force-dynamic";

export default function DownloadsAdminPage() {
  return (
    <Suspense>
      <DownloadsAdminClient />
    </Suspense>
  );
}

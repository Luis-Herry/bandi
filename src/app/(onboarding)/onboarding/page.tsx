import { redirect } from "next/navigation";
import { DesktopOnboarding } from "@/components/features/DesktopOnboarding";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "开始使用" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (
    process.env.ANIME_DESKTOP_APP !== "1" &&
    process.env.ANIME_LOCAL_SERVER_APP !== "1"
  ) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/onboarding");
  return <DesktopOnboarding />;
}

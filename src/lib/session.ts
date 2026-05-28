/**
 * Session helper. Resolves the current user from the NextAuth session.
 * Returns null if not logged in — pages should `redirect("/login")` and
 * API routes should 401.
 */

import { auth } from "@/auth";

export interface CurrentUser {
  id: string;
  username: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const username = session?.user?.username ?? session?.user?.name;
  if (typeof id === "string" && id) {
    return { id, username: username ?? "user" };
  }
  return null;
}

/** Throwing variant for routes that strictly require a user. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Response("unauthorized", { status: 401 });
  return u;
}

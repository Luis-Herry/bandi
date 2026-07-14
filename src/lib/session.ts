/**
 * Session helper. Resolves the current user from the NextAuth session.
 * Returns null if not logged in — pages should `redirect("/login")` and
 * API routes should 401.
 */

import { auth } from "@/auth";

export interface CurrentUser {
  id: string;
  username: string;
  isLocalHost: boolean;
  sessionDeviceKey: string;
}

export interface CurrentSessionIdentity {
  ownerUserId: string;
  sessionDeviceKey: string;
}

/**
 * Stable server-side identity for local media tasks. The digest prevents the
 * paired device id (and any future session identifier) from entering task
 * state, responses, or logs in its original form.
 */
export function getCurrentSessionIdentity(
  user: Pick<CurrentUser, "id" | "sessionDeviceKey">,
): CurrentSessionIdentity {
  return {
    ownerUserId: user.id,
    sessionDeviceKey: user.sessionDeviceKey,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const username = session?.user?.username ?? session?.user?.name;
  const sessionDeviceKey = session?.user?.sessionDeviceKey;
  if (
    typeof id === "string" &&
    id &&
    session.user.localSessionValid !== false &&
    typeof sessionDeviceKey === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(sessionDeviceKey)
  ) {
    return {
      id,
      username: username ?? "user",
      isLocalHost: session.user.isLocalHost === true,
      sessionDeviceKey,
    };
  }
  return null;
}

/** Throwing variant for routes that strictly require a user. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Response("unauthorized", { status: 401 });
  return u;
}

export async function requireRouteUser(): Promise<CurrentUser | Response> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

/**
 * macOS Local Web keeps filesystem and launcher settings on the host Mac.
 * Windows Desktop and the legacy password-authenticated web runtime retain the
 * existing single-owner behavior.
 */
export async function requireLocalHostRouteUser(): Promise<
  CurrentUser | Response
> {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  if (
    process.env.ANIME_LOCAL_SERVER_APP === "1" &&
    !user.isLocalHost
  ) {
    return new Response("host_session_required", { status: 403 });
  }
  return user;
}

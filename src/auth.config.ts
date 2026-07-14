/**
 * Edge-safe NextAuth config. NO database / Node imports — this is bundled
 * into the middleware which runs on the Edge runtime.
 *
 * `auth.ts` extends this with the Credentials provider that hits SQLite.
 */
import type { NextAuthConfig } from "next-auth";

export interface LocalSessionTokenClaims {
  uid?: string;
  localHost?: boolean;
  localDeviceId?: string;
  localRevision?: number;
  localCheckedAt?: number;
  localSessionValid?: boolean;
}

export async function createSessionDeviceKey({
  userId,
  isLocalHost,
  localDeviceId,
}: {
  userId: string;
  isLocalHost: boolean;
  localDeviceId?: string;
}): Promise<string> {
  const identity = isLocalHost
    ? `host:${userId}`
    : localDeviceId
      ? `paired:${userId}:${localDeviceId}`
      : `web-owner:${userId}`;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)),
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function revalidateLocalDeviceToken<
  T extends LocalSessionTokenClaims,
>(
  token: T,
  options: {
    enabled: boolean;
    now: number;
    recheckMs: number;
    isDeviceActive: (deviceId: string, revision: number) => Promise<boolean>;
  },
): Promise<T> {
  if (
    !options.enabled ||
    !token.localDeviceId ||
    typeof token.localRevision !== "number"
  ) {
    return token;
  }

  const lastCheckedAt = Number(token.localCheckedAt || 0);
  if (options.now - lastCheckedAt < options.recheckMs) return token;

  token.localCheckedAt = options.now;
  token.localSessionValid = await options
    .isDeviceActive(token.localDeviceId, token.localRevision)
    .catch(() => false);
  if (!token.localSessionValid) token.uid = undefined;
  return token;
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [], // populated in src/auth.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.username = user.name ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.username = token.username ?? "";
        session.user.name = token.username ?? session.user.name ?? "";
      }
      session.user.isLocalHost = token.localHost === true;
      session.user.sessionDeviceKey = token.uid
        ? await createSessionDeviceKey({
            userId: token.uid,
            isLocalHost: token.localHost === true,
            localDeviceId: token.localDeviceId,
          })
        : undefined;
      session.user.localSessionValid = token.localSessionValid !== false;
      return session;
    },
  },
};

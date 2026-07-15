/**
 * NextAuth v5 configuration.
 *
 * - Windows Desktop: one-time local session token.
 * - macOS/iOS: local host bootstrap or explicit device pairing.
 * - Local web preview: loopback-only silent session; no password form.
 * - JWT session strategy (keeps everything in a signed cookie, no extra table).
 */

/**
 * Full NextAuth setup, server-only. Imports `auth.config.ts` (edge-safe)
 * and adds the DB-backed providers for the active runtime.
 *
 * The middleware imports `auth.config.ts` directly so it doesn't drag
 * better-sqlite3 into the Edge bundle.
 */
import NextAuth, { type DefaultSession, type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  authConfig,
  createSessionDeviceKey,
  revalidateLocalDeviceToken,
} from "@/auth.config";
import {
  authorizeLocalHost,
  isLocalDeviceActive,
  pairLocalDevice,
} from "@/lib/local-server-control";
import { isLoopbackSessionRequest } from "@/lib/loopback-session";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      isLocalHost?: boolean;
      sessionDeviceKey?: string;
      localSessionValid?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    localHost?: boolean;
    localDeviceId?: string;
    localRevision?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    username?: string;
    localHost?: boolean;
    localDeviceId?: string;
    localRevision?: number;
    localCheckedAt?: number;
    localSessionValid?: boolean;
  }
}

function findUser(username: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
}

const isDesktopApp = process.env.ANIME_DESKTOP_APP === "1";
const isLocalServerApp = process.env.ANIME_LOCAL_SERVER_APP === "1";
const isLoopbackSessionApp = process.env.ANIME_LOOPBACK_SESSION === "1";
const localRecheckMs = Math.max(
  5000,
  Number(process.env.LOCAL_SESSION_RECHECK_MS || 30000),
);

function hasValidDesktopToken(request: Request) {
  if (!isDesktopApp) return false;
  const expected = process.env.DESKTOP_SESSION_TOKEN ?? "";
  const received = request.headers.get("x-bandi-desktop-token") ?? "";
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    ...(isLoopbackSessionApp
      ? [
          Credentials({
            id: "loopback-session",
            name: "Bandi Local Preview",
            credentials: {},
            async authorize(_raw, request) {
              if (!isLoopbackSessionRequest(request)) return null;
              const preferredUsername =
                process.env.DESKTOP_BOOTSTRAP_USER?.trim() || "admin";
              const row =
                findUser(preferredUsername) ??
                db
                  .select({ id: users.id, username: users.username })
                  .from(users)
                  .limit(1)
                  .get();
              if (!row) return null;
              return {
                id: row.id,
                name: row.username,
                localHost: true,
              };
            },
          }),
        ]
      : []),
    ...(isDesktopApp
      ? [
          Credentials({
            id: "desktop-session",
            name: "Bandi Desktop",
            credentials: {},
            async authorize(_raw, request) {
              if (!hasValidDesktopToken(request)) return null;
              const username =
                process.env.DESKTOP_BOOTSTRAP_USER?.trim() || "admin";
              const row = findUser(username);
              if (!row) return null;
              return { id: row.id, name: row.username };
            },
          }),
        ]
      : []),
    ...(isLocalServerApp
      ? [
          Credentials({
            id: "local-session",
            name: "Bandi Local Host",
            credentials: {
              bootstrapToken: { label: "bootstrapToken", type: "password" },
            },
            async authorize(raw) {
              const bootstrapToken =
                typeof raw?.bootstrapToken === "string"
                  ? raw.bootstrapToken.trim()
                  : "";
              if (!bootstrapToken) return null;
              const accepted = await authorizeLocalHost(bootstrapToken);
              if (!accepted.ok) return null;
              const username =
                process.env.LOCAL_SERVER_BOOTSTRAP_USER?.trim() || "admin";
              const row = findUser(username);
              if (!row) return null;
              return { id: row.id, name: row.username, localHost: true };
            },
          }),
          Credentials({
            id: "local-pair",
            name: "Bandi LAN Pairing",
            credentials: {
              pairingCode: { label: "pairingCode", type: "text" },
              deviceName: { label: "deviceName", type: "text" },
            },
            async authorize(raw) {
              const code =
                typeof raw?.pairingCode === "string" ? raw.pairingCode.trim() : "";
              const deviceName =
                typeof raw?.deviceName === "string" ? raw.deviceName.trim() : "";
              const paired = await pairLocalDevice(code, deviceName);
              if (!paired.ok || !paired.device) return null;
              const username =
                process.env.LOCAL_SERVER_BOOTSTRAP_USER?.trim() || "admin";
              const row = findUser(username);
              if (!row) return null;
              return {
                id: row.id,
                name: row.username,
                localDeviceId: paired.device.id,
                localRevision: paired.device.revision,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const localUser = user as User;
        token.uid = user.id as string;
        token.username = user.name ?? undefined;
        token.localHost = localUser.localHost === true;
        token.localDeviceId = localUser.localDeviceId;
        token.localRevision = localUser.localRevision;
        token.localCheckedAt = Date.now();
        token.localSessionValid = true;
      }
      await revalidateLocalDeviceToken(token, {
        enabled: isLocalServerApp,
        now: Date.now(),
        recheckMs: localRecheckMs,
        isDeviceActive: isLocalDeviceActive,
      });
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
});

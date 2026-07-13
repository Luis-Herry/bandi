/**
 * NextAuth v5 configuration.
 *
 * - Web mode: Credentials provider (username + password against `users` table).
 * - Desktop mode: one-time local session token only; password login is omitted.
 * - JWT session strategy (keeps everything in a signed cookie, no extra table).
 * - `signIn('credentials', ...)` returns `{ error, ok }`; the form catches that.
 */

/**
 * Full NextAuth setup, server-only. Imports `auth.config.ts` (edge-safe)
 * and adds the DB-backed providers for the active runtime.
 *
 * The middleware imports `auth.config.ts` directly so it doesn't drag
 * better-sqlite3 / bcryptjs into the Edge bundle.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authConfig } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    username?: string;
  }
}

function findUser(username: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
}

const isDesktopApp = process.env.ANIME_DESKTOP_APP === "1";

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
    ...(!isDesktopApp
      ? [
          Credentials({
            name: "credentials",
            credentials: {
              username: { label: "用户名", type: "text" },
              password: { label: "密码", type: "password" },
            },
            async authorize(raw) {
              const username =
                typeof raw?.username === "string" ? raw.username.trim() : "";
              const password =
                typeof raw?.password === "string" ? raw.password : "";
              if (!username || !password) return null;

              const row = findUser(username);
              if (!row) return null;

              const ok = await bcrypt.compare(password, row.passwordHash);
              if (!ok) return null;

              return {
                id: row.id,
                name: row.username,
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
  ],
});

/**
 * NextAuth v5 configuration.
 *
 * - Credentials provider (username + password against `users` table).
 * - JWT session strategy (keeps everything in a signed cookie, no extra table).
 * - `signIn('credentials', ...)` returns `{ error, ok }`; the form catches that.
 */

/**
 * Full NextAuth setup, server-only. Imports `auth.config.ts` (edge-safe)
 * and adds the DB-backed Credentials provider.
 *
 * The middleware imports `auth.config.ts` directly so it doesn't drag
 * better-sqlite3 / bcryptjs into the Edge bundle.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
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

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
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

        const row = db
          .select({
            id: users.id,
            username: users.username,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(eq(users.username, username))
          .get();
        if (!row) return null;

        const ok = await bcrypt.compare(password, row.passwordHash);
        if (!ok) return null;

        return {
          id: row.id,
          name: row.username,
        };
      },
    }),
  ],
});

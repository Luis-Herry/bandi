/**
 * Edge-safe NextAuth config. NO database / Node imports — this is bundled
 * into the middleware which runs on the Edge runtime.
 *
 * `auth.ts` extends this with the Credentials provider that hits SQLite.
 */
import type { NextAuthConfig } from "next-auth";

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
      return session;
    },
  },
};

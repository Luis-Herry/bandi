/**
 * Auth middleware. Forces login for every (main) page, lets the login page
 * and the API surface through. Matcher excludes static assets so noise.svg
 * etc. are never gated.
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe auth instance built only from the shared config (no DB import)
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>(["/login"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // login page: if already logged in, kick to home
  if (PUBLIC_PATHS.has(pathname)) {
    if (isLoggedIn) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // everything else inside the (main) tree requires auth
  if (!isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match everything except: Next internals, static files, favicon, noise asset, auth endpoints
    "/((?!_next/|api/auth|favicon.ico|noise.svg|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.mp4$).*)",
  ],
};

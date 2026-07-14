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
  const isLoggedIn = Boolean(
    req.auth?.user?.id && req.auth.user.localSessionValid !== false,
  );

  // 公开图片代理（仅白名单 DMM，非开放代理）：不鉴权、不重定向，供 <img> 直接加载
  if (pathname === "/api/img") {
    return NextResponse.next();
  }

  // login page: if already logged in, kick to home
  if (PUBLIC_PATHS.has(pathname)) {
    if (process.env.ANIME_LOCAL_SERVER_APP === "1") {
      return NextResponse.next();
    }
    if (isLoggedIn) {
      const url = req.nextUrl.clone();
      const from = req.nextUrl.searchParams.get("from");
      url.pathname = from && from.startsWith("/") ? from : "/";
      url.search = "";
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

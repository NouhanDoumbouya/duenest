import { NextResponse, type NextRequest } from "next/server";

// Server-side route protection for authenticated areas.
//
// This is the hard gate that runs before any dashboard/founder page renders.
// It checks for the presence of an auth cookie — it does NOT validate the token
// (the backend does that on every API call) and it does NOT check founder role
// (the founder layout + backend enforce that). It only keeps logged-out users
// out of authenticated shells and bounces logged-in users away from auth pages.
//
// Requirement: the auth cookies must be visible to this middleware, i.e. the
// frontend and backend share a registrable domain (dev: both on "localhost";
// prod: e.g. app./api.certanest.com with AUTH_COOKIE_DOMAIN=.certanest.com). In a
// split-domain setup the cookies aren't visible here; protection then relies on
// the client layout + backend (see docs/AUTH.md).

const ACCESS_COOKIE =
  process.env.NEXT_PUBLIC_ACCESS_COOKIE_NAME ?? "duenest_access";
const REFRESH_COOKIE =
  process.env.NEXT_PUBLIC_REFRESH_COOKIE_NAME ?? "duenest_refresh";

// Split-domain (cross-origin) deployment: when the API base URL is an absolute
// cross-origin URL (e.g. Vercel frontend + Railway backend), the auth lives in
// a Bearer token in the browser's localStorage, NOT in a cookie this middleware
// can read. Cookies set by the backend domain are invisible here, so the cookie
// gate below would wrongly redirect every authenticated /dashboard hit back to
// /login. In that mode we skip the server gate entirely and let the client
// dashboard layout (Bearer token + /users/me/) enforce auth. Same-origin
// deployments keep the server cookie gate.
const SPLIT_DOMAIN_AUTH = /^https?:\/\//i.test(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
);

function hasSession(request: NextRequest): boolean {
  return (
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE)
  );
}

export function proxy(request: NextRequest) {
  // Cross-origin/Bearer deployment: the cookie gate cannot see the session, so
  // do not block — the client layout protects authenticated routes.
  if (SPLIT_DOMAIN_AUTH) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const authed = hasSession(request);

  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/founder");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isProtected && !authed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && authed) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Only run on authenticated shells and the auth pages. All public routes
  // (landing, pricing, share/[token], emergency/[token], rooms/[token], etc.)
  // are intentionally excluded and remain reachable without a session.
  matcher: ["/dashboard/:path*", "/founder/:path*", "/login", "/register"],
};

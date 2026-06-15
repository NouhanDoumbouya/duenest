import type { NextConfig } from "next";

// Proxy the API through the frontend origin so auth cookies are first-party.
//
// With cookie-based auth, the browser and the API must look like the SAME origin
// to the browser; otherwise the HttpOnly auth cookies are stored for the backend
// host and are invisible to Next's proxy/server (causing a /dashboard -> /login
// redirect loop). Rewriting /api/v1/* to the Django backend keeps everything on
// one origin — works whether you open the app via localhost, 127.0.0.1, or a LAN
// IP. Set NEXT_PUBLIC_API_BASE_URL=/api/v1 so the client calls this same origin.
const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // DueNest's API requires trailing slashes (Django APPEND_SLASH). Without this,
  // Next 308-redirects "/api/v1/x/" -> "/api/v1/x", which then fights Django's
  // slash handling and the proxied request never resolves. Skipping the redirect
  // lets the rewrite forward the trailing-slash URL to Django as-is.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      // Preserve the trailing slash that DueNest's API requires. The plain
      // `:path*` capture drops the final "/", which makes Django (APPEND_SLASH)
      // 301 GETs and 500 POSTs. This slash-suffixed rule keeps it; the fallback
      // handles slash-less paths (e.g. /calendar/export.ics).
      {
        source: "/api/v1/:path*/",
        destination: `${BACKEND_ORIGIN}/api/v1/:path*/`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

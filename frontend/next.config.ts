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

// The Django API sets its own security headers (apps.core.middleware), and Vercel
// only adds HSTS to the frontend — so the Next app itself shipped without the
// rest. These headers are applied to all FRONTEND routes (the `/api/*` proxy is
// excluded below so the backend's headers and blob/document responses are
// untouched). `X-Frame-Options: DENY` is safe: every in-app preview iframe loads
// a `blob:`/`srcDoc` source (no HTTP headers), not a framed page. The
// Permissions-Policy keeps `camera`/`microphone`/`geolocation` for same-origin so
// the Scanner (getUserMedia) and Emergency optional-location keep working.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), bluetooth=()",
  },
  // Reporting API endpoint group that the report-only CSP reports to (modern
  // browsers). Legacy browsers use the `report-uri` directive below instead.
  // Both target /monitoring/csp-report (a side-effect-free logging sink).
  { key: "Reporting-Endpoints", value: 'csp-endpoint="/monitoring/csp-report"' },
  // Report-Only (NON-blocking): a starter Content-Security-Policy so violations
  // are collected (via report-to/report-uri → /monitoring/csp-report) without
  // breaking anything. To ENFORCE it later, Next's bootstrap inline scripts need
  // a nonce (middleware) instead of 'unsafe-inline'.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com",
      "connect-src 'self' https://api.certanest.com https://*.vercel-insights.com https://*.vercel-scripts.com",
      "frame-src 'self' blob:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "report-to csp-endpoint",
      "report-uri /monitoring/csp-report",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Tree-shake large icon packages so only the icons actually used are bundled.
  // `lucide-react` is already optimized by Next by default; `simple-icons`
  // exports thousands of brand icons, so listing it here avoids pulling the
  // whole set into any route that imports a handful of them.
  experimental: {
    optimizePackageImports: ["simple-icons"],
  },
  // CertaNest's API requires trailing slashes (Django APPEND_SLASH). Without this,
  // Next 308-redirects "/api/v1/x/" -> "/api/v1/x", which then fights Django's
  // slash handling and the proxied request never resolves. Skipping the redirect
  // lets the rewrite forward the trailing-slash URL to Django as-is.
  skipTrailingSlashRedirect: true,
  // Apply security headers to every frontend route EXCEPT the `/api/*` proxy,
  // whose responses (JSON + document blobs) are owned by the Django backend.
  async headers() {
    return [
      {
        source: "/((?!api/).*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async rewrites() {
    return [
      // Preserve the trailing slash that CertaNest's API requires. The plain
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

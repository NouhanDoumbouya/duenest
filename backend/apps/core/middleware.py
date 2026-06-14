"""
Security response headers.

Two concerns:

1. Public token routes (Quick Share / Emergency Access / Secure Rooms / public
   organization links) must never be indexed, must not leak the URL (which
   carries the token) via the Referer header, and must not be cached by shared
   proxies/browsers. These headers are applied ALWAYS, in every environment.

2. Baseline hardening headers (CSP, Permissions-Policy, COOP) are applied when
   ``SECURITY_HEADERS_ENABLED`` is true (on in production, off in local dev so
   it never interferes with the dev workflow).

This middleware sets headers only; it never logs request bodies, tokens, or
any sensitive content.
"""

from __future__ import annotations

from django.conf import settings

# API path prefixes whose responses carry token-scoped data.
_PUBLIC_TOKEN_PREFIXES = (
    "/api/v1/share/",
    "/api/v1/quick-share/claim/",
    "/api/v1/public/",
)


def _build_csp() -> str:
    connect_extra = " ".join(getattr(settings, "CSP_CONNECT_EXTRA", []) or [])
    connect_src = ("'self' " + connect_extra).strip()
    return "; ".join(
        [
            "default-src 'self'",
            "script-src 'self'",
            # Inline styles are still used by some server-rendered fragments.
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            f"connect-src {connect_src}",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ]
    )


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.enabled = getattr(settings, "SECURITY_HEADERS_ENABLED", False)
        self.csp = _build_csp() if self.enabled else None

    def __call__(self, request):
        response = self.get_response(request)

        # 1. Always protect public token routes.
        path = request.path or ""
        if any(path.startswith(prefix) for prefix in _PUBLIC_TOKEN_PREFIXES):
            response["X-Robots-Tag"] = "noindex, nofollow"
            response["Referrer-Policy"] = "no-referrer"
            response["Cache-Control"] = "no-store"

        # 2. Baseline hardening headers (production by default).
        if self.enabled:
            response.setdefault("Content-Security-Policy", self.csp)
            response.setdefault(
                "Permissions-Policy",
                "camera=(), microphone=(), geolocation=(), interest-cohort=()",
            )
            response.setdefault("Cross-Origin-Opener-Policy", "same-origin")

        return response

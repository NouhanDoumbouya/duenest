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

import logging
import time

from django.conf import settings

logger = logging.getLogger("duenest.performance")

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


class SlowRequestLogMiddleware:
    """Log requests slower than ``SLOW_REQUEST_MS`` for cheap observability.

    Logs only method, path, status and duration — never query strings, bodies,
    headers, cookies, or tokens (paths under public-token prefixes are reported
    as a redacted label so a token never reaches the logs). Disabled when
    ``SLOW_REQUEST_MS`` <= 0.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.threshold_ms = int(getattr(settings, "SLOW_REQUEST_MS", 0) or 0)
        self.enabled = self.threshold_ms > 0

    def __call__(self, request):
        if not self.enabled:
            return self.get_response(request)
        start = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if elapsed_ms >= self.threshold_ms:
            logger.warning(
                "slow_request method=%s path=%s status=%s duration_ms=%.0f",
                request.method,
                self._safe_path(request.path or ""),
                getattr(response, "status_code", "?"),
                elapsed_ms,
            )
        return response

    @staticmethod
    def _safe_path(path: str) -> str:
        # Token-bearing routes: log the prefix only, never the token segment.
        for prefix in _PUBLIC_TOKEN_PREFIXES:
            if path.startswith(prefix):
                return f"{prefix}<redacted>"
        return path

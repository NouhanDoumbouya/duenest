"""
Cookie-based JWT authentication for CertaNest.

CertaNest authenticates with SimpleJWT. For beta we move the tokens out of
JavaScript-readable storage into **HttpOnly cookies**, while keeping the existing
``Authorization: Bearer`` header path working for backward compatibility and for
server-to-server / test clients.

Security model:
* Access + refresh tokens live in HttpOnly, Secure (prod), SameSite cookies.
* When a request authenticates via the *cookie* (not a header), CSRF is enforced
  (double-submit token) because the browser sends the cookie automatically.
  Header-authenticated requests are not subject to CSRF (no ambient credential).
* SimpleJWT rotation + blacklist behaviour is unchanged; this module only moves
  where the tokens are carried and adds cookie set/clear helpers.

Same-site deployment is assumed (frontend + backend on one registrable domain,
e.g. app./api.certanest.com with AUTH_COOKIE_DOMAIN=.certanest.com; dev: both on
localhost). Cross-site cookies require SameSite=None + Secure + CORS credentials
(see docs/AUTH.md).
"""

from __future__ import annotations

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware, get_token
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


def _cookie_settings() -> dict:
    return {
        "access_name": getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "duenest_access"),
        "refresh_name": getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "duenest_refresh"),
        "secure": getattr(settings, "AUTH_COOKIE_SECURE", False),
        "samesite": getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax"),
        "domain": getattr(settings, "AUTH_COOKIE_DOMAIN", "") or None,
        "path": getattr(settings, "AUTH_COOKIE_PATH", "/"),
    }


def _max_age(key: str) -> int:
    lifetime = settings.SIMPLE_JWT[key]
    return int(lifetime.total_seconds())


def set_auth_cookies(response, access: str | None = None, refresh: str | None = None):
    """Attach access/refresh tokens as HttpOnly cookies on a DRF response."""
    cfg = _cookie_settings()
    common = {
        "secure": cfg["secure"],
        "samesite": cfg["samesite"],
        "domain": cfg["domain"],
        "path": cfg["path"],
        "httponly": True,
    }
    if access is not None:
        response.set_cookie(
            cfg["access_name"], access, max_age=_max_age("ACCESS_TOKEN_LIFETIME"), **common
        )
    if refresh is not None:
        response.set_cookie(
            cfg["refresh_name"], refresh, max_age=_max_age("REFRESH_TOKEN_LIFETIME"), **common
        )
    return response


def clear_auth_cookies(response):
    """Delete the auth cookies (used on logout)."""
    cfg = _cookie_settings()
    for name in (cfg["access_name"], cfg["refresh_name"]):
        response.delete_cookie(name, path=cfg["path"], domain=cfg["domain"])
    return response


def get_refresh_from_cookie(request) -> str | None:
    return request.COOKIES.get(_cookie_settings()["refresh_name"])


def ensure_csrf_cookie(request, response):
    """Set/refresh the CSRF cookie so the SPA can echo it as a header."""
    get_token(request)  # forces CsrfViewMiddleware to send the cookie
    return response


class _CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


def _enforce_csrf(request):
    """Run Django's CSRF check for cookie-authenticated unsafe requests."""
    check = _CSRFCheck(get_response=lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")


SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


class CookieJWTAuthentication(JWTAuthentication):
    """
    Authenticate from the access-token cookie, falling back to the Authorization
    header. CSRF is enforced only when the credential came from the cookie and
    the method is unsafe.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            # Header (Bearer) path — no ambient credential, no CSRF needed.
            return super().authenticate(request)

        raw_token = request.COOKIES.get(_cookie_settings()["access_name"])
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        if request.method not in SAFE_METHODS:
            _enforce_csrf(request)
        return self.get_user(validated_token), validated_token

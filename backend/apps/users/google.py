"""
Google ID token verification helper.

The frontend obtains a Google ID token (a signed JWT) after the user signs in
with Google. It sends that token to our backend. This module's job is to
*verify* that token is genuine and was issued for our application, then return
the trustworthy claims (email, name, etc.) so a view can create or find a user.

We rely on the official `google-auth` library, which:
  - downloads and caches Google's public signing keys,
  - checks the token's signature, expiry, and issuer,
  - confirms the token's audience matches our OAuth client id.
"""

from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token


class GoogleAuthError(Exception):
    """Raised when a Google ID token cannot be verified or trusted."""


def verify_google_id_token(token: str) -> dict:
    """
    Verify a Google ID token and return its claims.

    Raises GoogleAuthError if the token is missing, invalid, issued for a
    different application, or comes from an unexpected issuer.
    """
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        # Misconfiguration: refuse rather than verifying against "no audience".
        raise GoogleAuthError("Google authentication is not configured.")

    if not token:
        raise GoogleAuthError("Missing Google ID token.")

    try:
        # Passing client_id as the audience makes the library reject tokens
        # that were minted for some other Google OAuth application.
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            client_id,
        )
    except ValueError as exc:
        # google-auth raises ValueError for bad signatures, expiry, wrong
        # audience, etc. We translate it into our own error type.
        raise GoogleAuthError("Invalid Google ID token.") from exc

    # Defense in depth: only Google should be the issuer.
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleAuthError("Invalid token issuer.")

    return claims

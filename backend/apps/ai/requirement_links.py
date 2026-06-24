"""
Safe single-URL fetch + readable-text extraction for Requirement Link import.

Fetches ONLY the one user-provided URL — never crawls, never follows links on
the page. Hardened against SSRF: scheme allowlist (http/https only), DNS
resolution with private/loopback/link-local/reserved/multicast IP rejection,
a small manual redirect cap (each hop re-validated), a request timeout, and a
hard response-size cap. Extracts readable text (scripts/styles/nav/footer
stripped) plus short source snippets for citations. No R2, no secrets, and no
raw HTML is persisted by callers — only structured text/snippets.

Known V1 limitation: DNS-rebinding (TOCTOU between the resolution check and the
socket connect) is not fully mitigated; the guard rejects private targets at
resolution time, which covers the common SSRF cases for a user-pasted URL.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from html import unescape
from urllib.parse import urlparse

import requests

ALLOWED_SCHEMES = {"http", "https"}
MAX_REDIRECTS = 3
FETCH_TIMEOUT_SECONDS = 10
MAX_CONTENT_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_TEXT_CHARS = 20_000
MAX_SNIPPETS = 12
MAX_SNIPPET_CHARS = 240
_USER_AGENT = "CertaNest-RequirementImport/1.0 (+https://certanest.com)"

# Words that hint a line carries document/deadline requirements (for snippets).
_SNIPPET_HINTS = re.compile(
    r"\b(document|documents|submit|submission|require|required|requirement|"
    r"deadline|due|passport|transcript|certificate|letter|cv|r[ée]sum[ée]|"
    r"proof|evidence|photo|id|identity|visa|application|upload|attach|fee|"
    r"eligib|reference|recommendation|portfolio|statement)\b",
    re.IGNORECASE,
)

_SCRIPT_STYLE_RE = re.compile(
    r"<(script|style|noscript|template|svg|head)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
_STRIP_BLOCKS_RE = re.compile(
    r"<(nav|footer|header|aside|form)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_WS_RE = re.compile(r"[ \t\f\v]+")
_MULTINEWLINE_RE = re.compile(r"\n{3,}")


class SafeFetchError(Exception):
    """A user-actionable fetch/validation failure. ``code`` maps to friendly copy."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _validate_url(url: str) -> "tuple[str, str]":
    """Validate scheme + resolve host, rejecting private/internal addresses."""
    if not url or len(url) > 2048:
        raise SafeFetchError("invalid_url", "That doesn't look like a valid URL.")
    parsed = urlparse(url.strip())
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise SafeFetchError(
            "unsupported_scheme",
            "Only http and https links are supported.",
        )
    hostname = parsed.hostname
    if not hostname:
        raise SafeFetchError("invalid_url", "That doesn't look like a valid URL.")
    try:
        addr_info = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise SafeFetchError(
            "fetch_error", "We couldn't reach that page. Check the link and try again."
        ) from None
    for *_x, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise SafeFetchError(
                "blocked_address",
                "That link points to a private or internal address and can't be fetched.",
            )
    return parsed.scheme.lower(), hostname


def _read_capped(response: requests.Response) -> str:
    """Read at most MAX_CONTENT_BYTES of the body, then decode to text."""
    declared = response.headers.get("Content-Length")
    if declared and declared.isdigit() and int(declared) > MAX_CONTENT_BYTES:
        raise SafeFetchError("too_large", "That page is too large to read.")
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=16_384):
        total += len(chunk)
        if total > MAX_CONTENT_BYTES:
            raise SafeFetchError("too_large", "That page is too large to read.")
        chunks.append(chunk)
    body = b"".join(chunks)
    encoding = response.encoding or "utf-8"
    try:
        return body.decode(encoding, errors="replace")
    except (LookupError, TypeError):
        return body.decode("utf-8", errors="replace")


def _fetch(url: str) -> "tuple[str, str]":
    """Manual, IP-revalidated redirect loop. Returns ``(final_url, html)``."""
    current = url
    for _hop in range(MAX_REDIRECTS + 1):
        _validate_url(current)  # re-validate every hop (incl. redirect targets)
        try:
            resp = requests.get(
                current,
                timeout=FETCH_TIMEOUT_SECONDS,
                allow_redirects=False,
                stream=True,
                headers={"User-Agent": _USER_AGENT, "Accept": "text/html,*/*"},
            )
        except requests.Timeout:
            raise SafeFetchError("timeout", "That page took too long to respond.") from None
        except requests.RequestException:
            raise SafeFetchError(
                "fetch_error", "We couldn't read this page. Try copying the requirement text manually."
            ) from None

        if resp.is_redirect or resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("Location")
            resp.close()
            if not location:
                raise SafeFetchError("fetch_error", "We couldn't read this page.")
            current = requests.compat.urljoin(current, location)
            continue

        if resp.status_code >= 400:
            resp.close()
            raise SafeFetchError(
                "fetch_error", "We couldn't read this page. Try copying the requirement text manually."
            )

        content_type = (resp.headers.get("Content-Type") or "").lower()
        if content_type and "html" not in content_type and "text" not in content_type:
            resp.close()
            raise SafeFetchError(
                "not_readable", "That link isn't a readable web page. Paste a page with the requirements text."
            )
        try:
            html = _read_capped(resp)
        finally:
            resp.close()
        return current, html

    raise SafeFetchError("too_many_redirects", "That link redirects too many times.")


def _extract_title(html: str) -> str:
    match = _TITLE_RE.search(html)
    if not match:
        return ""
    return _collapse(unescape(_TAG_RE.sub(" ", match.group(1))))[:200]


def _html_to_text(html: str) -> str:
    cleaned = _SCRIPT_STYLE_RE.sub(" ", html)
    cleaned = _STRIP_BLOCKS_RE.sub(" ", cleaned)
    # Turn block boundaries into newlines so list/paragraph structure survives.
    cleaned = re.sub(r"(?i)</(p|div|li|tr|h[1-6]|section|article)>", "\n", cleaned)
    cleaned = re.sub(r"(?i)<br\s*/?>", "\n", cleaned)
    cleaned = _TAG_RE.sub(" ", cleaned)
    cleaned = unescape(cleaned)
    lines = [_collapse(line) for line in cleaned.splitlines()]
    text = "\n".join(line for line in lines if line)
    text = _MULTINEWLINE_RE.sub("\n\n", text)
    return text[:MAX_TEXT_CHARS]


def _collapse(value: str) -> str:
    return _WS_RE.sub(" ", value).strip()


def _build_snippets(text: str) -> list[dict]:
    """Short, requirement-relevant source snippets for citation anchors."""
    snippets: list[dict] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 20 or not _SNIPPET_HINTS.search(line):
            continue
        snippet = line[:MAX_SNIPPET_CHARS]
        key = snippet.lower()
        if key in seen:
            continue
        seen.add(key)
        snippets.append({"id": f"src_{len(snippets) + 1}", "text": snippet})
        if len(snippets) >= MAX_SNIPPETS:
            break
    return snippets


def fetch_requirement_page(url: str) -> dict:
    """
    Safely fetch one URL and return ``{url, title, text, snippets}``.

    Raises :class:`SafeFetchError` (with a ``code`` and friendly ``message``) for
    invalid/unsafe URLs, blocked addresses, timeouts, oversized or unreadable
    pages, or pages with too little readable content.
    """
    final_url, html = _fetch(url)
    title = _extract_title(html)
    text = _html_to_text(html)
    if len(text.strip()) < 200:
        raise SafeFetchError(
            "not_readable",
            "We couldn't find readable requirements on that page. Try copying the text manually.",
        )
    return {
        "url": final_url,
        "title": title,
        "text": text,
        "snippets": _build_snippets(text),
    }

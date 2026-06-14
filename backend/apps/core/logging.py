"""
Defensive log redaction.

A best-effort logging filter that scrubs secrets and sensitive values from log
records before they are emitted, so an accidental log of a header, token, code,
or key does not persist in plaintext. This is a safety net — code should still
avoid logging sensitive data in the first place.
"""

from __future__ import annotations

import logging
import re

_REDACTED = "[REDACTED]"

# Patterns are intentionally broad but anchored to sensitive key names / shapes
# so ordinary log text is not mangled.
_PATTERNS = [
    # Authorization: Bearer <jwt>
    re.compile(r"(?i)(authorization\s*[:=]\s*)(bearer\s+)?[A-Za-z0-9._\-]+"),
    # cookie / set-cookie headers
    re.compile(r"(?i)(set-cookie\s*[:=]\s*)[^\s;]+"),
    # key=value style secrets (access_code, token, password, secret, api key, KEK/DEK)
    re.compile(
        r"(?i)\b(access[_-]?code|token|share[_-]?token|emergency[_-]?token|"
        r"password|passwd|secret|api[_-]?key|authorization|kek|dek|"
        r"wrapped[_-]?dek|x-access-code|x-share-grant)\b"
        r"(\s*[:=]\s*)(\"?)([^\s,&\"]+)"
    ),
]


def redact(text: str) -> str:
    if not text:
        return text
    out = text
    # Header/bearer/cookie patterns -> keep the label, drop the value.
    out = _PATTERNS[0].sub(lambda m: f"{m.group(1)}{_REDACTED}", out)
    out = _PATTERNS[1].sub(lambda m: f"{m.group(1)}{_REDACTED}", out)
    out = _PATTERNS[2].sub(
        lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}{_REDACTED}", out
    )
    return out


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - never break logging
            return True
        redacted = redact(message)
        if redacted != message:
            # Replace with the already-merged, redacted message so the formatter
            # does not re-apply args.
            record.msg = redacted
            record.args = ()
        return True

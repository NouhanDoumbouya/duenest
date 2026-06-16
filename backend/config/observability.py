"""
Lightweight, optional observability wiring.

Everything here is a safe no-op unless explicitly configured, so the app runs
identically in lean/local mode. Sentry is only initialised when a DSN is given
AND the `sentry_sdk` package is installed; a missing package or bad DSN is
logged and swallowed — observability must never take the app down.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("duenest.observability")

_initialised = False


def init_sentry(*, dsn: str, environment: str, traces_sample_rate: float = 0.0) -> bool:
    """Initialise Sentry error reporting if a DSN + the SDK are available.

    Returns True if Sentry was initialised, False otherwise. Never raises.
    """
    global _initialised
    if _initialised or not dsn:
        return _initialised
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
    except Exception:  # noqa: BLE001 - SDK is an optional extra
        logger.info("sentry_sdk not installed; error reporting disabled")
        return False
    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            integrations=[DjangoIntegration()],
            traces_sample_rate=traces_sample_rate,
            # Never send PII (emails, cookies, tokens) to the error tracker.
            send_default_pii=False,
        )
        _initialised = True
        logger.info("sentry initialised environment=%s", environment)
    except Exception:  # noqa: BLE001 - bad DSN etc. must not crash boot
        logger.warning("sentry initialisation failed; continuing without it")
    return _initialised

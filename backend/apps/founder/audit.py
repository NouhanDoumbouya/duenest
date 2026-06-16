"""
Founder/admin action audit logging (SEC-009).

Sensitive founder operations (bulk data export, manual billing grants/revocations)
are recorded so privileged access leaves a trail. This logs only the actor's id,
a coarse action label and non-sensitive target context — never document
contents, tokens, secrets or full data dumps. The global log-redaction filter
(apps.core.logging) is an additional safety net.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("duenest.founder.audit")


def log_founder_action(request, action: str, **context) -> None:
    user = getattr(request, "user", None)
    actor_id = getattr(user, "id", None)
    safe = " ".join(f"{k}={v}" for k, v in context.items() if v is not None)
    logger.info("founder_action action=%s actor_id=%s %s", action, actor_id, safe)

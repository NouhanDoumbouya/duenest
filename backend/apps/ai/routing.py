"""
Plan-aware model routing for CertaNest AI.

Resolves the Claude model a given (user, feature) is allowed to use, so model
access follows the plan — without rewriting the single-model provider wrapper
(``apps.ai.client``). The rules:

  * **Free** users: Haiku only.
  * **Pro** users: Haiku by default; Sonnet only for heavier features and only
    when ``AI_PRO_SONNET_ENABLED`` is turned on.
  * **Opus** is never used for normal Free/Pro AI. It is available only to
    founder/admin users (and only if the operator deliberately set ``AI_MODEL``
    to an Opus-class model), or for system/operator-context calls.
  * **System / unauthenticated** calls (scheduled digests, operator scripts):
    honor the operator-configured ``AI_MODEL`` — these aren't end-user plan usage.

Fails safe: any lookup error resolves to the Haiku tier (the cheapest, safest
model) rather than escalating. Called at the provider chokepoint in
``apps.ai.client.generate`` so it governs every AI call in one place.
"""

from __future__ import annotations

import logging

from django.conf import settings

from .config import DEFAULT_MODEL_HAIKU, DEFAULT_MODEL_SONNET

logger = logging.getLogger(__name__)

# Metering feature names that justify Sonnet for Pro (heavier / multi-document
# reasoning). Still gated by AI_PRO_SONNET_ENABLED; otherwise Pro uses Haiku too.
_SONNET_FEATURES = {
    "multi_document_qa",
    "pack_copilot",
    "document_draft",
    "readiness",
    "share_readiness",
    "bundle_readiness",
    "requirement_link_checklist",
    "long_application_review",
}


def _haiku() -> str:
    return getattr(settings, "AI_MODEL_HAIKU", "") or DEFAULT_MODEL_HAIKU


def _sonnet() -> str:
    return getattr(settings, "AI_MODEL_SONNET", "") or DEFAULT_MODEL_SONNET


def _configured() -> str:
    return getattr(settings, "AI_MODEL", "") or DEFAULT_MODEL_HAIKU


def _is_founder(user) -> bool:
    try:
        from apps.features.flags import is_founder

        return bool(is_founder(user))
    except Exception:  # noqa: BLE001 — fail safe: treat as non-founder
        return False


def _is_pro(user) -> bool:
    try:
        from apps.billing.entitlements import is_pro

        return bool(is_pro(user))
    except Exception:  # noqa: BLE001 — fail safe: treat as Free
        return False


def resolve_allowed_ai_model(user, feature=None, requested_model=None) -> str:
    """
    Return the model ``user`` may use for ``feature`` (never raises).

    ``requested_model`` is honored only for founder/admin and system contexts;
    for normal Free/Pro users it is ignored in favor of the plan-safe tier so a
    caller can never force an out-of-plan (e.g. Opus) model.
    """
    # System / unauthenticated context: operator-configured model, no plan clamp.
    if user is None or not getattr(user, "is_authenticated", False):
        return requested_model or _configured()

    # Founder/admin may use the operator-configured override model (possibly Opus).
    if _is_founder(user):
        return requested_model or _configured()

    # End users are clamped to plan-safe tiers — Opus is never reachable here.
    if (
        _is_pro(user)
        and feature in _SONNET_FEATURES
        and getattr(settings, "AI_PRO_SONNET_ENABLED", False)
    ):
        return _sonnet()
    return _haiku()

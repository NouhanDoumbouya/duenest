"""
Promo / reduction code validation and redemption.

Validation is provider-independent and fully testable. Codes are normalized to
upper-case; all failure reasons are calm, user-facing strings.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from .models import PromoCode, PromoRedemption


@dataclass
class PromoResult:
    valid: bool
    reason: str = ""
    code: PromoCode | None = None
    discount_label: str = ""

    def as_dict(self) -> dict:
        return {
            "valid": self.valid,
            "reason": self.reason,
            "code": self.code.code if self.code else None,
            "promo_type": self.code.promo_type if self.code else None,
            "discount_label": self.discount_label,
        }


def _discount_label(code: PromoCode) -> str:
    if code.percent_off:
        return f"{code.percent_off}% off"
    if code.amount_off:
        # minor units → major; keep simple, no locale formatting.
        return f"{code.currency.upper()} {code.amount_off / 100:.2f} off"
    if code.promo_type == PromoCode.PromoType.TRIAL_EXTENSION and code.trial_extension_days:
        return f"{code.trial_extension_days}-day trial extension"
    if code.promo_type == PromoCode.PromoType.FREE_MONTHS and code.duration_months:
        return f"{code.duration_months} free month(s)"
    if code.promo_type == PromoCode.PromoType.BETA_ACCESS:
        return "Beta access"
    return "Discount applied"


def validate_promo_code(
    raw_code: str,
    user=None,
    plan_key: str | None = None,
    interval: str | None = None,
) -> PromoResult:
    """Validate a promo code for an optional user/plan/interval context."""
    normalized = PromoCode.normalize(raw_code)
    if not normalized:
        return PromoResult(False, "Enter a code.")

    code = PromoCode.objects.filter(code=normalized).first()
    if code is None:
        return PromoResult(False, "This code is not valid.")
    if not code.is_active:
        return PromoResult(False, "This code is not valid.", code)

    now = timezone.now()
    if code.starts_at and now < code.starts_at:
        return PromoResult(False, "This code is not active yet.", code)
    if code.ends_at and now >= code.ends_at:
        return PromoResult(False, "This code has expired.", code)

    if code.applies_to_plans and plan_key and plan_key not in code.applies_to_plans:
        return PromoResult(False, "This code is not valid for this plan.", code)
    if (
        code.applies_to_billing_intervals
        and interval
        and interval not in code.applies_to_billing_intervals
    ):
        return PromoResult(
            False, "This code is not valid for this billing cycle.", code
        )

    if code.max_redemptions is not None and code.redemption_count >= code.max_redemptions:
        return PromoResult(False, "This code has reached its redemption limit.", code)

    if user is not None and getattr(user, "is_authenticated", False):
        used = PromoRedemption.objects.filter(promo_code=code, user=user).count()
        if used >= code.max_redemptions_per_user:
            return PromoResult(False, "This code has already been used.", code)

    return PromoResult(True, "Code applied.", code, _discount_label(code))


def record_redemption(
    code: PromoCode,
    user,
    subscription=None,
    amount_discounted: int | None = None,
    currency: str = "",
    provider_redemption_id: str = "",
) -> PromoRedemption:
    """Persist a redemption and bump the code's redemption counter."""
    redemption = PromoRedemption.objects.create(
        promo_code=code,
        user=user,
        subscription=subscription,
        amount_discounted=amount_discounted,
        currency=currency or (code.currency or ""),
        provider_redemption_id=provider_redemption_id,
    )
    PromoCode.objects.filter(pk=code.pk).update(
        redemption_count=code.redemption_count + 1
    )
    return redemption

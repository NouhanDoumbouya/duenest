from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.documents.plan_usage import compute_plan_usage
from apps.founder.permissions import IsFounderUser

from . import entitlements, promo as promo_service, receipts, services
from .models import (
    BillingEvent,
    InvoiceRecord,
    ManualAccessGrant,
    Plan,
    PromoCode,
    ReceiptSettings,
    UserSubscription,
)
from .providers import BillingError, get_provider_name
from .serializers import (
    BillingEventSerializer,
    CheckoutSerializer,
    InvoiceRecordSerializer,
    ManualAccessGrantSerializer,
    PlanSerializer,
    PromoCodeSerializer,
    PromoValidateSerializer,
    ReceiptSettingsSerializer,
    SubscriberSerializer,
)


def _status_message(status_value: str, sub) -> str:
    S = UserSubscription.Status
    if status_value == S.FREE:
        return "You are on the Free plan."
    if status_value == S.TRIALING:
        return "Your free trial is active."
    if status_value in (S.PAST_DUE, S.GRACE_PERIOD):
        return (
            "We could not process your payment. Your Pro features remain active "
            "during the grace period."
        )
    if status_value == S.FOUNDER:
        return "Your founder access is active."
    if status_value == S.BETA:
        return "Your beta access is active."
    if status_value == S.LIFETIME:
        return "You have lifetime access."
    if status_value == S.MANUAL_PRO:
        return "Your Pro access is active."
    if status_value == S.CANCELED:
        return "Your plan is canceled."
    if sub and sub.cancel_at_period_end and sub.current_period_end:
        return "Your plan is canceled but remains active until the period ends."
    return "Your Pro plan is active."


def _billing_status_payload(user) -> dict:
    plan = entitlements.get_user_plan(user)
    status_value = entitlements.get_user_subscription_status(user)
    sub = entitlements.get_effective_subscription(user)
    grant = entitlements.get_active_manual_grant(user)
    return {
        "plan": plan.key if plan else "free",
        "plan_name": plan.name if plan else "Free",
        "tier": plan.tier if plan else "free",
        "status": status_value,
        "is_pro": entitlements.is_pro(user),
        "is_free": not entitlements.is_pro(user),
        "billing_interval": sub.billing_interval if sub else "none",
        "currency": sub.currency if sub else (plan.currency if plan else "usd"),
        "amount": sub.amount if sub else 0,
        "current_period_end": sub.current_period_end if sub else None,
        "trial_end": sub.trial_end if sub else None,
        "cancel_at_period_end": bool(sub.cancel_at_period_end) if sub else False,
        "grace_period_until": sub.grace_period_until if sub else None,
        "active_promo_code": (
            sub.active_promo_code.code if sub and sub.active_promo_code else None
        ),
        "manual_access": (
            {"active": True, "status": grant.grant_status, "reason": grant.reason}
            if grant
            else None
        ),
        "provider": get_provider_name(),
        "test_mode": settings.BILLING_TEST_MODE,
        "message": _status_message(status_value, sub),
    }


class PlansView(generics.ListAPIView):
    """Public pricing config. No auth — used by the marketing pricing page."""

    permission_classes = [AllowAny]
    serializer_class = PlanSerializer
    pagination_class = None  # pricing is a small fixed list, return it plainly

    def get_queryset(self):
        return (
            Plan.objects.filter(is_active=True, is_public=True)
            .prefetch_related("entitlements")
            .order_by("sort_order", "id")
        )


class BillingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_billing_status_payload(request.user))


class BillingUsageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        usage = compute_plan_usage(request.user)
        usage["entitlements"] = entitlements.get_user_entitlements(request.user)
        usage["is_pro"] = entitlements.is_pro(request.user)
        usage["metered"] = {
            key: entitlements.check_usage_limit(request.user, key)
            for key in ("scanner_scans_per_month", "quick_shares_per_month")
        }
        return Response(usage)


class PromoValidateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "billing_promo"

    def post(self, request):
        serializer = PromoValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = promo_service.validate_promo_code(
            serializer.validated_data["code"],
            user=request.user,
            plan_key=serializer.validated_data.get("plan_key") or None,
            interval=serializer.validated_data.get("interval") or None,
        )
        return Response(result.as_dict())


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            session = services.start_checkout(
                request.user,
                data["plan_key"],
                data["interval"],
                raw_promo=data.get("promo_code", ""),
            )
        except BillingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"checkout_url": session.get("url"), "manual": session.get("manual", False)}
        )


class PortalView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            session = services.open_billing_portal(request.user)
        except BillingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"portal_url": session.get("url")})


class CancelSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sub = services.cancel_subscription(request.user)
        if not sub:
            return Response(
                {"detail": "No active subscription to cancel."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_billing_status_payload(request.user))


class ResumeSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        services.resume_subscription(request.user)
        return Response(_billing_status_payload(request.user))


class InvoicesView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceRecordSerializer

    def get_queryset(self):
        return InvoiceRecord.objects.filter(user=self.request.user)


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(APIView):
    """Provider webhook. Signature verified inside the provider adapter."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.body
        sig = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        try:
            result = services.handle_webhook(payload, sig)
        except BillingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


# ---- Founder / admin -------------------------------------------------------


class FounderBillingOverviewView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        subs = UserSubscription.objects.all()
        paid = subs.filter(status__in=list(UserSubscription.PAID_STATUSES))
        # MRR estimate from app data (NOT a provider financial report).
        mrr = 0
        for s in paid:
            if s.billing_interval == "month":
                mrr += s.amount
            elif s.billing_interval == "year":
                mrr += round(s.amount / 12)
        from apps.users.models import User

        return Response(
            {
                "free_users": User.objects.filter(plan="free").count(),
                "pro_users": User.objects.filter(plan="pro_placeholder").count(),
                "active_paid_subscriptions": paid.count(),
                "trialing": subs.filter(status="trialing").count(),
                "past_due": subs.filter(
                    status__in=["past_due", "grace_period"]
                ).count(),
                "canceled": subs.filter(status="canceled").count(),
                "mrr_estimate_minor": mrr,
                "arr_estimate_minor": mrr * 12,
                "promo_redemptions": sum(
                    PromoCode.objects.values_list("redemption_count", flat=True)
                ),
                "active_manual_grants": ManualAccessGrant.objects.filter(
                    is_active=True
                ).count(),
                "estimate_note": "Estimates are derived from app data, not provider financials.",
            }
        )


class FounderSubscribersView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = SubscriberSerializer

    def get_queryset(self):
        qs = UserSubscription.objects.select_related("user", "plan")
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("plan"):
            qs = qs.filter(plan__key=params["plan"])
        return qs.order_by("-created_at")


class FounderPromoCodeListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = PromoCodeSerializer
    queryset = PromoCode.objects.all().order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class FounderPromoCodeDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = PromoCodeSerializer
    queryset = PromoCode.objects.all()
    lookup_url_kwarg = "promo_id"


class FounderManualAccessView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = ManualAccessGrantSerializer
    queryset = ManualAccessGrant.objects.select_related("user", "plan").order_by(
        "-created_at"
    )

    def perform_create(self, serializer):
        from apps.founder.audit import log_founder_action

        grant = serializer.save(granted_by=self.request.user)
        log_founder_action(
            self.request, "manual_access_grant",
            target_user_id=grant.user_id, plan_id=grant.plan_id,
        )
        # Keep User.plan in sync immediately.
        entitlements.sync_user_plan(grant.user)


class FounderManualAccessDetailView(APIView):
    permission_classes = [IsFounderUser]

    def delete(self, request, grant_id):
        from apps.founder.audit import log_founder_action

        try:
            grant = ManualAccessGrant.objects.get(pk=grant_id)
        except ManualAccessGrant.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        services.revoke_manual_access(grant)
        log_founder_action(
            request, "manual_access_revoke",
            target_user_id=grant.user_id, grant_id=grant_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FounderBillingEventsView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = BillingEventSerializer
    queryset = BillingEvent.objects.all().order_by("-processed_at")[:200]


class FounderReceiptSettingsView(APIView):
    """Read / update the branded-receipt configuration (founder console)."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        cfg = ReceiptSettings.load()
        return Response(ReceiptSettingsSerializer(cfg).data)

    def patch(self, request):
        from apps.founder.audit import log_founder_action

        cfg = ReceiptSettings.load()
        serializer = ReceiptSettingsSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        log_founder_action(request, "receipt_settings_update")
        return Response(serializer.data)


class FounderReceiptTestSendView(APIView):
    """Send a sample receipt to the founder's own email to preview the format."""

    permission_classes = [IsFounderUser]

    def post(self, request):
        if not request.user.email:
            return Response(
                {"detail": "Your account has no email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not receipts._is_email_configured():
            return Response(
                {"detail": "Email is not configured in this environment."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            receipts.send_test_receipt(request.user)
        except Exception:  # noqa: BLE001
            return Response(
                {"detail": "Could not send the test receipt."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"detail": f"Test receipt sent to {request.user.email}."})

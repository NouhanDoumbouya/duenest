"""
API views for the Subscription tracker.

Every queryset is owner-scoped to ``request.user``; non-list actions therefore
return 404 for another user's row (it is simply not in the queryset), which is
how the documents app enforces ownership too. ``owner`` is always set from the
request, never trusted from the client.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.features.flags import require_feature_enabled

from .models import Subscription, SubscriptionCategory, SubscriptionPaymentRecord
from .plan_usage import enforce_subscription_limit
from .serializers import (
    SubscriptionCategorySerializer,
    SubscriptionPaymentRecordSerializer,
    SubscriptionSerializer,
)
from .services import advance_billing_date, build_summary, subscription_attention

# List orderings the client may request (anything else falls back to default).
_ALLOWED_ORDERING = {
    "next_billing_date",
    "-next_billing_date",
    "amount",
    "-amount",
    "name",
    "-name",
    "created_at",
    "-created_at",
}

_TRUE = {"1", "true", "yes", "on"}


class _SubscriptionsDeprecatedMixin:
    """
    Server-side deprecation gate for the legacy Subscription Radar.

    CertaNest is a life-document readiness platform, not a subscription/finance
    tracker. The ``subscriptions`` feature flag defaults to ``disabled``, so this
    raises a controlled 503 for every action (list/detail/create/lifecycle).
    UI hiding alone is not enough — the API must refuse too. A founder can still
    re-enable the flag to inspect legacy data; tables are retained, never dropped.
    """

    def initial(self, request, *args, **kwargs):
        require_feature_enabled("subscriptions", request.user)
        super().initial(request, *args, **kwargs)


class SubscriptionCategoryViewSet(
    _SubscriptionsDeprecatedMixin, viewsets.ReadOnlyModelViewSet
):
    """
    Read-only list of categories available to the user: the system categories
    plus any the user owns (none in V1, but the query is owner-aware already).
    """

    serializer_class = SubscriptionCategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        from django.db.models import Q

        return SubscriptionCategory.objects.filter(
            Q(is_system=True) | Q(owner=self.request.user)
        )


class SubscriptionViewSet(_SubscriptionsDeprecatedMixin, viewsets.ModelViewSet):
    """CRUD + lifecycle actions for the authenticated user's subscriptions."""

    serializer_class = SubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Subscription.objects.filter(
            owner=self.request.user
        ).select_related("category")

        # Detail / mutating actions can reach archived rows (e.g. to restore).
        if self.action != "list":
            return queryset

        params = self.request.query_params

        # Active list hides archived subscriptions unless explicitly requested.
        if self._bool_param("archived") is True:
            queryset = queryset.filter(is_archived=True)
        else:
            queryset = queryset.filter(is_archived=False)

        search = params.get("search", "").strip()
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(provider__icontains=search)
                | Q(plan_name__icontains=search)
                | Q(notes__icontains=search)
            )

        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("category"):
            category = params["category"].strip()
            if category.isdigit():
                queryset = queryset.filter(category_id=int(category))
            else:
                queryset = queryset.filter(category__slug=category)
        if params.get("billing_cycle"):
            queryset = queryset.filter(billing_cycle=params["billing_cycle"])
        if params.get("currency"):
            queryset = queryset.filter(currency=params["currency"].strip().upper())

        auto_renew = self._bool_param("auto_renew")
        if auto_renew is not None:
            queryset = queryset.filter(auto_renew=auto_renew)

        renews_within = params.get("renews_within_days")
        if renews_within and renews_within.isdigit():
            today = timezone.localdate()
            horizon = today + timezone.timedelta(days=int(renews_within))
            queryset = queryset.filter(
                next_billing_date__gte=today, next_billing_date__lte=horizon
            )

        ordering = params.get("ordering", "next_billing_date")
        if ordering not in _ALLOWED_ORDERING:
            ordering = "next_billing_date"
        return queryset.order_by(ordering, "name")

    def _bool_param(self, name):
        value = self.request.query_params.get(name)
        if value is None:
            return None
        return value.lower() in _TRUE

    def perform_create(self, serializer):
        # Owner is always the requester; enforce the plan limit on create.
        enforce_subscription_limit(self.request.user)
        serializer.save(owner=self.request.user)

    # ---- Lifecycle actions -------------------------------------------------

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        subscription = self.get_object()
        subscription.archive()
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        subscription = self.get_object()
        subscription.restore()
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"])
    def snooze(self, request, pk=None):
        """Hide from Life Radar / Attention until later. Body {"days": int};
        0 or less clears it, capped at 365."""
        subscription = self.get_object()
        try:
            days = int(request.data.get("days", 7))
        except (TypeError, ValueError):
            days = 7
        if days <= 0:
            subscription.attention_snoozed_until = None
        else:
            subscription.attention_snoozed_until = timezone.now() + timezone.timedelta(
                days=min(days, 365)
            )
        subscription.save(update_fields=["attention_snoozed_until", "updated_at"])
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"], url_path="mark-cancelled")
    def mark_cancelled(self, request, pk=None):
        subscription = self.get_object()
        subscription.status = Subscription.Status.CANCELLED
        subscription.auto_renew = False
        subscription.save(update_fields=["status", "auto_renew", "updated_at"])
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        """
        Log a payment for the current period and roll the next billing date
        forward by one cycle. Amount/date default to the subscription's own
        values but can be overridden in the request body.
        """
        subscription = self.get_object()
        paid_on = request.data.get("paid_on") or timezone.localdate().isoformat()
        amount = request.data.get("amount", subscription.amount)
        record = SubscriptionPaymentRecord.objects.create(
            owner=request.user,
            subscription=subscription,
            amount=amount,
            currency=subscription.currency,
            paid_on=paid_on,
            notes=request.data.get("notes", ""),
        )
        # Advance the next billing date by one cycle if we can determine it.
        new_nbd = advance_billing_date(subscription)
        if new_nbd is not None:
            subscription.next_billing_date = new_nbd
            subscription.save(update_fields=["next_billing_date", "updated_at"])
        return Response(
            {
                "subscription": self.get_serializer(subscription).data,
                "payment": SubscriptionPaymentRecordSerializer(record).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="skip-next-renewal")
    def skip_next_renewal(self, request, pk=None):
        """Advance the next billing date by one cycle without logging a payment."""
        subscription = self.get_object()
        new_nbd = advance_billing_date(subscription)
        if new_nbd is None:
            return Response(
                {
                    "detail": (
                        "This subscription's billing cycle can't be advanced "
                        "automatically. Set a next billing date first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        subscription.next_billing_date = new_nbd
        subscription.save(update_fields=["next_billing_date", "updated_at"])
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"], url_path="toggle-pin")
    def toggle_pin(self, request, pk=None):
        """Pin/unpin an important subscription so it floats to the top."""
        subscription = self.get_object()
        subscription.pinned = not subscription.pinned
        subscription.save(update_fields=["pinned", "updated_at"])
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        """
        Mark a subscription as reviewed now. Optionally set its cancel-candidate
        flag from the request body so "Keep" / "Consider cancelling" both flow
        through one endpoint.
        """
        subscription = self.get_object()
        subscription.last_reviewed_at = timezone.now()
        update_fields = ["last_reviewed_at", "updated_at"]
        if "cancel_candidate" in request.data:
            subscription.cancel_candidate = (
                str(request.data.get("cancel_candidate")).lower() in _TRUE
            )
            update_fields.append("cancel_candidate")
        subscription.save(update_fields=update_fields)
        return Response(self.get_serializer(subscription).data)

    @action(detail=False, methods=["get"], url_path="export")
    def export_csv(self, request):
        """
        Export the user's subscriptions as CSV. Safe fields only — never a raw
        card number, token, or secret (payment_method_label is a user-entered
        label that is already card-number-validated on write).
        """
        import csv
        import io

        from django.http import HttpResponse

        rows = (
            Subscription.objects.filter(owner=request.user)
            .select_related("category")
            .order_by("name")
        )
        columns = [
            "name", "provider", "plan_name", "category", "status", "amount",
            "currency", "billing_cycle", "next_billing_date",
            "cancellation_deadline", "auto_renew", "payment_method_label",
            "pinned", "cancel_candidate", "is_archived", "notes",
        ]
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columns)
        for sub in rows:
            writer.writerow([
                sub.name,
                sub.provider,
                sub.plan_name,
                sub.category.name if sub.category else "",
                sub.status,
                sub.amount,
                sub.currency,
                sub.billing_cycle,
                sub.next_billing_date or "",
                sub.cancellation_deadline or "",
                "yes" if sub.auto_renew else "no",
                sub.payment_method_label,
                "yes" if sub.pinned else "no",
                "yes" if sub.cancel_candidate else "no",
                "yes" if sub.is_archived else "no",
                sub.notes.replace("\n", " ").strip(),
            ])
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="duenest-subscriptions.csv"'
        )
        return response

    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response(build_summary(request.user))

    @action(detail=False, methods=["get"])
    def attention(self, request):
        items = subscription_attention(request.user)
        return Response({"count": len(items), "items": items})

    # ---- Nested payment records -------------------------------------------

    @action(detail=True, methods=["get", "post"])
    def payments(self, request, pk=None):
        subscription = self.get_object()
        if request.method == "GET":
            records = subscription.payments.all()
            return Response(
                SubscriptionPaymentRecordSerializer(records, many=True).data
            )
        serializer = SubscriptionPaymentRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            owner=request.user,
            subscription=subscription,
            currency=serializer.validated_data.get("currency")
            or subscription.currency,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["get", "patch", "delete"],
        url_path="payments/(?P<payment_id>[0-9]+)",
    )
    def payment_detail(self, request, pk=None, payment_id=None):
        subscription = self.get_object()
        record = get_object_or_404(
            SubscriptionPaymentRecord, pk=payment_id, subscription=subscription
        )
        if request.method == "GET":
            return Response(SubscriptionPaymentRecordSerializer(record).data)
        if request.method == "DELETE":
            record.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = SubscriptionPaymentRecordSerializer(
            record, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

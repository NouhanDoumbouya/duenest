"""
Tests for the Subscription / Recurring Renewal Tracker.

Coverage focuses on the security-critical and logic-critical behaviour:
owner-scoping, summary + cost grouping, urgency windows, validation, payment
records, and that subscription events reach the (owner-scoped) calendar and
timeline.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.subscriptions.models import (
    Subscription,
    SubscriptionCategory,
    SubscriptionPaymentRecord,
)
from apps.subscriptions.services import (
    add_months,
    advance_billing_date,
    build_summary,
    monthly_equivalent,
    subscription_attention,
    yearly_equivalent,
)

User = get_user_model()

LIST = "/api/v1/subscriptions/"
SUMMARY = "/api/v1/subscriptions/summary/"
ATTENTION = "/api/v1/subscriptions/attention/"
CATEGORIES = "/api/v1/subscription-categories/"
CALENDAR = "/api/v1/calendar/events/"
TIMELINE = "/api/v1/documents/timeline/"


def detail(pk):
    return f"{LIST}{pk}/"


class SubscriptionBaseTest(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@x.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@x.com", password="StrongPassword123!DN"
        )
        self.today = timezone.localdate()

    def make_sub(self, owner=None, **kwargs):
        owner = owner or self.alice
        data = {
            "name": "Netflix",
            "amount": Decimal("15.99"),
            "currency": "USD",
            "billing_cycle": Subscription.BillingCycle.MONTHLY,
            "next_billing_date": self.today + timedelta(days=10),
            "status": Subscription.Status.ACTIVE,
        }
        data.update(kwargs)
        return Subscription.objects.create(owner=owner, **data)


class CategorySeedTest(SubscriptionBaseTest):
    def test_default_categories_seeded(self):
        self.client.force_authenticate(self.alice)
        res = self.client.get(CATEGORIES)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = {c["name"] for c in res.data}
        self.assertIn("Streaming", names)
        self.assertIn("Insurance", names)
        self.assertEqual(SubscriptionCategory.objects.filter(is_system=True).count(), 13)


class CrudOwnershipTest(SubscriptionBaseTest):
    def test_create_sets_owner_from_request(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            LIST,
            {
                "name": "Spotify",
                "amount": "9.99",
                "currency": "usd",  # lower-case is normalised
                "billing_cycle": "monthly",
                "next_billing_date": (self.today + timedelta(days=5)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        sub = Subscription.objects.get(pk=res.data["id"])
        self.assertEqual(sub.owner, self.alice)
        self.assertEqual(sub.currency, "USD")

    def test_list_only_returns_own(self):
        self.make_sub(owner=self.alice, name="Alice TV")
        self.make_sub(owner=self.bob, name="Bob TV")
        self.client.force_authenticate(self.alice)
        res = self.client.get(LIST)
        names = {s["name"] for s in res.data["results"]}
        self.assertEqual(names, {"Alice TV"})

    def test_cannot_retrieve_another_users_subscription(self):
        bob_sub = self.make_sub(owner=self.bob)
        self.client.force_authenticate(self.alice)
        res = self.client.get(detail(bob_sub.pk))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_update_another_users_subscription(self):
        bob_sub = self.make_sub(owner=self.bob)
        self.client.force_authenticate(self.alice)
        res = self.client.patch(detail(bob_sub.pk), {"name": "Hacked"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        bob_sub.refresh_from_db()
        self.assertNotEqual(bob_sub.name, "Hacked")

    def test_archive_and_restore(self):
        sub = self.make_sub()
        self.client.force_authenticate(self.alice)
        res = self.client.post(f"{detail(sub.pk)}archive/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        sub.refresh_from_db()
        self.assertTrue(sub.is_archived)
        # Archived rows drop out of the active list.
        self.assertEqual(self.client.get(LIST).data["count"], 0)
        # ...but are reachable via ?archived=true and can be restored.
        self.assertEqual(self.client.get(f"{LIST}?archived=true").data["count"], 1)
        self.client.post(f"{detail(sub.pk)}restore/")
        sub.refresh_from_db()
        self.assertFalse(sub.is_archived)


class ValidationTest(SubscriptionBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.alice)

    def _post(self, **overrides):
        body = {
            "name": "X",
            "amount": "5.00",
            "currency": "USD",
            "billing_cycle": "monthly",
            "next_billing_date": (self.today + timedelta(days=5)).isoformat(),
        }
        body.update(overrides)
        return self.client.post(LIST, body, format="json")

    def test_rejects_negative_amount(self):
        res = self._post(amount="-3.00")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", res.data)

    def test_custom_cycle_requires_interval(self):
        res = self._post(billing_cycle="custom")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("custom_interval_count", res.data)

    def test_custom_cycle_with_interval_ok(self):
        res = self._post(
            billing_cycle="custom",
            custom_interval_count=2,
            custom_interval_unit="months",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_cancellation_deadline_after_billing_rejected(self):
        res = self._post(
            cancellation_deadline=(self.today + timedelta(days=20)).isoformat(),
            next_billing_date=(self.today + timedelta(days=10)).isoformat(),
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cancellation_deadline", res.data)

    def test_rejects_full_card_number_in_label(self):
        res = self._post(payment_method_label="4111 1111 1111 1111")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("payment_method_label", res.data)


class CostAndSummaryTest(SubscriptionBaseTest):
    def test_monthly_yearly_equivalents(self):
        weekly = self.make_sub(
            billing_cycle=Subscription.BillingCycle.WEEKLY, amount=Decimal("10")
        )
        # 10 * 52 / 12 = 43.33
        self.assertEqual(monthly_equivalent(weekly), Decimal("43.33"))
        yearly = self.make_sub(
            billing_cycle=Subscription.BillingCycle.YEARLY, amount=Decimal("120")
        )
        self.assertEqual(monthly_equivalent(yearly), Decimal("10.00"))
        self.assertEqual(yearly_equivalent(yearly), Decimal("120.00"))

    def test_custom_indeterminate_cost_is_none(self):
        sub = self.make_sub(billing_cycle=Subscription.BillingCycle.CUSTOM)
        self.assertIsNone(monthly_equivalent(sub))

    def test_summary_groups_costs_by_currency(self):
        self.make_sub(amount=Decimal("10"), currency="USD")
        self.make_sub(amount=Decimal("8"), currency="GBP", name="UK Service")
        summary = build_summary(self.alice)
        self.assertEqual(summary["active_count"], 2)
        self.assertEqual(summary["monthly_cost_by_currency"]["USD"], "10.00")
        self.assertEqual(summary["monthly_cost_by_currency"]["GBP"], "8.00")
        self.assertEqual(summary["yearly_cost_by_currency"]["USD"], "120.00")

    def test_summary_renewal_windows(self):
        self.make_sub(next_billing_date=self.today + timedelta(days=3))
        self.make_sub(next_billing_date=self.today + timedelta(days=20), name="B")
        self.make_sub(next_billing_date=self.today + timedelta(days=200), name="C")
        summary = build_summary(self.alice)
        self.assertEqual(summary["renewals_this_week"], 1)
        self.assertEqual(summary["renewals_this_month"], 2)

    def test_summary_is_owner_scoped(self):
        self.make_sub(owner=self.bob, amount=Decimal("99"))
        summary = build_summary(self.alice)
        self.assertEqual(summary["active_count"], 0)
        self.assertEqual(summary["monthly_cost_by_currency"], {})


class AttentionTest(SubscriptionBaseTest):
    def test_cancellation_deadline_and_overdue_flagged(self):
        self.make_sub(
            name="Domain",
            next_billing_date=self.today + timedelta(days=5),
            cancellation_deadline=self.today + timedelta(days=3),
        )
        self.make_sub(
            name="Overdue One", next_billing_date=self.today - timedelta(days=2)
        )
        items = subscription_attention(self.alice)
        by_name = {i["name"]: i["reasons"] for i in items}
        self.assertIn("Cancellation deadline soon", by_name["Domain"])
        self.assertIn("Renewal overdue", by_name["Overdue One"])

    def test_attention_endpoint_owner_scoped(self):
        self.make_sub(owner=self.bob, next_billing_date=self.today - timedelta(days=1))
        self.client.force_authenticate(self.alice)
        res = self.client.get(ATTENTION)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 0)


class ActionsTest(SubscriptionBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.alice)

    def test_mark_paid_logs_payment_and_advances_date(self):
        sub = self.make_sub(next_billing_date=self.today)
        res = self.client.post(f"{detail(sub.pk)}mark-paid/")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        sub.refresh_from_db()
        self.assertEqual(sub.next_billing_date, add_months(self.today, 1))
        self.assertEqual(
            SubscriptionPaymentRecord.objects.filter(subscription=sub).count(), 1
        )

    def test_mark_cancelled(self):
        sub = self.make_sub(auto_renew=True)
        self.client.post(f"{detail(sub.pk)}mark-cancelled/")
        sub.refresh_from_db()
        self.assertEqual(sub.status, Subscription.Status.CANCELLED)
        self.assertFalse(sub.auto_renew)

    def test_payment_records_are_owner_scoped(self):
        bob_sub = self.make_sub(owner=self.bob)
        # Alice cannot post a payment to Bob's subscription (404, not in queryset).
        res = self.client.post(
            f"{detail(bob_sub.pk)}payments/",
            {"amount": "5.00", "paid_on": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_payment_create_and_list(self):
        sub = self.make_sub()
        res = self.client.post(
            f"{detail(sub.pk)}payments/",
            {"amount": "15.99", "paid_on": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        listing = self.client.get(f"{detail(sub.pk)}payments/")
        self.assertEqual(len(listing.data), 1)


class AdvanceDateTest(SubscriptionBaseTest):
    def test_month_end_clamping(self):
        # Jan 31 + 1 month -> Feb 28 (or 29). Use a fixed date.
        from datetime import date

        sub = self.make_sub(
            billing_cycle=Subscription.BillingCycle.MONTHLY,
            next_billing_date=date(2025, 1, 31),
        )
        self.assertEqual(advance_billing_date(sub), date(2025, 2, 28))


class CalendarTimelineIntegrationTest(SubscriptionBaseTest):
    def test_subscription_appears_in_calendar_owner_scoped(self):
        self.make_sub(
            name="ChatGPT", next_billing_date=self.today + timedelta(days=4)
        )
        self.make_sub(owner=self.bob, name="BobFlix")
        self.client.force_authenticate(self.alice)
        res = self.client.get(CALENDAR)
        titles = {e["title"] for e in res.data["events"]}
        categories = {e["category"] for e in res.data["events"]}
        self.assertIn("ChatGPT renews", titles)
        self.assertNotIn("BobFlix renews", titles)
        self.assertIn("subscriptions", categories)

    def test_cancellation_deadline_in_calendar(self):
        self.make_sub(
            name="Hosting",
            next_billing_date=self.today + timedelta(days=10),
            cancellation_deadline=self.today + timedelta(days=6),
        )
        self.client.force_authenticate(self.alice)
        res = self.client.get(CALENDAR)
        types = {e["event_type"] for e in res.data["events"]}
        self.assertIn("subscription_cancellation_deadline", types)

    def test_subscription_appears_in_timeline(self):
        self.make_sub(
            name="Gym", next_billing_date=self.today + timedelta(days=6)
        )
        self.client.force_authenticate(self.alice)
        res = self.client.get(TIMELINE)
        events = res.data["items"]
        match = [e for e in events if e["event_type"] == "subscription_renewal"]
        self.assertTrue(match)
        self.assertEqual(match[0]["related_subscription"], Subscription.objects.get(name="Gym").pk)

    def test_trial_emits_trial_ending_event(self):
        self.make_sub(
            name="Trial App",
            status=Subscription.Status.TRIAL,
            next_billing_date=self.today + timedelta(days=3),
        )
        self.client.force_authenticate(self.alice)
        res = self.client.get(CALENDAR)
        types = {e["event_type"] for e in res.data["events"]}
        self.assertIn("subscription_trial_ending", types)


class PlanLimitTest(SubscriptionBaseTest):
    def test_free_plan_subscription_cap_enforced(self):
        # Free plan caps subscriptions at 10.
        for i in range(10):
            self.make_sub(name=f"Sub {i}")
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            LIST,
            {
                "name": "Eleventh",
                "amount": "1.00",
                "currency": "USD",
                "billing_cycle": "monthly",
                "next_billing_date": (self.today + timedelta(days=5)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get("code"), "plan_limit_exceeded")

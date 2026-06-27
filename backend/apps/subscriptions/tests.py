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

from apps.features.models import FeatureFlag, Visibility
from apps.subscriptions.models import (
    Subscription,
    SubscriptionCategory,
    SubscriptionPaymentRecord,
)
from apps.subscriptions.services import (
    add_months,
    advance_billing_date,
    build_summary,
    compute_review,
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
        # Subscription Radar is deprecated and disabled by default (CertaNest is a
        # life-document readiness platform, not a finance tracker). The engine is
        # retained so a founder can re-enable it to inspect legacy data — these
        # tests prove it still works when the flag is turned back on.
        FeatureFlag.objects.update_or_create(
            key="subscriptions", defaults={"visibility": Visibility.ENABLED}
        )
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
        self.assertIn("Cancellation deadline is in 3 days", by_name["Domain"])
        self.assertIn("Payment overdue", by_name["Overdue One"])

    def test_attention_endpoint_owner_scoped(self):
        self.make_sub(owner=self.bob, next_billing_date=self.today - timedelta(days=1))
        self.client.force_authenticate(self.alice)
        res = self.client.get(ATTENTION)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 0)


class SnoozeTest(SubscriptionBaseTest):
    """Snoozing hides a subscription from Attention without changing its dates."""

    def snooze_url(self, sub_id):
        return f"/api/v1/subscriptions/{sub_id}/snooze/"

    def test_snooze_hides_subscription_from_attention(self):
        sub = self.make_sub(
            name="Overdue", next_billing_date=self.today - timedelta(days=2)
        )
        self.client.force_authenticate(self.alice)

        before = self.client.get(ATTENTION)
        self.assertEqual(before.data["count"], 1)

        res = self.client.post(
            self.snooze_url(sub.id), {"days": 7}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data["attention_snoozed_until"])

        after = self.client.get(ATTENTION)
        self.assertEqual(after.data["count"], 0)

    def test_snooze_does_not_change_billing_date(self):
        nbd = self.today - timedelta(days=2)
        sub = self.make_sub(name="Overdue", next_billing_date=nbd)
        self.client.force_authenticate(self.alice)
        self.client.post(self.snooze_url(sub.id), {"days": 7}, format="json")
        sub.refresh_from_db()
        self.assertEqual(sub.next_billing_date, nbd)
        self.assertIsNotNone(sub.attention_snoozed_until)

    def test_expired_snooze_resurfaces_subscription(self):
        sub = self.make_sub(
            name="Overdue", next_billing_date=self.today - timedelta(days=2)
        )
        sub.attention_snoozed_until = timezone.now() - timedelta(days=1)
        sub.save(update_fields=["attention_snoozed_until"])
        self.client.force_authenticate(self.alice)
        res = self.client.get(ATTENTION)
        self.assertEqual(res.data["count"], 1)

    def test_snooze_zero_days_clears_the_snooze(self):
        sub = self.make_sub(
            name="Overdue", next_billing_date=self.today - timedelta(days=2)
        )
        sub.attention_snoozed_until = timezone.now() + timedelta(days=7)
        sub.save(update_fields=["attention_snoozed_until"])
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            self.snooze_url(sub.id), {"days": 0}, format="json"
        )
        self.assertIsNone(res.data["attention_snoozed_until"])
        self.assertEqual(self.client.get(ATTENTION).data["count"], 1)

    def test_cannot_snooze_another_users_subscription(self):
        bob_sub = self.make_sub(
            owner=self.bob, next_billing_date=self.today - timedelta(days=2)
        )
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            self.snooze_url(bob_sub.id), {"days": 7}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


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


class ReviewIntelligenceTest(SubscriptionBaseTest):
    def test_healthy_when_far_off(self):
        sub = self.make_sub(next_billing_date=self.today + timedelta(days=200))
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "healthy")

    def test_cancellation_deadline_is_urgent(self):
        sub = self.make_sub(
            next_billing_date=self.today + timedelta(days=5),
            cancellation_deadline=self.today + timedelta(days=1),
        )
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "urgent")
        self.assertEqual(review["next_best_action"], "Cancel before deadline")
        self.assertIn("Cancellation deadline is tomorrow", review["review_reasons"])

    def test_overdue_is_urgent_mark_paid(self):
        sub = self.make_sub(next_billing_date=self.today - timedelta(days=3))
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "urgent")
        self.assertEqual(review["next_best_action"], "Mark as paid")
        self.assertIn("Payment overdue", review["review_reasons"])

    def test_trial_attention(self):
        sub = self.make_sub(
            status=Subscription.Status.TRIAL,
            next_billing_date=self.today + timedelta(days=3),
        )
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "trial_attention")

    def test_auto_renew_soon_is_review(self):
        sub = self.make_sub(
            auto_renew=True, next_billing_date=self.today + timedelta(days=5)
        )
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "review")
        self.assertIn("Auto-renews in 5 days", review["review_reasons"])

    def test_rarely_used_high_cost_is_cancel_candidate(self):
        sub = self.make_sub(
            importance=Subscription.Importance.RARELY_USED,
            billing_cycle=Subscription.BillingCycle.YEARLY,
            amount="600.00",
            next_billing_date=self.today + timedelta(days=200),
        )
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "cancel_candidate")
        self.assertIn("High yearly cost", review["review_reasons"])
        self.assertIn("Marked rarely used", review["review_reasons"])

    def test_missing_next_billing_date_is_review(self):
        sub = self.make_sub(next_billing_date=None)
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "review")
        self.assertEqual(review["next_best_action"], "Update next billing date")

    def test_stale_last_used_with_auto_renew_is_review(self):
        sub = self.make_sub(
            auto_renew=True,
            last_used_date=self.today - timedelta(days=120),
            next_billing_date=self.today + timedelta(days=200),
        )
        review = compute_review(sub)
        self.assertEqual(review["review_status"], "review")
        self.assertIn("Not used in 90+ days", review["review_reasons"])

    def test_cancelled_is_healthy(self):
        sub = self.make_sub(status=Subscription.Status.CANCELLED)
        self.assertEqual(compute_review(sub)["review_status"], "healthy")

    def test_state_exposes_review_fields_via_api(self):
        sub = self.make_sub(
            auto_renew=True, next_billing_date=self.today + timedelta(days=3)
        )
        self.client.force_authenticate(self.alice)
        res = self.client.get(detail(sub.pk))
        state = res.data["state"]
        self.assertIn("review_status", state)
        self.assertIn("review_reasons", state)
        self.assertIn("next_best_action", state)
        self.assertIn("monthly_equivalent_amount", state)
        self.assertEqual(state["urgency_status"], state["urgency"])


class ExpandedSummaryTest(SubscriptionBaseTest):
    def test_summary_includes_intelligence_counts(self):
        self.make_sub(name="A", auto_renew=True, next_billing_date=self.today + timedelta(days=3))
        self.make_sub(
            name="B",
            status=Subscription.Status.TRIAL,
            next_billing_date=self.today + timedelta(days=2),
        )
        self.make_sub(
            name="C",
            importance=Subscription.Importance.RARELY_USED,
            billing_cycle=Subscription.BillingCycle.YEARLY,
            amount="900.00",
            next_billing_date=self.today + timedelta(days=300),
        )
        summary = build_summary(self.alice)
        self.assertEqual(summary["trial_count"], 1)
        self.assertGreaterEqual(summary["auto_renewing_soon"], 1)
        self.assertEqual(summary["high_yearly_cost_count"], 1)
        self.assertEqual(summary["rarely_used_count"], 1)
        self.assertGreaterEqual(summary["review_recommended_count"], 2)
        self.assertIn("by_importance", summary)
        self.assertIn("spend_by_category", summary)

    def test_spend_by_category_grouped_by_currency(self):
        self.make_sub(name="USD one", amount="10.00", currency="USD")
        self.make_sub(name="GBP one", amount="8.00", currency="GBP")
        summary = build_summary(self.alice)
        # Both land in "Uncategorized" (no category set).
        cat = summary["spend_by_category"]["Uncategorized"]
        self.assertEqual(cat["USD"], "10.00")
        self.assertEqual(cat["GBP"], "8.00")


class FounderSubscriptionMetricTest(SubscriptionBaseTest):
    def test_subscription_adoption_metric_is_aggregate(self):
        from apps.founder.services import build_feature_adoption

        self.make_sub(owner=self.alice, name="Secret Name")
        self.make_sub(owner=self.bob, name="Another Secret")
        adoption = build_feature_adoption()
        self.assertEqual(adoption["subscriptions_used_count"], 2)
        feature = next(
            f for f in adoption["features"] if f["feature_key"] == "subscriptions"
        )
        self.assertEqual(feature["users_count"], 2)
        # Privacy: no subscription names leak into the aggregate payload.
        self.assertNotIn("Secret Name", str(adoption))


class RadarFieldsAndActionsTest(SubscriptionBaseTest):
    """Pin / review / cancel-candidate fields + endpoints, and CSV export."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.alice)
        self.sub = self.make_sub()

    def test_new_fields_default_safely(self):
        resp = self.client.get(f"{LIST}{self.sub.id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["pinned"], False)
        self.assertEqual(resp.data["cancel_candidate"], False)
        self.assertIsNone(resp.data["last_reviewed_at"])
        self.assertEqual(resp.data["price_change_note"], "")

    def test_toggle_pin(self):
        resp = self.client.post(f"{LIST}{self.sub.id}/toggle-pin/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["pinned"])
        resp = self.client.post(f"{LIST}{self.sub.id}/toggle-pin/")
        self.assertFalse(resp.data["pinned"])

    def test_review_sets_timestamp_and_cancel_candidate(self):
        resp = self.client.post(
            f"{LIST}{self.sub.id}/review/",
            {"cancel_candidate": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNotNone(resp.data["last_reviewed_at"])
        self.assertTrue(resp.data["cancel_candidate"])

    def test_price_change_note_rejects_card_number(self):
        resp = self.client.patch(
            f"{LIST}{self.sub.id}/",
            {"price_change_note": "card 4111 1111 1111 1111"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_last_reviewed_at_is_read_only(self):
        # Writing it directly is ignored; only the review action sets it.
        resp = self.client.patch(
            f"{LIST}{self.sub.id}/",
            {"last_reviewed_at": "2020-01-01T00:00:00Z"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data["last_reviewed_at"])

    def test_export_csv(self):
        self.make_sub(name="Spotify", amount=Decimal("9.99"))
        resp = self.client.get(f"{LIST}export/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "text/csv")
        body = resp.content.decode()
        self.assertIn("Netflix", body)
        self.assertIn("Spotify", body)
        # Header row present; no secret columns leak.
        self.assertIn("name,provider", body)

    def test_export_csv_is_owner_scoped(self):
        self.make_sub(owner=self.bob, name="BobOnly")
        resp = self.client.get(f"{LIST}export/")
        self.assertNotIn("BobOnly", resp.content.decode())


class ProviderKeyTest(SubscriptionBaseTest):
    """The optional provider_key (curated template reference) round-trips."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.alice)

    def test_provider_key_persists_and_defaults_blank(self):
        resp = self.client.post(
            LIST,
            {
                "name": "Netflix",
                "provider_key": "netflix",
                "amount": "15.99",
                "currency": "USD",
                "billing_cycle": "monthly",
                "next_billing_date": (self.today + timedelta(days=10)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["provider_key"], "netflix")

        # Custom subscription without a template key stays blank (not null-breaking).
        resp2 = self.client.post(
            LIST,
            {
                "name": "My local gym",
                "amount": "30.00",
                "currency": "USD",
                "billing_cycle": "monthly",
                "next_billing_date": (self.today + timedelta(days=10)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp2.status_code, 201, resp2.data)
        self.assertEqual(resp2.data["provider_key"], "")


class DeprecationGateTest(APITestCase):
    """
    Subscription Radar is deprecated. With the default flag state (no DB row,
    no env override → ``disabled``), every subscriptions endpoint must refuse
    with a controlled 503. UI hiding is not enough — the API must enforce it.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="carol", email="c@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)

    def test_list_is_gated_off_by_default(self):
        res = self.client.get(LIST)
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(res.data.get("feature"), "subscriptions")

    def test_categories_is_gated_off_by_default(self):
        res = self.client.get(CATEGORIES)
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_create_is_gated_off_by_default(self):
        res = self.client.post(
            LIST,
            {
                "name": "Netflix",
                "amount": "15.99",
                "currency": "USD",
                "billing_cycle": "monthly",
                "next_billing_date": (timezone.localdate() + timedelta(days=10)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


class CsvFormulaInjectionTest(SubscriptionBaseTest):
    """SEC-015 — the CSV export neutralizes spreadsheet formula injection."""

    def test_export_quotes_formula_like_cells(self):
        self.client.force_authenticate(self.alice)
        self.make_sub(
            owner=self.alice,
            name='=HYPERLINK("http://evil")',
            provider="@SUM(A1)",
            notes="+1+1",
        )
        resp = self.client.get("/api/v1/subscriptions/export/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.content.decode()
        # Each risky user-entered cell is prefixed with a single quote so a
        # spreadsheet renders it as literal text, not an executable formula.
        self.assertIn("'=HYPERLINK", body)
        self.assertIn("'@SUM(A1)", body)
        self.assertIn("'+1+1", body)

from django.urls import path

from .views import (
    BillingStatusView,
    BillingUsageView,
    CancelSubscriptionView,
    CheckoutView,
    FounderBillingEventsView,
    FounderBillingOverviewView,
    FounderManualAccessDetailView,
    FounderManualAccessView,
    FounderPromoCodeDetailView,
    FounderPromoCodeListCreateView,
    FounderSubscribersView,
    InvoicesView,
    PlansView,
    PortalView,
    PromoValidateView,
    ResumeSubscriptionView,
    StripeWebhookView,
)

urlpatterns = [
    # Public + user billing
    path("billing/plans/", PlansView.as_view(), name="billing-plans"),
    path("billing/status/", BillingStatusView.as_view(), name="billing-status"),
    path("billing/usage/", BillingUsageView.as_view(), name="billing-usage"),
    path("billing/invoices/", InvoicesView.as_view(), name="billing-invoices"),
    path("billing/promo/validate/", PromoValidateView.as_view(), name="billing-promo-validate"),
    path("billing/checkout/", CheckoutView.as_view(), name="billing-checkout"),
    path("billing/portal/", PortalView.as_view(), name="billing-portal"),
    path("billing/cancel/", CancelSubscriptionView.as_view(), name="billing-cancel"),
    path("billing/resume/", ResumeSubscriptionView.as_view(), name="billing-resume"),
    path("billing/webhook/stripe/", StripeWebhookView.as_view(), name="billing-webhook-stripe"),
    # Founder / admin billing
    path(
        "founder/billing/overview/",
        FounderBillingOverviewView.as_view(),
        name="founder-billing-overview",
    ),
    path(
        "founder/billing/subscribers/",
        FounderSubscribersView.as_view(),
        name="founder-billing-subscribers",
    ),
    path(
        "founder/billing/promo-codes/",
        FounderPromoCodeListCreateView.as_view(),
        name="founder-billing-promo-codes",
    ),
    path(
        "founder/billing/promo-codes/<int:promo_id>/",
        FounderPromoCodeDetailView.as_view(),
        name="founder-billing-promo-code-detail",
    ),
    path(
        "founder/billing/manual-access/",
        FounderManualAccessView.as_view(),
        name="founder-billing-manual-access",
    ),
    path(
        "founder/billing/manual-access/<int:grant_id>/",
        FounderManualAccessDetailView.as_view(),
        name="founder-billing-manual-access-detail",
    ),
    path(
        "founder/billing/events/",
        FounderBillingEventsView.as_view(),
        name="founder-billing-events",
    ),
]

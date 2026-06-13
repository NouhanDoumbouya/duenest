"""
URL routing for the Subscription tracker, mounted under ``/api/v1/``.

The router exposes:

* ``subscription-categories/``                 list (read-only)
* ``subscriptions/``                           list / create
* ``subscriptions/{id}/``                      retrieve / update / delete
* ``subscriptions/summary/``                   owner roll-up
* ``subscriptions/{id}/archive/``              soft archive
* ``subscriptions/{id}/restore/``              restore
* ``subscriptions/{id}/mark-cancelled/``       set status cancelled
* ``subscriptions/{id}/mark-paid/``            log payment + roll renewal date
* ``subscriptions/{id}/skip-next-renewal/``    roll renewal date only
* ``subscriptions/{id}/payments/``             list / create payment records
* ``subscriptions/{id}/payments/{payment_id}/`` retrieve / update / delete
"""

from rest_framework.routers import DefaultRouter

from .views import SubscriptionCategoryViewSet, SubscriptionViewSet

router = DefaultRouter()
router.register(
    "subscription-categories",
    SubscriptionCategoryViewSet,
    basename="subscription-category",
)
router.register("subscriptions", SubscriptionViewSet, basename="subscription")

urlpatterns = router.urls

"""Regression: founder feature-flag seeding must be race-safe.

`_seed_missing_flags()` runs on every founder GET of the Feature Control Center.
On a cold DB, two near-simultaneous requests (e.g. React's dev double-render)
both see the same "missing" set and both insert the same keys. Without
`ignore_conflicts`, the second `bulk_create` raises a UNIQUE-constraint
IntegrityError and 500s the page (the reported red error). This locks the
race-safe behaviour.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.features.models import FEATURE_DEFINITIONS, FeatureFlag
from apps.features.views import _seed_missing_flags

User = get_user_model()


class SeedMissingFlagsRaceTests(TestCase):
    def test_seed_does_not_raise_when_a_key_already_exists_under_a_stale_snapshot(self):
        definition = FEATURE_DEFINITIONS[0]
        # A flag already exists in the DB...
        FeatureFlag.objects.create(
            key=definition["key"],
            name=definition["name"],
            visibility=definition["default"],
        )
        # ...but the in-request snapshot is stale and reports nothing exists, so
        # seeding tries to (re)insert every key — exactly the concurrent-request
        # race. This must complete without raising.
        with mock.patch.object(FeatureFlag.objects, "values_list", return_value=[]):
            _seed_missing_flags()

        # No duplicate row was created for the pre-existing key.
        self.assertEqual(
            FeatureFlag.objects.filter(key=definition["key"]).count(), 1
        )
        # And the rest of the registry still got seeded.
        self.assertEqual(
            FeatureFlag.objects.count(), len(FEATURE_DEFINITIONS)
        )


class FeatureFlagsReadResilienceTests(APITestCase):
    """The Feature Control Center read must not 500 when the opportunistic seed
    fails — it should still return the flags that already exist."""

    def test_get_returns_flags_even_when_seeding_raises(self):
        admin = User.objects.create_superuser(
            username="founder", email="f@x.com", password="StrongPassword123!DN"
        )
        FeatureFlag.objects.create(
            key="x_existing", name="X Existing", visibility="enabled"
        )
        self.client.force_authenticate(admin)
        with mock.patch(
            "apps.features.views._seed_missing_flags",
            side_effect=RuntimeError("seed boom"),
        ):
            res = self.client.get("/api/v1/founder/feature-flags/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsInstance(res.data, list)
        self.assertTrue(any(f["key"] == "x_existing" for f in res.data))

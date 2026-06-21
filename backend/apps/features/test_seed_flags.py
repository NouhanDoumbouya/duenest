"""Regression: founder feature-flag seeding must be race-safe.

`_seed_missing_flags()` runs on every founder GET of the Feature Control Center.
On a cold DB, two near-simultaneous requests (e.g. React's dev double-render)
both see the same "missing" set and both insert the same keys. Without
`ignore_conflicts`, the second `bulk_create` raises a UNIQUE-constraint
IntegrityError and 500s the page (the reported red error). This locks the
race-safe behaviour.
"""

from unittest import mock

from django.test import TestCase

from apps.features.models import FEATURE_DEFINITIONS, FeatureFlag
from apps.features.views import _seed_missing_flags


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

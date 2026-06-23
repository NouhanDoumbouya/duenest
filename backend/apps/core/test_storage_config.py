"""Tests for provider-neutral storage configuration (config/storage.py)."""

from django.core.files.storage import FileSystemStorage, default_storage
from django.test import SimpleTestCase

from config.storage import build_storages, is_remote_default

_S3_BACKEND = "storages.backends.s3.S3Storage"
_FS_BACKEND = "django.core.files.storage.FileSystemStorage"


def make_get(values):
    """Return a get(key, default) closure backed by a dict of overrides."""
    return lambda key, default="": values.get(key, default)


class BuildStoragesLocalTests(SimpleTestCase):
    def test_defaults_to_local_filesystem(self):
        storages = build_storages(make_get({}))
        self.assertEqual(storages["default"]["BACKEND"], _FS_BACKEND)
        self.assertNotIn("OPTIONS", storages["default"])
        self.assertFalse(is_remote_default(storages))

    def test_explicit_local_backend(self):
        storages = build_storages(make_get({"STORAGE_BACKEND": "local"}))
        self.assertEqual(storages["default"]["BACKEND"], _FS_BACKEND)


class BuildStoragesS3Tests(SimpleTestCase):
    def _r2(self, **overrides):
        values = {
            "STORAGE_BACKEND": "s3",
            "STORAGE_BUCKET_NAME": "duenest-prod",
            "STORAGE_ACCESS_KEY_ID": "akid",
            "STORAGE_SECRET_ACCESS_KEY": "secret",
            "STORAGE_ENDPOINT_URL": "https://acct.r2.cloudflarestorage.com",
            "STORAGE_REGION": "auto",
            "STORAGE_MEDIA_PREFIX": "media/",
        }
        values.update(overrides)
        return build_storages(make_get(values))

    def test_selects_s3_backend(self):
        storages = self._r2()
        self.assertEqual(storages["default"]["BACKEND"], _S3_BACKEND)
        self.assertTrue(is_remote_default(storages))

    def test_maps_neutral_vars_to_storages_options(self):
        opts = self._r2()["default"]["OPTIONS"]
        self.assertEqual(opts["bucket_name"], "duenest-prod")
        self.assertEqual(opts["access_key"], "akid")
        self.assertEqual(opts["secret_key"], "secret")
        self.assertEqual(opts["endpoint_url"], "https://acct.r2.cloudflarestorage.com")
        self.assertEqual(opts["region_name"], "auto")
        self.assertEqual(opts["addressing_style"], "virtual")
        self.assertEqual(opts["signature_version"], "s3v4")

    def test_prefix_becomes_location_without_slashes(self):
        opts = self._r2(STORAGE_MEDIA_PREFIX="/media/")["default"]["OPTIONS"]
        self.assertEqual(opts["location"], "media")

    def test_private_bucket_sends_no_acl(self):
        opts = self._r2(STORAGE_PRIVATE="true")["default"]["OPTIONS"]
        # default_acl is omitted entirely (None) so no canned ACL is sent.
        self.assertNotIn("default_acl", opts)

    def test_private_is_the_default_when_unset(self):
        # Safety: with STORAGE_PRIVATE unset, the bucket is treated as private
        # (no canned ACL) — never accidentally public.
        values = {
            "STORAGE_BACKEND": "s3",
            "STORAGE_BUCKET_NAME": "certanest-prod-documents",
        }
        opts = build_storages(make_get(values))["default"]["OPTIONS"]
        self.assertNotIn("default_acl", opts)
        self.assertTrue(opts["querystring_auth"])  # signed URLs on by default

    def test_certanest_prod_bucket_name_passthrough(self):
        opts = self._r2(STORAGE_BUCKET_NAME="certanest-prod-documents")["default"][
            "OPTIONS"
        ]
        self.assertEqual(opts["bucket_name"], "certanest-prod-documents")

    def test_public_bucket_sets_public_read(self):
        opts = self._r2(STORAGE_PRIVATE="false")["default"]["OPTIONS"]
        self.assertEqual(opts["default_acl"], "public-read")

    def test_signed_urls_toggle(self):
        on = self._r2(STORAGE_SIGNED_URLS="true")["default"]["OPTIONS"]
        off = self._r2(STORAGE_SIGNED_URLS="false")["default"]["OPTIONS"]
        self.assertTrue(on["querystring_auth"])
        self.assertFalse(off["querystring_auth"])
        self.assertEqual(on["querystring_expire"], 300)

    def test_file_overwrite_defaults_false(self):
        self.assertFalse(self._r2()["default"]["OPTIONS"]["file_overwrite"])

    def test_blank_endpoint_and_region_are_dropped_for_aws(self):
        opts = self._r2(STORAGE_ENDPOINT_URL="", STORAGE_REGION="")["default"]["OPTIONS"]
        self.assertNotIn("endpoint_url", opts)
        self.assertNotIn("region_name", opts)


class DefaultStorageSanityTests(SimpleTestCase):
    def test_test_settings_use_local_storage(self):
        # The suite must run on local filesystem storage (no boto3 required).
        self.assertIsInstance(default_storage, FileSystemStorage)

"""
Provider-neutral object-storage configuration for CertaNest.

CertaNest keeps storage *provider-agnostic*. Operators configure storage through
neutral ``STORAGE_*`` environment variables (never AWS-specific names in the
public ``.env.example``); this module maps them to the django-storages S3
backend internally. Any S3-compatible provider works: Cloudflare R2 (preferred
for beta), Railway buckets, AWS S3, MinIO, or other custom S3 endpoints.

Security note: CertaNest stores **app-encrypted ciphertext** in object storage and
streams decrypted bytes through authenticated, ownership-checked Django views.
It never exposes object-storage URLs for file delivery. The S3 backend is still
configured *private by default* (no ACL, signed URLs only) as defense in depth,
so an accidental ``.url`` call can never produce a public, permanent link.

``build_storages`` is a pure function (no Django imports) so it is unit-testable
without applying it to live settings or contacting any provider.
"""

from __future__ import annotations

from typing import Callable

# Django STORAGES backend identifiers.
_FILESYSTEM_BACKEND = "django.core.files.storage.FileSystemStorage"
_S3_BACKEND = "storages.backends.s3.S3Storage"
_STATIC_BACKEND = "django.contrib.staticfiles.storage.StaticFilesStorage"

Getter = Callable[[str, str], str]


def _as_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value: str, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _normalize_prefix(prefix: str) -> str:
    """Return a clean object-key prefix without a leading slash (S3 'location')."""
    cleaned = (prefix or "").strip().strip("/")
    return cleaned


def build_storages(get: Getter) -> dict:
    """
    Build Django's ``STORAGES`` dict from provider-neutral env values.

    ``get(key, default)`` returns the string value for an env var (e.g. a thin
    wrapper around python-decouple's ``config``). Defaults to local filesystem
    storage so development and tests need no configuration and no new
    dependencies (boto3/django-storages are imported only when S3 is selected).
    """
    backend = get("STORAGE_BACKEND", "local").strip().lower()

    if backend != "s3":
        default_storage = {"BACKEND": _FILESYSTEM_BACKEND}
        return {
            "default": default_storage,
            "staticfiles": {"BACKEND": _STATIC_BACKEND},
        }

    private = _as_bool(get("STORAGE_PRIVATE", "true"))
    signed_urls = _as_bool(get("STORAGE_SIGNED_URLS", "true"))

    options: dict = {
        "bucket_name": get("STORAGE_BUCKET_NAME", ""),
        "access_key": get("STORAGE_ACCESS_KEY_ID", ""),
        "secret_key": get("STORAGE_SECRET_ACCESS_KEY", ""),
        # Empty endpoint/region/addressing => let boto3 use its AWS defaults.
        "endpoint_url": get("STORAGE_ENDPOINT_URL", "").strip() or None,
        "region_name": get("STORAGE_REGION", "auto").strip() or None,
        "addressing_style": get("STORAGE_ADDRESSING_STYLE", "virtual").strip() or None,
        # R2 and modern S3 require SigV4.
        "signature_version": get("STORAGE_SIGNATURE_VERSION", "s3v4").strip() or None,
        "file_overwrite": _as_bool(get("STORAGE_FILE_OVERWRITE", "false")),
        "location": _normalize_prefix(get("STORAGE_MEDIA_PREFIX", "media/")),
        # Private by default: send NO ACL (None) so the bucket policy governs
        # access. Many providers (e.g. R2) reject canned ACLs outright.
        "default_acl": None if private else "public-read",
        # If a URL is ever generated, make it a short-lived signed URL — never a
        # public, permanent one.
        "querystring_auth": signed_urls,
        "querystring_expire": _as_int(
            get("STORAGE_SIGNED_URL_EXPIRES_SECONDS", "300"), 300
        ),
    }

    # Drop None values so django-storages falls back to its own defaults instead
    # of receiving an explicit None (matters for endpoint/region on real AWS).
    options = {key: value for key, value in options.items() if value is not None}

    return {
        "default": {"BACKEND": _S3_BACKEND, "OPTIONS": options},
        "staticfiles": {"BACKEND": _STATIC_BACKEND},
    }


def active_default_backend(storages: dict) -> str:
    """Return the dotted path of the configured default storage backend."""
    return storages.get("default", {}).get("BACKEND", _FILESYSTEM_BACKEND)


def is_remote_default(storages: dict) -> bool:
    """True when the default storage is the S3 (object-storage) backend."""
    return active_default_backend(storages) == _S3_BACKEND

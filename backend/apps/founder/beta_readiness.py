"""
Private-beta readiness report (founder/ops only).

An automated, BOOLEAN-ONLY snapshot of whether the platform is configured safely
enough to invite a small controlled group of beta users. It complements — does not
replace — the founder-editable launch checklist (``launch_readiness_summary``) and
the live system status (``build_system_status``), which it reuses so the config
health can never drift.

Hard rule: this report NEVER contains a secret value. It only ever emits booleans,
counts, and safe mode/provider strings ("console"/"resend", "s3"/"local",
"manual"/"stripe", "test"/"live"). It must be safe to print to a terminal, return
to a founder client, or paste into a runbook. It performs only read-only checks —
no email is sent, no AI is called, no Google API is touched, no Stripe object is
created.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

# Flags that must exist (in the registry or DB) for the beta surfaces to be
# governable. Their *visibility* is a deliberate founder choice — we only check
# presence here, never force-enable anything.
BETA_CRITICAL_FLAGS = [
    "documents",
    "ai_features",
    "b2b_portals",
    "redaction_watermarking",
    "integrations",
    "google_integrations",
    "google_drive_import",
    "google_calendar_import",
    "gmail_import",
]

# Known development defaults that must be overridden before a real launch. We only
# ever compare against these to emit a boolean "is still default?" — never the
# live value.
_DEFAULT_AUDIT_SALT = "dev-audit-salt-not-for-production"


def _gate(key: str, label: str, status: str, detail: str) -> dict:
    """One readiness gate. status ∈ {ok, warn, fail, info}."""
    return {"key": key, "label": label, "status": status, "detail": detail}


def _safe(fn, fallback):
    try:
        return fn()
    except Exception:  # noqa: BLE001 - a readiness probe must never crash
        return fallback


def _storage_private_status(system_storage: dict) -> dict:
    backend = system_storage.get("backend", "unknown")
    configured = bool(system_storage.get("configured"))
    if backend == "local":
        return _gate(
            "storage", "Private file storage",
            "warn",
            "Using local disk storage — fine for a dev box, but configure private "
            "R2/S3 before sharing a beta across devices.",
        )
    if not configured:
        return _gate(
            "storage", "Private file storage", "fail",
            "Remote storage backend selected but credentials are missing.",
        )

    def _acl():
        opts = settings.STORAGES["default"].get("OPTIONS", {})
        # default_acl falsy + querystring auth on == private + signed downloads.
        return bool(opts.get("default_acl")), bool(opts.get("querystring_auth", True))

    public_acl, signed = _safe(_acl, (False, True))
    if public_acl:
        return _gate(
            "storage", "Private file storage", "fail",
            "Storage default ACL is public — uploaded documents must NOT be public.",
        )
    return _gate(
        "storage", "Private file storage", "ok",
        f"Remote storage configured and private (signed downloads: {signed}).",
    )


def _stripe_status() -> dict:
    provider = _safe(lambda: getattr(settings, "BILLING_PROVIDER", "manual"), "manual")
    test_mode = _safe(lambda: bool(getattr(settings, "BILLING_TEST_MODE", True)), True)
    if provider != "stripe":
        return _gate(
            "stripe", "Billing in sandbox/manual mode", "ok",
            f"BILLING_PROVIDER={provider} — no live Stripe charges. Correct for beta.",
        )
    if test_mode:
        return _gate(
            "stripe", "Stripe test mode", "ok",
            "Stripe is configured in TEST mode — no live charges.",
        )
    return _gate(
        "stripe", "Stripe mode", "fail",
        "Stripe is in LIVE mode. A private beta must stay in test/sandbox mode.",
    )


def _security_gates() -> list[dict]:
    gates: list[dict] = []

    debug = _safe(lambda: bool(settings.DEBUG), True)
    gates.append(
        _gate("debug", "DEBUG disabled", "ok" if not debug else "warn",
              "DEBUG is off." if not debug
              else "DEBUG is on — must be False in any shared/production environment.")
    )

    has_kek = _safe(
        lambda: bool(getattr(settings, "DUENEST_ACTIVE_KEK_VERSION", ""))
        and bool(getattr(settings, "DUENEST_KEKS", {})),
        False,
    )
    gates.append(
        _gate("encryption_kek", "Field-encryption key configured",
              "ok" if has_kek else "fail",
              "An active KEK is configured — file/token encryption can operate."
              if has_kek
              else "No active encryption KEK — encrypted file/token storage cannot operate.")
    )

    salt = _safe(lambda: getattr(settings, "AUDIT_LOG_HASH_SALT", ""), "")
    salt_ok = bool(salt) and salt != _DEFAULT_AUDIT_SALT
    gates.append(
        _gate("audit_salt", "Audit-log hash salt set", "ok" if salt_ok else "warn",
              "A non-default audit hash salt is configured."
              if salt_ok
              else "Audit-log hash salt is unset or still the dev default — set a unique value.")
    )

    hosts = _safe(lambda: list(getattr(settings, "ALLOWED_HOSTS", [])), [])
    hosts_ok = bool(hosts) and "*" not in hosts
    gates.append(
        _gate("allowed_hosts", "ALLOWED_HOSTS restricted", "ok" if hosts_ok else "warn",
              "ALLOWED_HOSTS is a non-wildcard allowlist."
              if hosts_ok
              else "ALLOWED_HOSTS is empty or wildcard — set explicit hosts for production.")
    )
    return gates


def _flags_status() -> dict:
    from apps.features.models import FEATURE_DEFINITIONS, FeatureFlag

    seeded = _safe(lambda: FeatureFlag.objects.count(), 0)
    registry_keys = {d["key"] for d in FEATURE_DEFINITIONS}
    missing = [k for k in BETA_CRITICAL_FLAGS if k not in registry_keys]
    if missing:
        return _gate(
            "feature_flags", "Beta feature flags present", "fail",
            f"Registry is missing beta-critical flags: {', '.join(missing)}.",
        )
    # Flags fall back to their registry default when not seeded, so a zero count is
    # only a soft warning (run seed_feature_flags to make them DB-editable).
    if seeded == 0:
        return _gate(
            "feature_flags", "Beta feature flags present", "warn",
            "No FeatureFlag rows seeded — run `manage.py seed_feature_flags` so "
            "flags are founder-editable (registry defaults apply until then).",
        )
    return _gate(
        "feature_flags", "Beta feature flags present", "ok",
        f"{seeded} feature flags seeded; all {len(BETA_CRITICAL_FLAGS)} "
        "beta-critical flags are in the registry.",
    )


def _ai_status(system_ai: dict) -> dict:
    configured = bool(system_ai.get("configured"))
    metering = _safe(lambda: bool(getattr(settings, "AI_USAGE_METERING_ENABLED", True)), True)
    guard = _safe(lambda: bool(getattr(settings, "AI_BUDGET_GUARD_ENABLED", True)), True)
    if not configured:
        return _gate(
            "ai", "AI configured", "info",
            "AI provider not configured — AI features fail closed (no paid calls). "
            "This is a safe state for beta.",
        )
    if metering and guard:
        return _gate(
            "ai", "AI configured with caps", "ok",
            "AI is configured with usage metering and the budget guard enabled.",
        )
    return _gate(
        "ai", "AI cost controls", "warn",
        "AI is configured but metering and/or the budget guard is OFF — enable both "
        "before exposing AI to beta users.",
    )


def _founder_status() -> dict:
    User = get_user_model()
    exists = _safe(
        lambda: User.objects.filter(is_staff=True).exists()
        or User.objects.filter(is_superuser=True).exists(),
        False,
    )
    return _gate(
        "founder_user", "Founder/support account exists", "ok" if exists else "fail",
        "At least one staff/superuser account exists to run the founder console."
        if exists
        else "No staff/superuser account — create one to access the founder console.",
    )


def _google_oauth_status() -> dict:
    configured = _safe(
        lambda: bool(
            getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
            and getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "")
            and getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "")
        ),
        False,
    )
    return _gate(
        "google_oauth", "Google OAuth configured", "ok" if configured else "info",
        "Google OAuth is configured — Drive/Calendar import can be connected."
        if configured
        else "Google OAuth not configured — integration pages show 'Not configured' "
        "(safe; import stays unavailable).",
    )


def build_beta_readiness_report(*, include_db_counts: bool = False) -> dict:
    """A safe, automated private-beta readiness snapshot. No secrets, read-only."""
    from .observability import build_system_status

    system = _safe(build_system_status, {})
    components = system.get("components", {})

    gates: list[dict] = []

    # Core infrastructure (reused from the live system status).
    db_ok = bool(components.get("database", {}).get("ok"))
    gates.append(_gate("database", "Database reachable", "ok" if db_ok else "fail",
                       "Database connection OK." if db_ok else "Database is unreachable."))
    cache_ok = bool(components.get("cache", {}).get("ok"))
    gates.append(_gate("cache", "Cache reachable", "ok" if cache_ok else "warn",
                       "Cache OK." if cache_ok else "Cache backend unreachable (degraded, not fatal)."))

    gates.append(_storage_private_status(components.get("storage", {})))

    email = components.get("email", {})
    email_ok = bool(email.get("configured"))
    provider = email.get("provider", "console")
    if provider == "console":
        gates.append(_gate("email", "Email delivery configured", "warn",
                           "Email backend is 'console' (no real delivery). Configure a "
                           "provider (e.g. Resend) before inviting users."))
    else:
        gates.append(_gate("email", "Email delivery configured", "ok" if email_ok else "fail",
                           f"Email provider '{provider}' configured."
                           if email_ok else f"Email provider '{provider}' selected but not configured."))

    gates.append(_ai_status(components.get("ai", {})))
    gates.append(_flags_status())
    gates.append(_founder_status())
    gates.append(_stripe_status())
    gates.append(_google_oauth_status())
    gates.extend(_security_gates())

    # Operational health (counts only).
    counts = system.get("counts", {})
    jobs = system.get("jobs_summary", {})
    critical = int(counts.get("unresolved_critical_events", 0) or 0)
    gates.append(_gate(
        "critical_events", "No unresolved critical events",
        "ok" if critical == 0 else "warn",
        "No unresolved critical operational events."
        if critical == 0 else f"{critical} unresolved critical event(s) — review in observability.",
    ))
    failing = int(jobs.get("scheduled_jobs_failing", 0) or 0)
    stale = int(jobs.get("scheduled_jobs_stale", 0) or 0)
    gates.append(_gate(
        "scheduled_jobs", "Scheduled jobs healthy",
        "ok" if failing == 0 and stale == 0 else "warn",
        "Scheduled jobs are healthy."
        if failing == 0 and stale == 0
        else f"{failing} failing / {stale} stale scheduled job(s) — a scheduler/cron may be missing.",
    ))

    fails = sum(1 for g in gates if g["status"] == "fail")
    warns = sum(1 for g in gates if g["status"] == "warn")
    if fails:
        overall = "blocked"
    elif warns:
        overall = "attention"
    else:
        overall = "ready"

    report = {
        "generated_at": timezone.now().isoformat(),
        "overall": overall,
        "summary": {
            "ok": sum(1 for g in gates if g["status"] == "ok"),
            "info": sum(1 for g in gates if g["status"] == "info"),
            "warn": warns,
            "fail": fails,
            "total": len(gates),
        },
        "gates": gates,
        # Reuse the live snapshot so the founder sees the same numbers everywhere.
        "system_overall": system.get("overall"),
    }
    if include_db_counts:
        report["counts"] = counts
    return report

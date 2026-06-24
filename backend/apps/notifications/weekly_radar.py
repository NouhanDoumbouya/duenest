"""
Weekly Radar Email V1 — a deterministic weekly summary that brings users back to
CertaNest with what needs attention.

Reuses the Life Radar service (`apps.documents.life_radar.build_life_radar`) as the
single source of truth: expiring documents, upcoming/overdue deadlines, incomplete
packs, applications needing attention, Magic Inbox items to review, emergency
access state, and storage warnings. Deterministic — **no AI call and no AI
credits**. Owner-scoped; the email never includes document contents, private file
URLs, passport/ID numbers, or attachments — only titles, counts, dates, and app
routes.

Sending flows through ``common.email.send_branded_email`` (suppression-aware,
EmailLog-logged, one-click unsubscribe). Eligibility respects the opt-in
``NotificationPreference.weekly_radar_email_enabled`` flag, ``email_enabled``,
active users with a valid address, and a weekly dedupe window.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

EMAIL_TYPE = "weekly_radar_email"
EMAIL_TEMPLATE = "weekly_radar"
_DEDUPE_DAYS = 6
_MAX_PRIORITIES = 5
_URGENT_SEVERITIES = {"expired", "urgent", "overdue"}


# ---- Context (deterministic; reuses Life Radar) -----------------------------


def build_weekly_radar_context(user) -> dict:
    """
    Build the email context for ``user`` from the Life Radar payload.

    Pure/deterministic; never raises (Life Radar itself never raises). Returns a
    safe, email-ready dict: readiness score/label, prioritized attention items,
    one suggested next action (a CTA + app route), compact detail sections, the
    subject, and footer routes. No sensitive data, no file URLs.
    """
    from apps.documents.life_radar import build_life_radar

    radar = build_life_radar(user)
    summary = radar.get("summary", {})
    sections = radar.get("sections", {})
    base = _base_url()

    priorities = _top_priorities(summary, sections)
    urgent_count = sum(1 for p in priorities if p["severity"] in _URGENT_SEVERITIES)
    next_action = _next_action(summary, sections, base)

    has_attention = bool(priorities)
    subject = (
        f"{len(priorities)} {_things(len(priorities))} need attention in CertaNest"
        if urgent_count
        else "Your CertaNest Weekly Radar"
    )

    return {
        "subject": subject,
        "user_name": (user.first_name or "").strip(),
        "score": radar.get("score"),
        "label": radar.get("label", ""),
        "is_empty": radar.get("is_empty", False),
        "urgent_count": urgent_count,
        "attention_count": len(priorities),
        "has_attention": has_attention,
        "top_priorities": priorities,
        "next_action": next_action,
        # Compact, non-sensitive detail rows (titles + short detail only).
        "details": _detail_sections(summary, sections),
        "tagline": "Ready when life asks.",
        "action_url": next_action["url"],
        "preferences_url": f"{base}/dashboard/settings",
    }


def _top_priorities(summary: dict, sections: dict) -> list[dict]:
    """A prioritized, deterministic list of up to 5 attention items as plain,
    non-sensitive lines (title + severity). Highest-urgency first."""
    out: list[dict] = []

    # 1) Expired / expiring documents (expired + urgent first).
    for doc in sections.get("expiring_documents", []):
        sev = doc.get("severity")
        if sev not in ("expired", "urgent", "soon"):
            continue
        days = doc.get("days_remaining")
        if sev == "expired":
            detail = "Expired — renew to stay ready"
        elif days is not None:
            detail = f"Expires in {days} day{_s(days)}"
        else:
            detail = "Expiring soon"
        out.append(_priority(doc.get("title", "A document"), detail,
                             "expired" if sev == "expired" else "urgent" if sev == "urgent" else "soon"))

    # 2) Overdue + urgent upcoming deadlines.
    for dl in sections.get("upcoming_deadlines", []):
        sev = dl.get("severity")
        days = dl.get("days_remaining")
        if sev == "urgent" or (isinstance(days, int) and days <= 7):
            label = dl.get("document_title") or dl.get("title") or "A deadline"
            if isinstance(days, int) and days < 0:
                out.append(_priority(label, f"Overdue by {abs(days)} day{_s(abs(days))}", "overdue"))
            elif isinstance(days, int):
                out.append(_priority(label, f"Deadline in {days} day{_s(days)}", "urgent"))

    # 3) Incomplete packs missing required documents.
    for pack in sections.get("incomplete_packs", []):
        missing = pack.get("missing_count") or 0
        if missing:
            out.append(_priority(
                pack.get("title", "An application pack"),
                f"Missing {missing} document{_s(missing)}", "attention",
            ))

    # 4) Applications needing attention (counts only — deterministic).
    urgent_apps = summary.get("urgent_applications") or 0
    if urgent_apps:
        out.append(_priority(
            "Applications need attention",
            f"{urgent_apps} application{_s(urgent_apps)} ready or overdue",
            "attention",
        ))

    # 5) Magic Inbox items waiting for review.
    needs_review = summary.get("inbox_needs_review_count") or 0
    if needs_review:
        out.append(_priority(
            "Magic Inbox items waiting for review",
            f"{needs_review} item{_s(needs_review)} to review",
            "attention",
        ))

    return out[:_MAX_PRIORITIES]


def _next_action(summary: dict, sections: dict, base: str) -> dict:
    """One clear CTA derived from Life Radar's top suggested action (mapped to an
    app route), with Magic-Inbox / Life-Radar fallbacks. App routes only."""
    actions = sections.get("suggested_actions") or []
    if actions:
        a = actions[0]
        return {"label": a.get("label") or "Open Life Radar",
                "url": _route_for_action(a, base)}
    if (summary.get("inbox_needs_review_count") or 0) > 0:
        return {"label": "Review Magic Inbox", "url": f"{base}/dashboard/inbox"}
    return {"label": "Open Life Radar", "url": f"{base}/dashboard"}


def _route_for_action(action: dict, base: str) -> str:
    kind = action.get("action")
    doc_id = action.get("document_id")
    bundle_id = action.get("bundle_id")
    routes = {
        "view_document": f"{base}/dashboard/documents/{doc_id}" if doc_id else f"{base}/dashboard/vault",
        "continue_pack": f"{base}/dashboard/bundles/{bundle_id}" if bundle_id else f"{base}/dashboard/bundles",
        "setup_emergency": f"{base}/dashboard/emergency",
        "view_applications": f"{base}/dashboard/applications",
        "create_pack": f"{base}/dashboard/bundles/new",
        "upload_document": f"{base}/dashboard/vault",
        "create_reminder": f"{base}/dashboard/reminders",
        "upgrade_plan": f"{base}/dashboard/settings/billing",
    }
    return routes.get(kind, f"{base}/dashboard")


def _detail_sections(summary: dict, sections: dict) -> list[dict]:
    """Compact, non-sensitive detail blocks for the email body (titles/counts)."""
    out: list[dict] = []

    def block(title, rows):
        rows = [r for r in rows if r]
        if rows:
            out.append({"title": title, "rows": rows[:5]})

    block("Expiring soon", [
        d.get("title") + (f" — {d['days_remaining']} day{_s(d['days_remaining'])} left"
                          if isinstance(d.get("days_remaining"), int) and d["days_remaining"] >= 0
                          else " — expired")
        for d in sections.get("expiring_documents", [])
        if d.get("severity") in ("expired", "urgent", "soon")
    ])
    block("Upcoming deadlines", [
        (d.get("document_title") or d.get("title"))
        + (f" — in {d['days_remaining']} day{_s(d['days_remaining'])}"
           if isinstance(d.get("days_remaining"), int) else "")
        for d in sections.get("upcoming_deadlines", [])
    ])
    block("Incomplete packs", [
        f"{p.get('title')} — {p.get('missing_count') or 0} missing"
        for p in sections.get("incomplete_packs", [])
        if (p.get("missing_count") or 0) > 0
    ])
    inbox = summary.get("inbox_needs_review_count") or 0
    if inbox:
        block("Magic Inbox", [f"{inbox} item{_s(inbox)} waiting for review"])
    if not summary.get("emergency_ready", False):
        block("Emergency access", ["Not configured yet — set up trusted access"])
    return out


# ---- Eligibility ------------------------------------------------------------


def should_send_weekly_radar(user, *, now=None, dedupe_days: int = _DEDUPE_DAYS) -> bool:
    """
    Whether ``user`` is eligible for a Weekly Radar email right now.

    Requires: active user with a valid email; opted in
    (``weekly_radar_email_enabled``) with email delivery on; and no Weekly Radar
    already sent within ``dedupe_days`` (checked via EmailLog, so a weekly beat +
    an accidental rerun never double-sends). Suppression/unsubscribe are enforced
    later inside ``send_branded_email``.
    """
    if not getattr(user, "is_active", False) or not getattr(user, "email", ""):
        return False

    from .models import EmailLog, NotificationPreference

    pref = NotificationPreference.objects.filter(user=user).first()
    if pref is None or not pref.weekly_radar_email_enabled or not pref.email_enabled:
        return False

    now = now or timezone.now()
    cutoff = now - timedelta(days=dedupe_days)
    already = EmailLog.objects.filter(
        recipient__iexact=user.email,
        email_type=EMAIL_TYPE,
        status="sent",
        created_at__gte=cutoff,
    ).exists()
    return not already


# ---- Render + send ----------------------------------------------------------


def render_weekly_radar_email(user, context: dict | None = None) -> dict:
    """Render the email to ``{subject, html, text}`` (deterministic). Useful for
    previews/tests; the actual send re-renders through ``send_branded_email``."""
    context = context or build_weekly_radar_context(user)
    ctx = {"subject": context["subject"], **context}
    return {
        "subject": context["subject"],
        "html": render_to_string(f"emails/{EMAIL_TEMPLATE}.html", ctx),
        "text": render_to_string(f"emails/{EMAIL_TEMPLATE}.txt", ctx),
    }


def send_weekly_radar_email(user, *, dry_run: bool = False, force: bool = False) -> dict:
    """
    Send one Weekly Radar email. Honors eligibility unless ``force`` (used for
    previews/tests of the send path). Returns ``{status, subject?}`` where status
    is ``sent`` / ``skipped`` / ``failed`` / ``dry_run``. No AI, no credits.
    """
    if not force and not should_send_weekly_radar(user):
        return {"status": "skipped", "reason": "ineligible"}

    context = build_weekly_radar_context(user)
    if dry_run:
        return {"status": "dry_run", "subject": context["subject"],
                "attention_count": context["attention_count"]}

    from common.email import send_branded_email

    ok = send_branded_email(
        subject=context["subject"],
        template=EMAIL_TEMPLATE,
        context=context,
        to=user.email,
        email_type=EMAIL_TYPE,
        category="lifecycle",
    )
    return {"status": "sent" if ok else "failed", "subject": context["subject"]}


def send_weekly_radar_batch(*, dry_run: bool = False, limit: int | None = None) -> dict:
    """
    Send Weekly Radar to all eligible, opted-in users. A failure on one recipient
    never aborts the batch (each send is isolated). Returns summary counts.
    """
    from .models import NotificationPreference

    prefs = (
        NotificationPreference.objects.filter(
            weekly_radar_email_enabled=True, email_enabled=True
        )
        .select_related("user")
        .order_by("user_id")
    )

    sent = skipped = failed = 0
    processed = 0
    for pref in prefs.iterator():
        if limit is not None and processed >= limit:
            break
        user = pref.user
        if not should_send_weekly_radar(user):
            skipped += 1
            continue
        processed += 1
        try:
            result = send_weekly_radar_email(user, dry_run=dry_run, force=True)
        except Exception:  # noqa: BLE001 — one bad recipient must not abort the batch
            failed += 1
            continue
        status = result.get("status")
        if status in ("sent", "dry_run"):
            sent += 1
        elif status == "failed":
            failed += 1
        else:
            skipped += 1

    return {"sent": sent, "skipped": skipped, "failed": failed,
            "dry_run": dry_run, "processed": processed}


# ---- Small helpers ----------------------------------------------------------


def _priority(title: str, detail: str, severity: str) -> dict:
    return {"title": str(title)[:160], "detail": str(detail)[:160], "severity": severity}


def _base_url() -> str:
    return (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")


def _s(n) -> str:
    try:
        return "" if abs(int(n)) == 1 else "s"
    except (TypeError, ValueError):
        return "s"


def _things(n) -> str:
    return "thing" if n == 1 else "things"

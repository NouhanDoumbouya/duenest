"""
Integration OAuth scope strategy.

Future-safe, but intentionally conservative. CertaNest integrations are
**import-only** and **not built yet** in this branch — these scope groups exist so
that a future import flow requests the narrowest practical read-only access, and
so the UI can explain what each connection would allow.

Rules baked in here:

* No scope group is requested unless the user explicitly chooses it.
* Gmail is privacy-sensitive and is NEVER part of a default selection.
* Every scope below is read-only. No write/modify/delete scopes exist.
"""

from __future__ import annotations

# Base identity scopes — always requested so we can identify the connected
# account (the Google "sub" + email). These never read documents/mail/calendar.
GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"]


# Each scope group is one user-selectable capability. ``default`` controls
# whether it may be part of a "connect everything sensible" selection; Gmail is
# deliberately False (must be chosen on its own, deliberately).
GOOGLE_SCOPE_GROUPS: dict[str, dict] = {
    "drive": {
        "label": "Google Drive import",
        "description": "Read-only access to import documents you choose. CertaNest never edits or deletes your Drive files.",
        # Read-only; import flow (not in this branch) would read selected files.
        "scopes": ["https://www.googleapis.com/auth/drive.readonly"],
        "privacy_sensitive": False,
        "default": True,
        "status": "coming_soon",
    },
    "calendar": {
        "label": "Google Calendar import",
        "description": "Read-only access to import deadlines/events you choose. CertaNest never edits your calendar.",
        "scopes": ["https://www.googleapis.com/auth/calendar.readonly"],
        "privacy_sensitive": False,
        "default": True,
        "status": "coming_soon",
    },
    "gmail": {
        "label": "Gmail attachment import",
        "description": "Read-only access to import attachments you choose. Privacy-sensitive — requested only when you explicitly pick Gmail.",
        "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
        "privacy_sensitive": True,
        "default": False,
        "status": "coming_soon",
    },
}

# Map a scope group to the feature flag that will gate its (future) import flow.
GOOGLE_SCOPE_GROUP_FLAGS = {
    "drive": "google_drive_import",
    "calendar": "google_calendar_import",
    "gmail": "gmail_import",
}


def known_scope_groups(provider: str) -> set[str]:
    if provider == "google":
        return set(GOOGLE_SCOPE_GROUPS)
    return set()


def resolve_google_scopes(scope_groups: list[str]) -> list[str]:
    """Identity scopes + the read-only scopes for each requested group.

    Unknown groups are ignored. The result is de-duplicated and order-stable.
    """
    out: list[str] = list(GOOGLE_IDENTITY_SCOPES)
    for group in scope_groups:
        meta = GOOGLE_SCOPE_GROUPS.get(group)
        if not meta:
            continue
        for scope in meta["scopes"]:
            if scope not in out:
                out.append(scope)
    return out


def google_scope_group_cards() -> list[dict]:
    """Safe, UI-facing description of each Google scope group (no secrets)."""
    return [
        {
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "privacy_sensitive": meta["privacy_sensitive"],
            "status": meta["status"],
        }
        for key, meta in GOOGLE_SCOPE_GROUPS.items()
    ]

"""
Smart Profile V1 — reusable application data + completeness (DETERMINISTIC, NO AI).

Smart Profile lets a user store identity, education, work, skills, achievements,
and common application answers once, then reuse them across applications, packs,
letters, CVs, and forms later. This module computes the unified profile payload,
a deterministic completeness score, and an application-context object that future
AI features can consume — **without making any AI call here**.

Privacy: the most-sensitive identity/document values (passport number, national
ID) live in the existing **encrypted** ``UserProfileDetails`` store and are NOT
duplicated or returned by Smart Profile — only their presence (booleans) is used
for completeness. Everything is strictly owner-scoped.
"""

from __future__ import annotations

from .models import (
    SmartProfile,
    SmartProfileAchievement,
    SmartProfileCommonAnswer,
    SmartProfileEducation,
    SmartProfileSkill,
    SmartProfileWork,
    UserProfileDetails,
)

_LABELS = (
    (90, "Ready to reuse"),
    (70, "Mostly ready"),
    (40, "Getting ready"),
    (0, "Incomplete"),
)


def completeness_label(score: int) -> str:
    for threshold, label in _LABELS:
        if score >= threshold:
            return label
    return "Incomplete"


def get_or_create_smart_profile(user) -> SmartProfile:
    profile, _ = SmartProfile.objects.get_or_create(user=user)
    return profile


def _identity_details(user) -> dict:
    """Non-secret identity fields + document presence flags (owner-only)."""
    row = UserProfileDetails.objects.filter(user=user).first()
    details = row.get_details() if row else {}
    address_parts = [
        details.get("address_street", ""),
        details.get("address_city", ""),
        details.get("address_region", ""),
        details.get("address_postal_code", ""),
        details.get("address_country", ""),
    ]
    return {
        "legal_full_name": details.get("legal_name", ""),
        "preferred_name": details.get("preferred_name", ""),
        "date_of_birth": details.get("date_of_birth", ""),
        "nationality": details.get("nationality", ""),
        "phone_number": details.get("phone", ""),
        "address_on_file": any(p.strip() for p in address_parts),
        # Presence only — the actual numbers stay in the encrypted store.
        "has_passport_number": bool(details.get("passport_number", "").strip()),
        "has_national_id": bool(details.get("national_id", "").strip()),
    }


def build_smart_profile_completeness(user) -> dict:
    """Deterministic 0–100 completeness across the eight profile sections."""
    profile = get_or_create_smart_profile(user)
    identity = _identity_details(user)

    has_education = SmartProfileEducation.objects.filter(owner=user).exists()
    has_work = SmartProfileWork.objects.filter(owner=user).exists()
    has_skills = SmartProfileSkill.objects.filter(owner=user).exists()
    has_achievements = SmartProfileAchievement.objects.filter(owner=user).exists()

    basic_ok = bool(identity["legal_full_name"] and identity["nationality"])
    contact_ok = bool(identity["phone_number"] or profile.email_for_applications)
    address_ok = bool(
        identity["address_on_file"]
        or profile.current_address.strip()
        or profile.permanent_address.strip()
    )
    emergency_ok = bool(
        profile.emergency_contact_name and profile.emergency_contact_phone
    )

    sections = [
        {
            "key": "basic_identity",
            "label": "Basic identity",
            "complete": basic_ok,
            "missing_fields": []
            if basic_ok
            else ["Add your legal name and nationality"],
        },
        {
            "key": "contact_details",
            "label": "Contact details",
            "complete": contact_ok,
            "missing_fields": []
            if contact_ok
            else ["Add a phone number or application email"],
        },
        {
            "key": "address",
            "label": "Address",
            "complete": address_ok,
            "missing_fields": [] if address_ok else ["Add a current address"],
        },
        {
            "key": "education",
            "label": "Education",
            "complete": has_education,
            "missing_fields": []
            if has_education
            else ["Add at least one education entry"],
        },
        {
            "key": "work",
            "label": "Work / experience",
            "complete": has_work,
            "missing_fields": []
            if has_work
            else ["Add at least one work or experience entry"],
        },
        {
            "key": "skills",
            "label": "Skills",
            "complete": has_skills,
            "missing_fields": [] if has_skills else ["Add a few skills"],
        },
        {
            "key": "achievements",
            "label": "Achievements",
            "complete": has_achievements,
            "missing_fields": []
            if has_achievements
            else ["Add an achievement or award"],
        },
        {
            "key": "emergency_contact",
            "label": "Emergency contact",
            "complete": emergency_ok,
            "missing_fields": []
            if emergency_ok
            else ["Add an emergency contact name and phone"],
        },
    ]

    complete_count = sum(1 for s in sections if s["complete"])
    score = max(0, min(100, round(complete_count / len(sections) * 100)))

    return {
        "score": score,
        "label": completeness_label(score),
        "sections": sections,
        "next_actions": _next_actions_from_sections(sections),
    }


_ACTION_FOR_SECTION = {
    "basic_identity": ("add_basic_identity", "Add your legal name and nationality", "high"),
    "contact_details": ("add_contact", "Add contact details", "high"),
    "address": ("add_address", "Add your address", "medium"),
    "education": ("add_education", "Add your education history", "high"),
    "work": ("add_work", "Add your work or experience", "medium"),
    "skills": ("add_skills", "Add your skills", "low"),
    "achievements": ("add_achievement", "Add an achievement", "low"),
    "emergency_contact": ("add_emergency_contact", "Add an emergency contact", "low"),
}
_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _next_actions_from_sections(sections: list[dict]) -> list[dict]:
    actions = []
    for section in sections:
        if section["complete"]:
            continue
        mapping = _ACTION_FOR_SECTION.get(section["key"])
        if not mapping:
            continue
        action_type, label, priority = mapping
        actions.append({"type": action_type, "label": label, "priority": priority})
    actions.sort(key=lambda a: _PRIORITY_RANK.get(a["priority"], 9))
    return actions


def get_smart_profile_next_actions(user) -> list[dict]:
    return build_smart_profile_completeness(user)["next_actions"]


def _entry_dicts(user):
    """Owner-scoped reusable entries, as plain dicts for payload + context."""
    education = [
        {
            "id": e.id,
            "institution_name": e.institution_name,
            "degree_or_program": e.degree_or_program,
            "field_of_study": e.field_of_study,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "currently_studying": e.currently_studying,
            "grade_or_cgpa": e.grade_or_cgpa,
            "country": e.country,
            "description": e.description,
            "sort_order": e.sort_order,
        }
        for e in SmartProfileEducation.objects.filter(owner=user)
    ]
    work = [
        {
            "id": w.id,
            "organization_name": w.organization_name,
            "role_title": w.role_title,
            "start_date": w.start_date.isoformat() if w.start_date else None,
            "end_date": w.end_date.isoformat() if w.end_date else None,
            "currently_working": w.currently_working,
            "location": w.location,
            "description": w.description,
            "achievements": w.achievements,
            "sort_order": w.sort_order,
        }
        for w in SmartProfileWork.objects.filter(owner=user)
    ]
    skills = [
        {
            "id": s.id,
            "name": s.name,
            "category": s.category,
            "proficiency": s.proficiency,
            "sort_order": s.sort_order,
        }
        for s in SmartProfileSkill.objects.filter(owner=user)
    ]
    achievements = [
        {
            "id": a.id,
            "title": a.title,
            "category": a.category,
            "date": a.date.isoformat() if a.date else None,
            "description": a.description,
            "related_document": a.related_document_id,
            "sort_order": a.sort_order,
        }
        for a in SmartProfileAchievement.objects.filter(owner=user)
    ]
    common_answers = [
        {
            "id": c.id,
            "prompt": c.prompt,
            "answer": c.answer,
            "category": c.category,
            "sort_order": c.sort_order,
        }
        for c in SmartProfileCommonAnswer.objects.filter(owner=user)
    ]
    return education, work, skills, achievements, common_answers


def build_smart_profile_payload(user) -> dict:
    """Unified, owner-only Smart Profile payload (deterministic, no AI)."""
    profile = get_or_create_smart_profile(user)
    identity = _identity_details(user)
    education, work, skills, achievements, common_answers = _entry_dicts(user)
    completeness = build_smart_profile_completeness(user)

    # Keep the cached completeness fresh on read.
    if profile.profile_completeness != completeness["score"]:
        profile.profile_completeness = completeness["score"]
        profile.save(update_fields=["profile_completeness", "updated_at"])

    return {
        "identity": identity,  # read-only here; edited via /users/me/profile-details/
        "extras": {
            "email_for_applications": profile.email_for_applications,
            "country_of_residence": profile.country_of_residence,
            "current_address": profile.current_address,
            "permanent_address": profile.permanent_address,
            "passport_expiry_date": profile.passport_expiry_date.isoformat()
            if profile.passport_expiry_date
            else None,
            "emergency_contact_name": profile.emergency_contact_name,
            "emergency_contact_relationship": profile.emergency_contact_relationship,
            "emergency_contact_phone": profile.emergency_contact_phone,
        },
        "education": education,
        "work": work,
        "skills": skills,
        "achievements": achievements,
        "common_answers": common_answers,
        "completeness": completeness,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


def build_application_context_from_profile(user, application=None) -> dict:
    """
    Deterministic context object (profile + application + pack) for future AI
    document generation. **Makes no AI call.** Never exposes passport/ID numbers
    or private file URLs. Internal helper — not a public endpoint in V1.
    """
    identity = _identity_details(user)
    profile = get_or_create_smart_profile(user)
    education, work, skills, achievements, common_answers = _entry_dicts(user)

    context = {
        "profile": {
            "name": identity["legal_full_name"],
            "preferred_name": identity["preferred_name"],
            "nationality": identity["nationality"],
            "country_of_residence": profile.country_of_residence,
            "email_for_applications": profile.email_for_applications,
            "education": education,
            "work": work,
            "skills": skills,
            "achievements": achievements,
            "common_answers": common_answers,
        },
        "application": None,
        "pack": None,
    }

    if application is not None and getattr(application, "owner_id", None) == user.id:
        context["application"] = {
            "title": application.title,
            "type": application.application_type,
            "deadline": application.deadline_date.isoformat()
            if application.deadline_date
            else None,
        }
        bundle = application.linked_bundle
        if bundle is not None:
            from apps.documents.pack_readiness import build_pack_readiness

            readiness = build_pack_readiness(bundle, user)
            context["pack"] = {
                "name": readiness["name"],
                "readiness_score": readiness["score"],
                "missing_documents": [
                    r["title"] for r in readiness["missing_requirements"]
                ],
            }

    return context

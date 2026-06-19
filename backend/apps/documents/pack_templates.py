"""
Generic application-pack templates.

These are *suggestions only* to give a new bundle a useful starting checklist.
Nothing here is official: requirements vary by country, institution, employer,
and individual circumstances, and the disclaimer is surfaced to the user in the
UI and is carried on every template. Items are fully editable after seeding —
the user can rename, remove, reorder, and toggle required/optional.

A template maps to an existing ``DocumentBundle.BundleType`` and provides an
ordered list of requirement seeds. Seeding creates real
``DocumentBundleRequirement`` rows (the same model used everywhere else), so the
readiness calculation and all existing bundle flows work unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import DocumentBundle, DocumentBundleRequirement


# Shown on every template and stored with each seeded bundle's first activity
# event. Keep it short, honest, and non-official.
TEMPLATE_DISCLAIMER = (
    "Common documents people often prepare. Requirements vary — always verify "
    "with the official institution or source."
)


@dataclass(frozen=True)
class RequirementSeed:
    title: str
    is_required: bool


@dataclass(frozen=True)
class PackTemplate:
    key: str
    label: str
    description: str
    bundle_type: str
    items: tuple[RequirementSeed, ...]


# Ordered, generic checklists. "Other supporting document" is intentionally
# optional everywhere. ``custom`` seeds nothing (a deliberately blank pack).
PACK_TEMPLATES: tuple[PackTemplate, ...] = (
    PackTemplate(
        key="scholarship",
        label="Scholarship application",
        description="Common documents people often prepare for a scholarship.",
        bundle_type=DocumentBundle.BundleType.SCHOLARSHIP,
        items=(
            RequirementSeed("Passport / ID", True),
            RequirementSeed("Academic transcript", True),
            RequirementSeed("Certificate / diploma", True),
            RequirementSeed("CV / resume", True),
            RequirementSeed("Motivation letter", True),
            RequirementSeed("Recommendation letter", True),
            RequirementSeed("Proof of enrollment / admission", True),
            RequirementSeed("Financial documents", False),
            RequirementSeed("Other supporting document", False),
        ),
    ),
    PackTemplate(
        key="visa",
        label="Visa application",
        description="Common documents people often prepare for a visa.",
        bundle_type=DocumentBundle.BundleType.APPLICATION,
        items=(
            RequirementSeed("Passport", True),
            RequirementSeed("Passport photo", True),
            RequirementSeed("Visa form", True),
            RequirementSeed("Admission / work / invitation letter", True),
            RequirementSeed("Financial proof", True),
            RequirementSeed("Travel itinerary", False),
            RequirementSeed("Accommodation proof", False),
            RequirementSeed("Insurance", False),
            RequirementSeed("Previous visa / residence permit", False),
            RequirementSeed("Other supporting document", False),
        ),
    ),
    PackTemplate(
        key="university",
        label="University application",
        description="Common documents people often prepare for a university application.",
        bundle_type=DocumentBundle.BundleType.APPLICATION,
        items=(
            RequirementSeed("Passport / ID", True),
            RequirementSeed("Transcript", True),
            RequirementSeed("Certificate / diploma", True),
            RequirementSeed("CV / resume", False),
            RequirementSeed("Motivation / personal statement", True),
            RequirementSeed("Recommendation letter", True),
            RequirementSeed("English / language test", False),
            RequirementSeed("Portfolio / research proposal", False),
            RequirementSeed("Other supporting document", False),
        ),
    ),
    PackTemplate(
        key="job",
        label="Job application",
        description="Common documents people often prepare for a job application.",
        bundle_type=DocumentBundle.BundleType.APPLICATION,
        items=(
            RequirementSeed("CV / resume", True),
            RequirementSeed("Cover letter", True),
            RequirementSeed("Passport / ID", True),
            RequirementSeed("Certificates", False),
            RequirementSeed("Transcript", False),
            RequirementSeed("Portfolio", False),
            RequirementSeed("Recommendation / reference letter", False),
            RequirementSeed("Work permit / visa document", False),
            RequirementSeed("Other supporting document", False),
        ),
    ),
    PackTemplate(
        key="travel",
        label="Travel documents",
        description="Common documents people often prepare for travel.",
        bundle_type=DocumentBundle.BundleType.TRAVEL,
        items=(
            RequirementSeed("Passport", True),
            RequirementSeed("Visa", False),
            RequirementSeed("Ticket / itinerary", True),
            RequirementSeed("Hotel / accommodation", False),
            RequirementSeed("Insurance", False),
            RequirementSeed("Emergency contacts", False),
            RequirementSeed("Important IDs", False),
            RequirementSeed("Other supporting document", False),
        ),
    ),
    PackTemplate(
        key="renewal",
        label="Renewal documents",
        description="Common documents people often prepare for a renewal.",
        bundle_type=DocumentBundle.BundleType.RENEWAL,
        items=(
            RequirementSeed("Current document", True),
            RequirementSeed("Old version", False),
            RequirementSeed("New application form", True),
            RequirementSeed("Supporting proof", False),
            RequirementSeed("Payment receipt", False),
            RequirementSeed("Appointment confirmation", False),
            RequirementSeed("Other supporting document", False),
        ),
    ),
    PackTemplate(
        key="custom",
        label="Custom pack",
        description="Start blank and add your own checklist items.",
        bundle_type=DocumentBundle.BundleType.CUSTOM,
        items=(),
    ),
)

_TEMPLATES_BY_KEY: dict[str, PackTemplate] = {t.key: t for t in PACK_TEMPLATES}


def get_pack_template(key: str) -> PackTemplate | None:
    """Return the template for ``key`` or ``None`` if unknown."""
    return _TEMPLATES_BY_KEY.get(key)


def seed_bundle_requirements(bundle: DocumentBundle, template: PackTemplate) -> int:
    """
    Create requirement rows on ``bundle`` from ``template``. Returns the number
    of requirements created. A blank template (custom) creates nothing.

    Safe to call only on a freshly created bundle; it always appends, so the
    caller is responsible for not double-seeding.
    """
    if not template.items:
        return 0
    rows = [
        DocumentBundleRequirement(
            owner=bundle.owner,
            bundle=bundle,
            title=seed.title,
            is_required=seed.is_required,
            requirement_type=DocumentBundleRequirement.RequirementType.DOCUMENT,
            status=DocumentBundleRequirement.Status.MISSING,
            sort_order=index,
        )
        for index, seed in enumerate(template.items)
    ]
    DocumentBundleRequirement.objects.bulk_create(rows)
    return len(rows)


def serialize_pack_templates() -> list[dict]:
    """Public, safe representation for the template picker (no secrets)."""
    return [
        {
            "key": t.key,
            "label": t.label,
            "description": t.description,
            "bundle_type": t.bundle_type,
            "disclaimer": TEMPLATE_DISCLAIMER,
            "items": [
                {"title": s.title, "is_required": s.is_required} for s in t.items
            ],
        }
        for t in PACK_TEMPLATES
    ]

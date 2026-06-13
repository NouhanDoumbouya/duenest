"""
Seed (or refresh) the shared system checklist templates.

Idempotent: templates are keyed by ``slug`` so re-running updates the existing
rows and their items instead of creating duplicates. Run with:

    python manage.py seed_checklist_templates
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.documents.models import (
    DocumentChecklistItemTemplate,
    DocumentChecklistTemplate,
)

# Each template: metadata + an ordered list of (title, is_required, offset_days,
# description) items. ``offset_days`` is days before the checklist due date.
SYSTEM_TEMPLATES = [
    {
        "slug": "passport-renewal",
        "title": "Passport renewal checklist",
        "description": "Everything you need to renew a passport without surprises.",
        "document_type": "passport",
        "checklist_type": "renewal",
        "sort_order": 10,
        "items": [
            ("Current/expiring passport", True, 30, "Locate your existing passport."),
            ("Recent passport photo", True, 21, "Meet the official photo spec."),
            ("Proof of identity", True, 21, "National ID or birth certificate."),
            ("Completed application form", True, 14, "Fill in the renewal form."),
            ("Renewal fee ready", True, 14, "Confirm the current fee and payment method."),
            ("Supporting documents", False, 14, "Name-change or other supporting papers."),
        ],
    },
    {
        "slug": "visa-renewal",
        "title": "Visa renewal checklist",
        "description": "Prepare a complete visa renewal pack ahead of the deadline.",
        "document_type": "visa",
        "checklist_type": "renewal",
        "sort_order": 20,
        "items": [
            ("Valid passport", True, 45, "Passport valid well beyond the visa period."),
            ("Current visa", True, 45, "Your existing visa or permit."),
            ("Application form", True, 30, "Complete the renewal application."),
            ("Proof of funds", True, 30, "Bank statements or sponsorship letter."),
            ("Proof of address", True, 21, "Tenancy agreement or utility bill."),
            ("Passport photos", True, 21, "As per the embassy specification."),
            ("Visa fee", True, 14, "Confirm and prepare the renewal fee."),
        ],
    },
    {
        "slug": "student-pass-renewal",
        "title": "Student pass renewal checklist",
        "description": "Keep your student pass valid through your studies.",
        "document_type": "student_pass",
        "checklist_type": "renewal",
        "sort_order": 30,
        "items": [
            ("Enrolment confirmation", True, 45, "Proof you are still enrolled."),
            ("Academic transcript", True, 30, "Latest results / progress report."),
            ("Valid passport", True, 30, "Passport valid for the new pass period."),
            ("Proof of finances", True, 21, "Funds for tuition and living costs."),
            ("Renewal application", True, 14, "Submit through your institution portal."),
            ("Medical/insurance proof", False, 21, "If required by your institution."),
        ],
    },
    {
        "slug": "insurance-renewal",
        "title": "Insurance renewal checklist",
        "description": "Review and renew a policy with the right cover.",
        "document_type": "insurance",
        "checklist_type": "insurance",
        "sort_order": 40,
        "items": [
            ("Current policy document", True, 30, "Find your existing policy."),
            ("Review cover & limits", True, 21, "Check the cover still fits your needs."),
            ("Compare quotes", False, 21, "Shop around for a better rate."),
            ("Update personal details", True, 14, "Address, dependants, claims history."),
            ("Confirm renewal premium", True, 7, "Check the new premium and pay."),
        ],
    },
    {
        "slug": "scholarship-application",
        "title": "Scholarship application checklist",
        "description": "Assemble a strong scholarship application pack.",
        "use_case": "scholarship",
        "checklist_type": "application",
        "sort_order": 50,
        "items": [
            ("Academic transcripts", True, 45, "Certified copies of results."),
            ("Personal statement", True, 30, "Draft and refine your statement."),
            ("Reference letters", True, 30, "Request from referees early."),
            ("Proof of identity", True, 21, "Passport or national ID."),
            ("Proof of income/need", False, 21, "If the scholarship is need-based."),
            ("Application form", True, 14, "Complete the official application."),
            ("CV / resume", False, 21, "Up-to-date CV if requested."),
        ],
    },
    {
        "slug": "travel-document-readiness",
        "title": "Travel document readiness checklist",
        "description": "Be travel-ready with every essential document in hand.",
        "use_case": "travel",
        "checklist_type": "travel",
        "sort_order": 60,
        "items": [
            ("Valid passport", True, 30, "Valid for at least 6 months."),
            ("Visa / entry permit", True, 30, "If required for your destination."),
            ("Travel insurance", True, 21, "Cover for health and trip disruption."),
            ("Flight/ticket confirmation", True, 14, "Printed or digital copies."),
            ("Accommodation booking", False, 14, "Hotel or host confirmation."),
            ("Vaccination/health docs", False, 21, "If required for entry."),
            ("Emergency contacts copy", False, 7, "Keep a copy separate from originals."),
        ],
    },
]


class Command(BaseCommand):
    help = "Seed or refresh the shared system checklist templates."

    @transaction.atomic
    def handle(self, *args, **options):
        created, updated = 0, 0
        for spec in SYSTEM_TEMPLATES:
            # Copy so we never mutate the module-level definition (re-runs!).
            defaults = {k: v for k, v in spec.items() if k != "items"}
            items = spec["items"]
            slug = defaults.pop("slug")
            template, was_created = DocumentChecklistTemplate.objects.update_or_create(
                slug=slug,
                defaults={
                    **defaults,
                    "is_system_template": True,
                    "is_active": True,
                },
            )
            created += int(was_created)
            updated += int(not was_created)

            # Rebuild items so the template always matches this definition.
            template.item_templates.all().delete()
            DocumentChecklistItemTemplate.objects.bulk_create(
                [
                    DocumentChecklistItemTemplate(
                        template=template,
                        title=title,
                        description=description,
                        is_required=is_required,
                        sort_order=(index + 1) * 10,
                        suggested_due_offset_days=offset_days,
                    )
                    for index, (title, is_required, offset_days, description) in enumerate(
                        items
                    )
                ]
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Checklist templates seeded: {created} created, {updated} updated."
            )
        )

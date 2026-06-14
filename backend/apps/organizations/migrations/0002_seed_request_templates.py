from django.db import migrations


SYSTEM_REQUEST_TEMPLATES = [
    ("Passport copy", "Upload a clear passport copy.", "identity", "PDF/JPG/PNG"),
    ("Student ID", "Upload a current student identification card.", "identity", "PDF/JPG/PNG"),
    ("National ID", "Upload a clear national ID copy.", "identity", "PDF/JPG/PNG"),
    ("CV/Resume", "Upload your latest CV or resume.", "application", "PDF/DOCX"),
    ("Transcript", "Upload your latest academic transcript.", "education", "PDF"),
    ("Proof of payment", "Upload proof of payment or receipt.", "finance", "PDF/JPG/PNG"),
    ("Recommendation letter", "Upload a signed recommendation letter.", "application", "PDF"),
    ("Signed consent form", "Upload the completed consent form.", "forms", "PDF/JPG/PNG"),
]


def seed_templates(apps, schema_editor):
    OrganizationRequestTemplate = apps.get_model(
        "organizations", "OrganizationRequestTemplate"
    )
    for name, description, category, required_file_type in SYSTEM_REQUEST_TEMPLATES:
        OrganizationRequestTemplate.objects.get_or_create(
            organization=None,
            name=name,
            is_system=True,
            defaults={
                "description": description,
                "category": category,
                "required_file_type": required_file_type,
            },
        )


def unseed_templates(apps, schema_editor):
    OrganizationRequestTemplate = apps.get_model(
        "organizations", "OrganizationRequestTemplate"
    )
    OrganizationRequestTemplate.objects.filter(is_system=True, organization=None).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_templates, unseed_templates),
    ]

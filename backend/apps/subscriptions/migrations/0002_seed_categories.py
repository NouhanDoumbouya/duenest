from django.db import migrations

# Kept inline (not imported from services) so the migration is stable even if
# the default list changes later — historical migrations must not shift.
DEFAULT_CATEGORIES = [
    ("Streaming", "monitor-play", "#ef4444"),
    ("Software", "app-window", "#6366f1"),
    ("Cloud & Hosting", "server", "#0ea5e9"),
    ("Domain", "globe", "#14b8a6"),
    ("Insurance", "shield-check", "#22c55e"),
    ("Telecom", "smartphone", "#f59e0b"),
    ("Utilities", "plug", "#84cc16"),
    ("Education", "graduation-cap", "#8b5cf6"),
    ("Finance", "landmark", "#0d9488"),
    ("Gym & Health", "dumbbell", "#ec4899"),
    ("Professional Membership", "briefcase", "#3b82f6"),
    ("Transport", "car-front", "#f97316"),
    ("Other", "tag", "#64748b"),
]


def seed_categories(apps, schema_editor):
    SubscriptionCategory = apps.get_model("subscriptions", "SubscriptionCategory")
    from django.utils.text import slugify

    for order, (name, icon, color) in enumerate(DEFAULT_CATEGORIES):
        SubscriptionCategory.objects.get_or_create(
            owner=None,
            slug=slugify(name),
            defaults={
                "name": name,
                "icon": icon,
                "color": color,
                "is_system": True,
                "sort_order": order,
            },
        )


def unseed_categories(apps, schema_editor):
    SubscriptionCategory = apps.get_model("subscriptions", "SubscriptionCategory")
    SubscriptionCategory.objects.filter(is_system=True, owner__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_categories, unseed_categories),
    ]

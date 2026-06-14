from django.core.management.base import BaseCommand

from apps.features.models import FEATURE_DEFINITIONS, FeatureFlag


class Command(BaseCommand):
    help = (
        "Create any missing feature flag rows from the registry. Existing rows "
        "are left untouched (founder overrides are preserved). Idempotent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Also reset existing rows back to their registry default visibility.",
        )

    def handle(self, *args, **options):
        existing = {f.key: f for f in FeatureFlag.objects.all()}
        created = 0
        reset = 0
        for d in FEATURE_DEFINITIONS:
            flag = existing.get(d["key"])
            if flag is None:
                FeatureFlag.objects.create(
                    key=d["key"],
                    name=d["name"],
                    description=d.get("description", ""),
                    visibility=d["default"],
                )
                created += 1
            elif options["reset"]:
                flag.visibility = d["default"]
                flag.name = d["name"]
                flag.description = d.get("description", "")
                flag.save(update_fields=["visibility", "name", "description", "updated_at"])
                reset += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Feature flags seeded: {created} created, {reset} reset."
            )
        )

import base64
import os

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Print a base64-encoded 32-byte key for local development. "
        "NEVER commit this value or reuse a development key in production."
    )

    def handle(self, *args, **options):
        key = base64.b64encode(os.urandom(32)).decode("ascii")
        self.stdout.write(self.style.SUCCESS(key))
        self.stderr.write(
            self.style.WARNING(
                "\nAdd this to your local .env as e.g. DUENEST_KEK_V1_B64=<key> "
                "and set DUENEST_ACTIVE_KEK_VERSION=v1.\n"
                "Do NOT commit it. For production, store keys in a secret manager "
                "and back them up — losing a KEK makes its data unrecoverable."
            )
        )

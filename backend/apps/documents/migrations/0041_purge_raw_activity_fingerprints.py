"""
SEC-014 — purge historical raw network identifiers from activity trails.

Going forward, ``log_activity`` / ``log_room_activity`` store only a salted hash
(``ip_hash`` / ``user_agent_hash``). This one-off data migration clears any raw
``ip_address`` / ``user_agent`` already persisted on existing rows so no plaintext
visitor IP/UA is retained at rest. The deprecated columns themselves are kept
(nullable) for backward compatibility; they are simply never populated again.

Irreversible by design: the raw values are intentionally not recoverable.
"""

from django.db import migrations


def purge_raw_fingerprints(apps, schema_editor):
    for model_name in ("DocumentFileActivity", "RoomActivity"):
        model = apps.get_model("documents", model_name)
        model.objects.exclude(ip_address__isnull=True).update(ip_address=None)
        model.objects.exclude(user_agent="").update(user_agent="")


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0040_documentfileactivity_ip_hash_and_more"),
    ]

    operations = [
        migrations.RunPython(purge_raw_fingerprints, migrations.RunPython.noop),
    ]

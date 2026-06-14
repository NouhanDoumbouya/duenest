from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("founder", "0005_alter_productevent_event_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="productevent",
            name="client_event_id",
            field=models.CharField(blank=True, db_index=True, max_length=120),
        ),
        migrations.AddField(
            model_name="productevent",
            name="dedupe_key",
            field=models.CharField(blank=True, db_index=True, max_length=128),
        ),
        migrations.AddField(
            model_name="feedbackitem",
            name="contact_preference",
            field=models.CharField(
                choices=[
                    ("email", "Email"),
                    ("in_app", "In app"),
                    ("no_reply", "No reply needed"),
                ],
                default="email",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="feedbackitem",
            name="founder_response",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="feedbackitem",
            name="responded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="feedbackitem",
            name="urgency",
            field=models.CharField(
                choices=[
                    ("low", "Low"),
                    ("medium", "Medium"),
                    ("high", "High"),
                    ("urgent", "Urgent"),
                ],
                default="medium",
                max_length=20,
            ),
        ),
    ]

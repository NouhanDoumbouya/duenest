from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0012_shareroom_roomactivity_shareroomitem_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="documentfile",
            name="document",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="files",
                to="documents.document",
            ),
        ),
        migrations.AddIndex(
            model_name="documentfile",
            index=models.Index(
                fields=["uploaded_by", "is_trashed"],
                name="documents_d_uploade_21ef79_idx",
            ),
        ),
        migrations.AlterField(
            model_name="documentfileactivity",
            name="document",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="file_activities",
                to="documents.document",
            ),
        ),
    ]

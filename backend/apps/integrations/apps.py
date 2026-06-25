from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.integrations"
    verbose_name = "Integrations (OAuth foundation)"

    def ready(self) -> None:
        # Import concrete providers so they register themselves.
        from .providers import google  # noqa: F401

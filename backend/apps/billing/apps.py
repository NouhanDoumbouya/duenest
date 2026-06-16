from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"

    def ready(self):
        # Fail closed on insecure billing configuration (SEC-004). In production
        # the unsigned manual provider is rejected and Stripe must have its keys;
        # in dev/test manual mode is allowed so this is a no-op there.
        #
        # Build-time exception: image builders run `collectstatic` BEFORE any
        # runtime billing env is present (e.g. Railway/Docker build), and that
        # step neither serves traffic nor touches billing. Skipping the check
        # there lets the build succeed without weakening runtime safety — the
        # serving processes (gunicorn / migrate / runserver) still validate, so a
        # genuinely misconfigured production is still caught at startup.
        import sys

        build_only_commands = {"collectstatic"}
        if any(cmd in sys.argv for cmd in build_only_commands):
            return

        from .providers import BillingError, validate_billing_configuration

        try:
            validate_billing_configuration()
        except BillingError as exc:
            raise RuntimeError(f"Insecure billing configuration: {exc}") from exc

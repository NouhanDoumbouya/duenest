from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"

    def ready(self):
        # Fail closed on insecure billing configuration (SEC-004). In production
        # the unsigned manual provider is rejected and Stripe must have its keys;
        # in dev/test manual mode is allowed so this is a no-op there.
        from .providers import BillingError, validate_billing_configuration

        try:
            validate_billing_configuration()
        except BillingError as exc:
            raise RuntimeError(f"Insecure billing configuration: {exc}") from exc

"""Unit tests for provider-neutral email configuration (pure function)."""

from django.test import SimpleTestCase

from apps.notifications.email_config import resolve_email_settings

_CONSOLE = "django.core.mail.backends.console.EmailBackend"
_SMTP = "django.core.mail.backends.smtp.EmailBackend"


def get_from(values):
    return lambda key, default="": values.get(key, default)


class EmailConfigTests(SimpleTestCase):
    def test_default_is_console_and_configured(self):
        cfg = resolve_email_settings(get_from({}))
        self.assertEqual(cfg["EMAIL_BACKEND"], _CONSOLE)
        self.assertEqual(cfg["EMAIL_PROVIDER"], "console")
        self.assertTrue(cfg["EMAIL_CONFIGURED"])

    def test_smtp_without_credentials_is_not_configured(self):
        cfg = resolve_email_settings(get_from({"EMAIL_PROVIDER": "smtp"}))
        self.assertEqual(cfg["EMAIL_BACKEND"], _SMTP)
        self.assertFalse(cfg["EMAIL_CONFIGURED"])

    def test_smtp_with_full_credentials_is_configured(self):
        cfg = resolve_email_settings(
            get_from(
                {
                    "EMAIL_PROVIDER": "smtp",
                    "SMTP_HOST": "smtp.example.com",
                    "SMTP_USERNAME": "u",
                    "SMTP_PASSWORD": "p",
                }
            )
        )
        self.assertTrue(cfg["EMAIL_CONFIGURED"])
        self.assertEqual(cfg["EMAIL_HOST"], "smtp.example.com")

    def test_legacy_email_host_vars_still_work(self):
        cfg = resolve_email_settings(
            get_from(
                {
                    "EMAIL_PROVIDER": "smtp",
                    "EMAIL_HOST": "legacy.example.com",
                    "EMAIL_HOST_USER": "u",
                    "EMAIL_HOST_PASSWORD": "p",
                }
            )
        )
        self.assertTrue(cfg["EMAIL_CONFIGURED"])
        self.assertEqual(cfg["EMAIL_HOST"], "legacy.example.com")

    def test_sendgrid_preset_uses_api_key_as_password(self):
        cfg = resolve_email_settings(
            get_from({"EMAIL_PROVIDER": "sendgrid", "SENDGRID_API_KEY": "SG.x"})
        )
        self.assertEqual(cfg["EMAIL_HOST"], "smtp.sendgrid.net")
        self.assertEqual(cfg["EMAIL_HOST_USER"], "apikey")
        self.assertEqual(cfg["EMAIL_HOST_PASSWORD"], "SG.x")
        self.assertTrue(cfg["EMAIL_CONFIGURED"])

    def test_resend_preset(self):
        cfg = resolve_email_settings(
            get_from({"EMAIL_PROVIDER": "resend", "RESEND_API_KEY": "re_x"})
        )
        self.assertEqual(cfg["EMAIL_HOST"], "smtp.resend.com")
        self.assertEqual(cfg["EMAIL_HOST_USER"], "resend")
        self.assertTrue(cfg["EMAIL_CONFIGURED"])

    def test_provider_without_key_is_not_configured(self):
        cfg = resolve_email_settings(get_from({"EMAIL_PROVIDER": "postmark"}))
        self.assertEqual(cfg["EMAIL_BACKEND"], _SMTP)
        self.assertFalse(cfg["EMAIL_CONFIGURED"])

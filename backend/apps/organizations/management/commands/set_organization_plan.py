"""
Set/activate an organization's B2B Portal plan (Teams Plan + Portal Limits V1).

Founder/beta activation WITHOUT Stripe — creates/updates the org's
``OrganizationPlanProfile`` and records an audit event. No live checkout, no
prices, no Stripe calls.

  python manage.py set_organization_plan --org-id 42 --plan teams_beta --portal-enabled true
  python manage.py set_organization_plan --org-id 42 --plan teams
  python manage.py set_organization_plan --org-id 42 --plan free --portal-enabled false
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Set an organization's portal plan/entitlement (founder/beta; no Stripe)."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", type=int, required=True)
        parser.add_argument(
            "--plan", required=True,
            choices=["free", "pro", "teams_beta", "teams", "enterprise"],
        )
        parser.add_argument(
            "--portal-enabled", choices=["true", "false"], default=None,
            help="Override the portal toggle (defaults from the plan if omitted).",
        )
        parser.add_argument(
            "--status", choices=["active", "trialing", "disabled", "cancelled"],
            default=None,
        )

    def handle(self, *args, **options):
        from apps.organizations.models import Organization
        from apps.organizations.portal_limits import set_organization_plan

        org = Organization.objects.filter(pk=options["org_id"]).first()
        if org is None:
            raise CommandError(f"Organization {options['org_id']} not found.")

        portal_enabled = options["portal_enabled"]
        if portal_enabled is not None:
            portal_enabled = portal_enabled == "true"

        profile = set_organization_plan(
            org, plan=options["plan"], portal_enabled=portal_enabled,
            status_value=options["status"],
        )
        self.stdout.write(
            f"Organization {org.id} ({org.name}): plan={profile.plan} "
            f"portal_enabled={profile.portal_enabled} status={profile.status}"
        )

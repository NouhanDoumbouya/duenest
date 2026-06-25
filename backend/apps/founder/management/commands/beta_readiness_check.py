"""
Private-beta readiness check (read-only, safe to run anywhere).

Prints an automated, boolean-only readiness report built from
``apps.founder.beta_readiness.build_beta_readiness_report`` — the same safe
config/health snapshot the founder console reuses.

What this command does NOT do (by construction — it only reads settings + the DB):
* never sends an email,
* never calls the AI provider or consumes AI credits,
* never calls a Google API or imports anything,
* never creates a live Stripe object or changes Stripe mode,
* never touches files / R2 / makes anything public,
* never prints a secret value (only booleans, counts, and safe mode strings).

Usage:
    python manage.py beta_readiness_check
    python manage.py beta_readiness_check --json
    python manage.py beta_readiness_check --include-database-counts

Exit code is 0 even when gates fail — this is a report, not a gate-keeper. Read
the "blocked"/"attention"/"ready" summary line.
"""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from apps.founder.beta_readiness import build_beta_readiness_report

_SYMBOL = {"ok": "[ OK ]", "info": "[INFO]", "warn": "[WARN]", "fail": "[FAIL]"}
_STYLE = {"ok": "SUCCESS", "info": "HTTP_INFO", "warn": "WARNING", "fail": "ERROR"}


class Command(BaseCommand):
    help = "Print a safe, boolean-only private-beta readiness report (no secrets)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--json",
            action="store_true",
            help="Emit the report as JSON (for automation).",
        )
        parser.add_argument(
            "--include-database-counts",
            action="store_true",
            help="Include safe operational counts (no contents) in the report.",
        )
        # No-op: this command is read-only regardless. Accepted for scripting parity.
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="No-op (this command never writes anything).",
        )

    def handle(self, *args, **options):
        report = build_beta_readiness_report(
            include_db_counts=options["include_database_counts"]
        )

        if options["json"]:
            self.stdout.write(json.dumps(report, indent=2, sort_keys=True))
            return

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("CertaNest — Private Beta Readiness"))
        self.stdout.write(f"Generated: {report['generated_at']}")
        self.stdout.write("")

        for gate in report["gates"]:
            symbol = _SYMBOL.get(gate["status"], "[ ?? ]")
            styler = getattr(self.style, _STYLE.get(gate["status"], "NOTICE"))
            line = f"{symbol}  {gate['label']}"
            self.stdout.write(styler(line))
            self.stdout.write(f"        {gate['detail']}")

        summary = report["summary"]
        self.stdout.write("")
        self.stdout.write(
            f"Gates: {summary['ok']} ok · {summary['info']} info · "
            f"{summary['warn']} attention · {summary['fail']} blocking "
            f"(of {summary['total']})"
        )

        overall = report["overall"]
        banner = {
            "ready": self.style.SUCCESS("OVERALL: READY — no blocking gates."),
            "attention": self.style.WARNING(
                "OVERALL: ATTENTION — review the [WARN] items before inviting users."
            ),
            "blocked": self.style.ERROR(
                "OVERALL: BLOCKED — resolve the [FAIL] items before launch."
            ),
        }.get(overall, overall)
        self.stdout.write(banner)
        self.stdout.write("")

#!/usr/bin/env sh
# Run DueNest database migrations ONCE (not part of the web startup).
#
# Intended for a Railway one-off command / console, the CLI (`railway run`), or a
# dedicated release step — never the web process CMD. Reads configuration from
# the environment (DATABASE_URL, DJANGO_SETTINGS_MODULE, KEK, etc.); contains no
# secrets. See docs/deployment/railway-backend-staging.md.
set -eu

echo "Running migrations with DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-unset}"
python manage.py migrate --noinput
echo "Migrations complete."

# DueNest backend — production image.
#
# System packages: tesseract-ocr + poppler-utils are required by the OCR /
# document-intelligence features (pytesseract + pdf2image); libpq5 for psycopg.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        poppler-utils \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect static at build time. Production settings fail closed without an
# encryption KEK, so a THROWAWAY key is supplied for this build step only —
# collectstatic never encrypts data, and this key is not baked into the image.
#
# BUILD-ONLY billing override: collectstatic loads the billing app, whose
# SEC-004 safety check otherwise rejects the default manual provider. These vars
# exist ONLY for this build step (BillingConfig also skips the check during
# collectstatic); they never reach the running container and must NOT be used as
# runtime billing config. Runtime billing is set via Railway env (see
# docs/deployment/railway-backend-staging.md).
RUN DJANGO_SECRET_KEY=build-only \
    DJANGO_SECURE_SSL_REDIRECT=False \
    BILLING_PROVIDER=manual \
    BILLING_ALLOW_MANUAL_PROVIDER=true \
    DUENEST_ACTIVE_KEK_VERSION=v1 \
    DUENEST_KEK_V1_B64="$(python -c 'import base64;print(base64.b64encode(bytes(32)).decode())')" \
    python manage.py collectstatic --noinput

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Migrate at startup (real env present), then serve. For multi-instance
# deployments prefer running migrations as a separate release step instead.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-3} --timeout 60 --access-logfile - --error-logfile -"]

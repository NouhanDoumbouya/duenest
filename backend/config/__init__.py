"""CertaNest config package.

Importing the Celery app here ensures ``@shared_task`` is bound to it as soon as
Django starts, in both eager (lean) and worker modes.
"""

from config.celery import app as celery_app

__all__ = ("celery_app",)

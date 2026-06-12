from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model for DueNest.

    Starts from Django's AbstractUser (so username/password auth keeps working)
    and adds a few fields needed to support third-party (Google) sign-in.
    """

    # Email is now unique so it can act as a stable identity across both
    # password-based accounts and Google accounts. Existing rows all use
    # distinct emails, so adding the unique constraint is safe.
    email = models.EmailField("email address", unique=True)

    # The "sub" claim from a verified Google ID token. It is the stable,
    # unique identifier Google gives each account. Null/blank for users who
    # signed up with a password and never linked Google.
    google_id = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        help_text="Google account subject identifier (the 'sub' claim).",
    )

    # Optional profile picture URL returned by Google.
    avatar_url = models.URLField(blank=True, default="")

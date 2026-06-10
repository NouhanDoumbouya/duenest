from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """
    Custom user model for DueNest.

    This is intentionally minimal for now.
    More fields can be added later without replacing Django's default user model.
    """

    pass

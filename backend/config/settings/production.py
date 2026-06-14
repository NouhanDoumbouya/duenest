from .base import *  # noqa: F401,F403
from apps.core.security import key_provider

DEBUG = False

# Production settings will be configured using environment variables.

# Fail closed: refuse to start if the active file/field encryption KEK is
# missing or malformed, so we never silently run without encryption keys.
key_provider.validate_configuration()

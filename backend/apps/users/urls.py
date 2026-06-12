from django.urls import path

from .views import CurrentUserView, GoogleAuthView, RegisterView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", TokenObtainPairView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/google/", GoogleAuthView.as_view(), name="auth-google"),
    path("users/me/", CurrentUserView.as_view(), name="users-me"),
]
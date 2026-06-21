from django.urls import path

from .views import AiPreferenceView

urlpatterns = [
    path("ai/preferences/", AiPreferenceView.as_view(), name="ai-preferences"),
]

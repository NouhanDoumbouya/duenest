from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import DocumentChecklistTemplate

from .models import AppErrorLog, FeedbackItem, ProductEvent
from .permissions import IsFounderUser
from .serializers import (
    ClientErrorCreateSerializer,
    FeedbackCreateSerializer,
    FounderAppErrorLogSerializer,
    FounderChecklistTemplateSerializer,
    FounderFeedbackSerializer,
    FounderMeSerializer,
    FounderUserListSerializer,
    ProductEventSerializer,
)
from .services import (
    active_checklist_templates,
    build_activation_funnel,
    build_feature_adoption,
    build_founder_dashboard,
    build_founder_user_summary,
    build_security_overview,
    founder_user_queryset,
    sanitize_metadata,
    track_product_event,
)


User = get_user_model()


class FounderMeView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(
            FounderMeSerializer(
                {
                    "is_founder": True,
                    "user_id": request.user.id,
                    "email": request.user.email,
                }
            ).data
        )


class FeedbackCreateView(generics.CreateAPIView):
    """User-facing feedback submission endpoint."""

    permission_classes = [AllowAny]
    serializer_class = FeedbackCreateSerializer

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        item = serializer.save(
            user=user,
            source=FeedbackItem.Source.IN_APP,
        )
        track_product_event(
            event_type=ProductEvent.EventType.FEEDBACK_SUBMITTED,
            user=user,
            request=self.request,
            object_type="feedback",
            object_id=item.id,
            metadata={
                "category": item.category,
                "related_feature": item.related_feature,
            },
        )


class ClientErrorLogCreateView(generics.CreateAPIView):
    """Frontend/client error logging endpoint."""

    permission_classes = [AllowAny]
    serializer_class = ClientErrorCreateSerializer

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        error = serializer.save(
            user=user,
            metadata=sanitize_metadata(serializer.validated_data.get("metadata", {})),
        )
        track_product_event(
            event_type=ProductEvent.EventType.ERROR_RECORDED,
            user=user,
            request=self.request,
            object_type="app_error",
            object_id=error.id,
            metadata={"severity": error.severity, "source": error.source},
        )


class FounderDashboardView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_founder_dashboard())


class FounderActivationFunnelView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_activation_funnel())


class FounderFeatureAdoptionView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_feature_adoption())


class FounderFeedbackListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderFeedbackSerializer

    def get_queryset(self):
        queryset = FeedbackItem.objects.select_related("user")
        params = self.request.query_params
        if params.get("category"):
            queryset = queryset.filter(category=params["category"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("priority"):
            queryset = queryset.filter(priority=params["priority"])
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(title__icontains=search)
        return queryset


class FounderFeedbackDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderFeedbackSerializer
    lookup_url_kwarg = "feedback_id"

    def get_queryset(self):
        return FeedbackItem.objects.select_related("user")


class FounderChecklistTemplateListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderChecklistTemplateSerializer

    def get_queryset(self):
        queryset = active_checklist_templates()
        active = self.request.query_params.get("is_active")
        if active is not None:
            queryset = queryset.filter(is_active=active.lower() in {"1", "true", "yes"})
        system = self.request.query_params.get("is_system_template")
        if system is not None:
            queryset = queryset.filter(
                is_system_template=system.lower() in {"1", "true", "yes"}
            )
        return queryset


class FounderChecklistTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderChecklistTemplateSerializer
    lookup_url_kwarg = "template_id"

    def get_queryset(self):
        return DocumentChecklistTemplate.objects.prefetch_related("item_templates")

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        template.is_active = False
        template.save(update_fields=["is_active", "updated_at"])
        return Response(self.get_serializer(template).data)


class FounderErrorLogListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderAppErrorLogSerializer

    def get_queryset(self):
        queryset = AppErrorLog.objects.select_related("user")
        params = self.request.query_params
        if params.get("severity"):
            queryset = queryset.filter(severity=params["severity"])
        if params.get("source"):
            queryset = queryset.filter(source=params["source"])
        if params.get("resolved") is not None:
            queryset = queryset.filter(
                resolved=params["resolved"].lower() in {"1", "true", "yes"}
            )
        return queryset


class FounderErrorLogDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderAppErrorLogSerializer
    lookup_url_kwarg = "error_id"

    def get_queryset(self):
        return AppErrorLog.objects.select_related("user")


class FounderSecurityOverviewView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_security_overview())


class FounderSecurityEventListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = ProductEventSerializer

    def get_queryset(self):
        return (
            ProductEvent.objects.filter(
                event_type=ProductEvent.EventType.SECURITY_EVENT_RECORDED
            )
            .select_related("user")
            .order_by("-created_at")
        )


class FounderUserListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderUserListSerializer

    def get_queryset(self):
        queryset = founder_user_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(email__icontains=search)
        return queryset


class FounderUserSummaryView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        return Response(build_founder_user_summary(user))


class FounderErrorResolveView(APIView):
    permission_classes = [IsFounderUser]

    def post(self, request, error_id):
        error = get_object_or_404(AppErrorLog, pk=error_id)
        error.resolved = True
        error.resolved_at = timezone.now()
        error.save(update_fields=["resolved", "resolved_at"])
        return Response(FounderAppErrorLogSerializer(error).data)

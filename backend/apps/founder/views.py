from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import DocumentChecklistTemplate

from apps.users.models import UserOnboardingState

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    LaunchChecklistItem,
    ProductEvent,
)
from .permissions import IsFounderUser
from .serializers import (
    BetaUserProfileSerializer,
    ClientErrorCreateSerializer,
    FeatureCompletionItemSerializer,
    FeedbackCreateSerializer,
    FounderAppErrorLogSerializer,
    FounderAuditLogSerializer,
    FounderChecklistTemplateSerializer,
    FounderFeedbackSerializer,
    FounderMeSerializer,
    FounderUserListSerializer,
    LaunchChecklistItemSerializer,
    ProductEventSerializer,
)
from .services import (
    active_checklist_templates,
    build_activation_funnel,
    build_country_activity,
    build_feature_adoption,
    build_founder_analytics,
    build_founder_dashboard,
    build_founder_user_summary,
    build_security_overview,
    ensure_beta_profiles_for_users,
    ensure_feature_completion_defaults,
    ensure_launch_checklist_defaults,
    feature_completion_summary,
    founder_user_queryset,
    launch_readiness_summary,
    log_founder_action,
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
        log_founder_action(request=request, action="founder_viewed_dashboard")
        return Response(build_founder_dashboard(request.query_params.get("range")))


class FounderAnalyticsView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        log_founder_action(request=request, action="founder_viewed_analytics")
        return Response(build_founder_analytics(request.query_params.get("range")))


class FounderActivationFunnelView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_activation_funnel())


class FounderFeatureAdoptionView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_feature_adoption())


class FounderFeatureCompletionListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FeatureCompletionItemSerializer
    pagination_class = None

    def get_queryset(self):
        ensure_feature_completion_defaults()
        queryset = FeatureCompletionItem.objects.all()
        status_filter = self.request.query_params.get("status")
        module = self.request.query_params.get("module")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if module:
            queryset = queryset.filter(module=module)
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response(
            {
                "summary": feature_completion_summary(),
                "items": response.data,
            }
        )


class FounderFeatureCompletionDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FeatureCompletionItemSerializer
    lookup_url_kwarg = "item_id"

    def get_queryset(self):
        ensure_feature_completion_defaults()
        return FeatureCompletionItem.objects.all()

    def perform_update(self, serializer):
        item = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_updated_feature_completion",
            object_type="feature_completion",
            object_id=item.id,
            metadata={"key": item.key, "status": item.status},
        )


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

    def perform_update(self, serializer):
        item = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_reviewed_feedback",
            object_type="feedback",
            object_id=item.id,
            metadata={"status": item.status, "priority": item.priority},
        )


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
        log_founder_action(
            request=request,
            action="founder_changed_template",
            object_type="checklist_template",
            object_id=template.id,
            metadata={"action": "deactivate"},
        )
        return Response(self.get_serializer(template).data)

    def perform_update(self, serializer):
        template = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_changed_template",
            object_type="checklist_template",
            object_id=template.id,
            metadata={"action": "update"},
        )


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


class FounderAuditLogListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderAuditLogSerializer

    def get_queryset(self):
        return FounderAuditLog.objects.select_related("actor")


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
        log_founder_action(
            request=request,
            action="founder_viewed_beta_user_summary",
            object_type="user",
            object_id=user.id,
        )
        return Response(build_founder_user_summary(user))


class FounderBetaUserListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = BetaUserProfileSerializer

    def get_queryset(self):
        ensure_beta_profiles_for_users()
        onboarding = UserOnboardingState.objects.filter(
            user=OuterRef("user_id"),
            has_completed_document_onboarding=True,
        )
        queryset = BetaUserProfile.objects.select_related("user").annotate(
            document_count=Count(
                "user__documents",
                filter=Q(user__documents__is_trashed=False),
                distinct=True,
            ),
            file_count=Count(
                "user__documents__files",
                filter=Q(
                    user__documents__is_trashed=False,
                    user__documents__files__is_trashed=False,
                ),
                distinct=True,
            ),
            reminder_count=Count("user__document_reminder_rules", distinct=True),
            bundle_count=Count("user__document_bundles", distinct=True),
            feedback_count=Count("user__feedback_items", distinct=True),
            onboarding_completed=Exists(onboarding),
        ).order_by("user__email")
        status_filter = self.request.query_params.get("invite_status")
        persona = self.request.query_params.get("persona")
        search = self.request.query_params.get("search", "").strip()
        if status_filter:
            queryset = queryset.filter(invite_status=status_filter)
        if persona:
            queryset = queryset.filter(persona=persona)
        if search:
            queryset = queryset.filter(
                Q(user__email__icontains=search)
                | Q(user__username__icontains=search)
            )
        return queryset

    def list(self, request, *args, **kwargs):
        log_founder_action(request=request, action="founder_viewed_beta_users")
        return super().list(request, *args, **kwargs)


class FounderBetaUserDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = BetaUserProfileSerializer
    lookup_url_kwarg = "profile_id"

    def get_queryset(self):
        ensure_beta_profiles_for_users()
        onboarding = UserOnboardingState.objects.filter(
            user=OuterRef("user_id"),
            has_completed_document_onboarding=True,
        )
        return BetaUserProfile.objects.select_related("user").annotate(
            document_count=Count(
                "user__documents",
                filter=Q(user__documents__is_trashed=False),
                distinct=True,
            ),
            file_count=Count(
                "user__documents__files",
                filter=Q(
                    user__documents__is_trashed=False,
                    user__documents__files__is_trashed=False,
                ),
                distinct=True,
            ),
            reminder_count=Count("user__document_reminder_rules", distinct=True),
            bundle_count=Count("user__document_bundles", distinct=True),
            feedback_count=Count("user__feedback_items", distinct=True),
            onboarding_completed=Exists(onboarding),
        ).order_by("user__email")

    def perform_update(self, serializer):
        profile = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_updated_beta_user",
            object_type="beta_profile",
            object_id=profile.id,
            metadata={
                "invite_status": profile.invite_status,
                "persona": profile.persona,
            },
        )


class FounderLaunchReadinessListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = LaunchChecklistItemSerializer
    pagination_class = None

    def get_queryset(self):
        ensure_launch_checklist_defaults()
        return LaunchChecklistItem.objects.all()

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response(
            {
                "summary": launch_readiness_summary(),
                "items": response.data,
            }
        )


class FounderLaunchReadinessDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = LaunchChecklistItemSerializer
    lookup_url_kwarg = "item_id"

    def get_queryset(self):
        ensure_launch_checklist_defaults()
        return LaunchChecklistItem.objects.all()

    def perform_update(self, serializer):
        item = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_updated_launch_readiness",
            object_type="launch_checklist",
            object_id=item.id,
            metadata={"key": item.key, "is_complete": item.is_complete},
        )


class FounderCountryActivityView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        log_founder_action(request=request, action="founder_viewed_country_activity")
        return Response(build_country_activity(request.query_params.get("range")))


class FounderErrorResolveView(APIView):
    permission_classes = [IsFounderUser]

    def post(self, request, error_id):
        error = get_object_or_404(AppErrorLog, pk=error_id)
        error.resolved = True
        error.resolved_at = timezone.now()
        error.save(update_fields=["resolved", "resolved_at"])
        return Response(FounderAppErrorLogSerializer(error).data)

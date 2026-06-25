from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.documents.models import DocumentChecklistTemplate

from apps.users.models import UserOnboardingState

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    FounderSupportNote,
    InviteCode,
    LaunchChecklistItem,
    OperationalEvent,
    ScheduledJobRun,
    TransactionalEmailSetting,
    ProductEvent,
    WaitlistEntry,
)
from .observability import build_observability_overview, build_system_status
from .job_status import build_job_detail, build_jobs_overview, build_jobs_summary
from .admin_console import (
    build_ai_usage_overview,
    build_founder_user_detail,
    build_organization_detail,
    build_organizations_list,
    build_plans_limits_overview,
    build_storage_overview,
)
from apps.core.scheduled_jobs import get_job
from .permissions import IsFounderUser
from .serializers import (
    BetaUserProfileSerializer,
    ClientErrorCreateSerializer,
    FeatureCompletionItemSerializer,
    FeedbackCreateSerializer,
    FounderInviteCodeSerializer,
    FounderAppErrorLogSerializer,
    FounderAuditLogSerializer,
    FounderChecklistTemplateSerializer,
    FounderFeedbackSerializer,
    FounderMeSerializer,
    FounderOperationalEventSerializer,
    FounderScheduledJobRunSerializer,
    FounderSupportNoteSerializer,
    FounderWaitlistEntrySerializer,
    FounderUserListSerializer,
    LaunchChecklistItemSerializer,
    TransactionalEmailSettingSerializer,
    InviteValidateSerializer,
    PrivateBetaStatusSerializer,
    WaitlistCreateSerializer,
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
    build_private_beta_metrics,
    build_security_overview,
    create_invite_code,
    ensure_beta_profiles_for_users,
    ensure_feature_completion_defaults,
    ensure_launch_checklist_defaults,
    ensure_transactional_email_defaults,
    feature_completion_summary,
    founder_user_queryset,
    launch_readiness_summary,
    log_founder_action,
    sanitize_metadata,
    get_usable_invite_code,
    InviteCodeError,
    send_waitlist_confirmation_email,
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


class PrivateBetaStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            PrivateBetaStatusSerializer(
                {"private_beta_enabled": settings.PRIVATE_BETA_ENABLED}
            ).data
        )


class WaitlistCreateView(generics.CreateAPIView):
    """Public private-beta waitlist submission endpoint."""

    permission_classes = [AllowAny]
    serializer_class = WaitlistCreateSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "waitlist"

    def perform_create(self, serializer):
        entry = serializer.save()
        send_waitlist_confirmation_email(entry)
        track_product_event(
            event_type=ProductEvent.EventType.WAITLIST_JOINED,
            request=self.request,
            object_type="waitlist_entry",
            object_id=entry.id,
            metadata={
                "persona": entry.persona,
                "country": entry.country,
                "referral_source": entry.referral_source,
            },
        )


class InviteValidateView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite_validate"

    def post(self, request):
        serializer = InviteValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        try:
            invite = get_usable_invite_code(code)
        except InviteCodeError as exc:
            track_product_event(
                event_type=ProductEvent.EventType.INVITE_VALIDATED,
                request=request,
                metadata={"valid": False},
            )
            return Response(
                {"valid": False, "detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        track_product_event(
            event_type=ProductEvent.EventType.INVITE_VALIDATED,
            request=request,
            object_type="invite_code",
            object_id=invite.id,
            metadata={"valid": True, "persona_target": invite.persona_target},
        )
        return Response(
            {
                "valid": True,
                "code": invite.code,
                "label": invite.label,
                "persona_target": invite.persona_target,
                "expires_at": invite.expires_at,
                "remaining_uses": invite.remaining_uses,
            }
        )


class FeedbackCreateView(generics.CreateAPIView):
    """User-facing feedback submission endpoint."""

    permission_classes = [AllowAny]
    serializer_class = FeedbackCreateSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "feedback"

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
    """Frontend/client error logging endpoint (anonymous, so rate-limited and
    payload-bounded — SEC-008)."""

    permission_classes = [AllowAny]
    serializer_class = ClientErrorCreateSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "client_error"

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


# Only these client-submitted UI event types are accepted; anything else is
# rejected so the endpoint can't be used to write arbitrary events.
CLIENT_EVENT_TYPES = frozenset(
    {
        ProductEvent.EventType.DASHBOARD_VIEWED,
        ProductEvent.EventType.VAULT_VIEWED,
        ProductEvent.EventType.VAULT_CARD_CLICKED,
        ProductEvent.EventType.QUICK_ACTION_USED,
        ProductEvent.EventType.EMPTY_STATE_CTA_USED,
        ProductEvent.EventType.FORGETTING_CHECK_USED,
        ProductEvent.EventType.DASHBOARD_LOAD_FAILED,
    }
)


class ClientEventCreateView(APIView):
    """
    Privacy-safe ingest for a small allowlist of client UI interaction events
    (dashboard/vault). Authenticated, rate-limited, and the metadata is
    sanitized — never store document titles or other sensitive content here.
    Powers founder product analytics; not visible to end users.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "client_events"

    def post(self, request):
        event_type = (request.data.get("event_type") or "").strip()
        if event_type not in CLIENT_EVENT_TYPES:
            return Response(
                {"detail": "Unsupported event type."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        track_product_event(
            event_type=event_type,
            user=request.user,
            request=request,
            source=ProductEvent.Source.FRONTEND,
            object_type=str(request.data.get("object_type") or "")[:80],
            object_id=str(request.data.get("object_id") or "")[:80],
            metadata=sanitize_metadata(request.data.get("metadata", {})),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


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


class FounderPrivateBetaMetricsView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        log_founder_action(request=request, action="founder_viewed_private_beta_metrics")
        return Response(build_private_beta_metrics())


class FounderNotificationHealthView(APIView):
    """Delivery health for reminders/notifications (founder/admin only)."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        from apps.notifications.services import build_delivery_health

        log_founder_action(request=request, action="founder_viewed_notification_health")
        return Response(build_delivery_health())


class FounderWaitlistListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderWaitlistEntrySerializer

    def get_queryset(self):
        queryset = WaitlistEntry.objects.select_related(
            "invite_code",
            "invited_by",
            "accepted_user",
        )
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("persona"):
            queryset = queryset.filter(persona=params["persona"])
        if params.get("country"):
            queryset = queryset.filter(country__icontains=params["country"].strip())
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search)
                | Q(full_name__icontains=search)
                | Q(message__icontains=search)
            )
        return queryset

    def list(self, request, *args, **kwargs):
        log_founder_action(request=request, action="founder_viewed_waitlist")
        return super().list(request, *args, **kwargs)


class FounderWaitlistDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderWaitlistEntrySerializer
    lookup_url_kwarg = "entry_id"

    def get_queryset(self):
        return WaitlistEntry.objects.select_related(
            "invite_code",
            "invited_by",
            "accepted_user",
        )

    def perform_update(self, serializer):
        entry = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_updated_waitlist_entry",
            object_type="waitlist_entry",
            object_id=entry.id,
            metadata={"status": entry.status, "persona": entry.persona},
        )


class FounderWaitlistCreateInviteView(APIView):
    permission_classes = [IsFounderUser]

    def post(self, request, entry_id):
        entry = get_object_or_404(WaitlistEntry, pk=entry_id)
        serializer = FounderInviteCodeSerializer(
            data={
                **request.data,
                "label": request.data.get("label")
                or f"Invite for {entry.full_name}",
                "waitlist_entry_id": entry.id,
                "persona_target": request.data.get("persona_target") or entry.persona,
            },
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        return Response(
            FounderInviteCodeSerializer(invite).data,
            status=status.HTTP_201_CREATED,
        )


class FounderInviteCodeListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderInviteCodeSerializer

    def get_queryset(self):
        queryset = InviteCode.objects.select_related("created_by").prefetch_related(
            "uses__user",
            "uses__waitlist_entry",
        )
        params = self.request.query_params
        if params.get("is_active") is not None:
            queryset = queryset.filter(
                is_active=params["is_active"].lower() in {"1", "true", "yes"}
            )
        if params.get("persona_target"):
            queryset = queryset.filter(persona_target=params["persona_target"])
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(code__icontains=search)
                | Q(label__icontains=search)
                | Q(notes__icontains=search)
            )
        return queryset

    def list(self, request, *args, **kwargs):
        log_founder_action(request=request, action="founder_viewed_invites")
        return super().list(request, *args, **kwargs)


class FounderInviteCodeDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = FounderInviteCodeSerializer
    lookup_url_kwarg = "invite_id"

    def get_queryset(self):
        return InviteCode.objects.select_related("created_by").prefetch_related(
            "uses__user",
            "uses__waitlist_entry",
        )

    def perform_update(self, serializer):
        invite = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_updated_invite",
            object_type="invite_code",
            object_id=invite.id,
            metadata={"is_active": invite.is_active, "max_uses": invite.max_uses},
        )


class FounderInviteCodeDisableView(APIView):
    permission_classes = [IsFounderUser]

    def post(self, request, invite_id):
        invite = get_object_or_404(InviteCode, pk=invite_id)
        invite.is_active = False
        invite.save(update_fields=["is_active", "updated_at"])
        log_founder_action(
            request=request,
            action="founder_disabled_invite",
            object_type="invite_code",
            object_id=invite.id,
        )
        return Response(FounderInviteCodeSerializer(invite).data)


class FounderActivationFunnelView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_activation_funnel())


class FounderFeatureAdoptionView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_feature_adoption())


class FounderFeatureCompletionListView(generics.ListCreateAPIView):
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

    def perform_create(self, serializer):
        item = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_created_feature_completion",
            object_type="feature_completion",
            object_id=item.id,
            metadata={"key": item.key, "status": item.status},
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


class FounderBetaReadinessView(APIView):
    """Automated, boolean-only private-beta readiness snapshot (no secrets).

    Complements the founder-editable launch checklist: this one is computed from
    settings + the DB (config health, flags, founder account, Stripe mode, security
    gates, operational counts) and reuses ``build_system_status``. It never returns
    a secret value, never sends email, never calls AI or Google.
    """

    permission_classes = [IsFounderUser]

    def get(self, request):
        from apps.founder.beta_readiness import build_beta_readiness_report

        include_counts = str(
            request.query_params.get("include_counts", "")
        ).lower() in {"1", "true", "yes"}
        return Response(build_beta_readiness_report(include_db_counts=include_counts))


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


# ---- Reliability & Observability V1 ----------------------------------------


class FounderSystemStatusView(APIView):
    """A compact, safe snapshot of platform health (founder/admin only)."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        log_founder_action(request=request, action="founder_viewed_system_status")
        return Response(build_system_status())


class FounderObservabilityView(APIView):
    """The aggregated payload the founder observability page renders."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        log_founder_action(request=request, action="founder_viewed_observability")
        return Response(build_observability_overview())


class FounderOperationalEventListView(generics.ListAPIView):
    """Filterable list of operational events (category / severity / status)."""

    permission_classes = [IsFounderUser]
    serializer_class = FounderOperationalEventSerializer

    def get_queryset(self):
        queryset = OperationalEvent.objects.select_related("user", "organization")
        params = self.request.query_params
        if params.get("category"):
            queryset = queryset.filter(category=params["category"])
        if params.get("severity"):
            queryset = queryset.filter(severity=params["severity"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("source"):
            queryset = queryset.filter(source=params["source"])
        resolved = params.get("resolved")
        if resolved is not None and resolved != "":
            queryset = queryset.filter(
                resolved=resolved.lower() in {"1", "true", "yes"}
            )
        return queryset


class FounderOperationalEventResolveView(APIView):
    """Mark an operational event resolved (records who + an optional note)."""

    permission_classes = [IsFounderUser]

    def post(self, request, event_id):
        event = get_object_or_404(OperationalEvent, pk=event_id)
        note = ""
        if isinstance(request.data, dict):
            note = str(request.data.get("resolution_note") or "")[:500]
        event.resolved = True
        event.resolved_at = timezone.now()
        event.resolved_by = request.user
        event.resolution_note = note
        event.save(
            update_fields=[
                "resolved",
                "resolved_at",
                "resolved_by",
                "resolution_note",
            ]
        )
        log_founder_action(
            request=request,
            action="founder_resolved_operational_event",
            object_type="operational_event",
            object_id=event.id,
            metadata={"category": event.category, "source": event.source},
        )
        return Response(FounderOperationalEventSerializer(event).data)


# ---- Scheduled Jobs & Background Operations V1 ------------------------------


class FounderScheduledJobListView(APIView):
    """List every registered scheduled job with its health + last run."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        log_founder_action(request=request, action="founder_viewed_scheduled_jobs")
        return Response({"jobs": build_jobs_overview()})


class FounderScheduledJobSummaryView(APIView):
    """Aggregate scheduled-job health counts."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_jobs_summary())


class FounderScheduledJobDetailView(APIView):
    """One job's metadata, health, and recent run history."""

    permission_classes = [IsFounderUser]

    def get(self, request, job_name):
        detail = build_job_detail(job_name)
        if detail is None:
            return Response(
                {"detail": "Unknown scheduled job."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(detail)


class FounderScheduledJobRunsView(generics.ListAPIView):
    """Paginated run history for one job."""

    permission_classes = [IsFounderUser]
    serializer_class = FounderScheduledJobRunSerializer

    def get_queryset(self):
        return ScheduledJobRun.objects.filter(
            job_name=self.kwargs["job_name"]
        ).order_by("-created_at")


class FounderScheduledJobRunView(APIView):
    """Manually run a job NOW (founder only). Only jobs explicitly marked
    `is_manual_run_allowed` and NOT destructive can be triggered here. Email jobs
    are idempotent (dedupe), so a manual run cannot double-send."""

    permission_classes = [IsFounderUser]

    def post(self, request, job_name):
        from .job_runner import run_scheduled_job

        job = get_job(job_name)
        if job is None:
            return Response(
                {"detail": "Unknown scheduled job."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not job.is_manual_run_allowed or job.is_destructive:
            return Response(
                {"detail": "This job cannot be run from the console."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = run_scheduled_job(
                job_name,
                triggered_by=ScheduledJobRun.Trigger.MANUAL,
                user=request.user,
            )
        except Exception as exc:  # noqa: BLE001 — a FAILED run was already recorded
            log_founder_action(
                request=request,
                action="founder_ran_scheduled_job",
                object_type="scheduled_job",
                object_id=job_name,
                metadata={"outcome": "error"},
            )
            return Response(
                {"detail": "The job failed.", "error_code": type(exc).__name__},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        log_founder_action(
            request=request,
            action="founder_ran_scheduled_job",
            object_type="scheduled_job",
            object_id=job_name,
            metadata={"outcome": result.get("status")},
        )
        return Response(result)


class FounderScheduledJobDryRunView(APIView):
    """Dry-run a job (preview counts, no side effects). Allowed only when the job
    declares `supports_dry_run`. Used for destructive jobs (e.g. trash purge) so a
    founder can see what WOULD happen without deleting anything."""

    permission_classes = [IsFounderUser]

    def post(self, request, job_name):
        from .job_runner import JobNotRunnable, run_scheduled_job

        job = get_job(job_name)
        if job is None:
            return Response(
                {"detail": "Unknown scheduled job."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not job.supports_dry_run:
            return Response(
                {"detail": "This job does not support a dry run."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = run_scheduled_job(
                job_name,
                triggered_by=ScheduledJobRun.Trigger.MANUAL,
                user=request.user,
                dry_run=True,
            )
        except JobNotRunnable:
            return Response(
                {"detail": "This job cannot be dry-run."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_founder_action(
            request=request,
            action="founder_dry_ran_scheduled_job",
            object_type="scheduled_job",
            object_id=job_name,
        )
        return Response(result)


# ---- Founder Admin Tools V1 (support console) -------------------------------


class FounderOrganizationListView(APIView):
    """Founder support list of organizations (safe aggregates only)."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        params = request.query_params
        portal_param = params.get("portal")
        portal = None
        if portal_param in {"1", "true", "yes"}:
            portal = True
        elif portal_param in {"0", "false", "no"}:
            portal = False
        log_founder_action(request=request, action="founder_viewed_organizations")
        return Response(
            {
                "organizations": build_organizations_list(
                    search=params.get("search", ""),
                    plan=params.get("plan", ""),
                    portal=portal,
                )
            }
        )


class FounderOrganizationDetailView(APIView):
    """One organization's support-safe detail (limits, members, events, notes)."""

    permission_classes = [IsFounderUser]

    def get(self, request, org_id):
        from apps.organizations.models import Organization

        org = Organization.objects.filter(pk=org_id).first()
        if org is None:
            return Response(
                {"detail": "Organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        log_founder_action(
            request=request,
            action="founder_viewed_organization",
            object_type="organization",
            object_id=org.id,
        )
        return Response(build_organization_detail(org))


class FounderOrganizationSetPlanView(APIView):
    """Set an org's plan profile / portal-enabled via the existing safe service
    (no Stripe). Founder only, audited."""

    permission_classes = [IsFounderUser]

    def post(self, request, org_id):
        from apps.organizations.models import Organization
        from apps.organizations.portal_limits import set_organization_plan

        org = Organization.objects.filter(pk=org_id).first()
        if org is None:
            return Response(
                {"detail": "Organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = request.data if isinstance(request.data, dict) else {}
        plan = data.get("plan")
        portal_enabled = data.get("portal_enabled")
        try:
            set_organization_plan(
                org,
                plan=plan,
                portal_enabled=portal_enabled,
                actor=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        log_founder_action(
            request=request,
            action="founder_set_organization_plan",
            object_type="organization",
            object_id=org.id,
            metadata={"plan": plan},
        )
        return Response(build_organization_detail(org))


class FounderUserDetailView(APIView):
    """Enriched founder support view for one user (plan/storage/AI/orgs/notes)."""

    permission_classes = [IsFounderUser]

    def get(self, request, user_id):
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return Response(
                {"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND
            )
        log_founder_action(
            request=request,
            action="founder_viewed_user_detail",
            object_type="user",
            object_id=user.id,
        )
        return Response(build_founder_user_detail(user))


class FounderPlansLimitsView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_plans_limits_overview())


class FounderStorageView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_storage_overview())


class FounderAiUsageView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_ai_usage_overview())


class FounderSupportNoteListCreateView(generics.ListCreateAPIView):
    """List/create founder support notes; filter by target_user / target_organization."""

    permission_classes = [IsFounderUser]
    serializer_class = FounderSupportNoteSerializer
    pagination_class = None

    def get_queryset(self):
        qs = FounderSupportNote.objects.select_related("created_by")
        params = self.request.query_params
        if params.get("target_user"):
            qs = qs.filter(target_user_id=params["target_user"])
        if params.get("target_organization"):
            qs = qs.filter(target_organization_id=params["target_organization"])
        return qs

    def perform_create(self, serializer):
        note = serializer.save(created_by=self.request.user)
        log_founder_action(
            request=self.request,
            action="founder_created_support_note",
            object_type="support_note",
            object_id=note.id,
            metadata={"note_type": note.note_type},
        )


class FounderSupportNoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Update a note's status/body/type, or delete it. Founder only."""

    permission_classes = [IsFounderUser]
    serializer_class = FounderSupportNoteSerializer
    lookup_url_kwarg = "note_id"
    queryset = FounderSupportNote.objects.all()

    def perform_update(self, serializer):
        note = serializer.save()
        log_founder_action(
            request=self.request,
            action="founder_updated_support_note",
            object_type="support_note",
            object_id=note.id,
            metadata={"status": note.status},
        )


class FounderEmailSettingListView(generics.ListAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = TransactionalEmailSettingSerializer
    pagination_class = None

    def get_queryset(self):
        ensure_transactional_email_defaults()
        return TransactionalEmailSetting.objects.all()


class FounderEmailSettingDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = TransactionalEmailSettingSerializer
    lookup_field = "key"
    lookup_url_kwarg = "key"

    def get_queryset(self):
        ensure_transactional_email_defaults()
        return TransactionalEmailSetting.objects.all()

    def perform_update(self, serializer):
        item = serializer.save(updated_by=self.request.user)
        log_founder_action(
            request=self.request,
            action="founder_updated_email_setting",
            object_type="email_setting",
            object_id=item.id,
            metadata={"key": item.key, "enabled": item.enabled},
        )


def _mask_email(email: str) -> str:
    """Privacy-safe masking for the founder console: ``j***@example.com``."""
    if not email or "@" not in email:
        return "—"
    local, _, domain = email.partition("@")
    head = local[0] if local else ""
    return f"{head}***@{domain}"


class FounderEmailAnalyticsView(APIView):
    """Aggregate email-send health for the founder console (last 30 days).

    Reads the cross-cutting EmailLog: totals by status, a per-type breakdown,
    masked recent sends, and the suppression-list size. Routing metadata only —
    no document contents. Delivered/bounced/opened populate once an ESP posts
    delivery webhooks.
    """

    permission_classes = [IsFounderUser]

    def get(self, request):
        from apps.notifications.models import EmailLog, SuppressedEmail

        since = timezone.now() - timezone.timedelta(days=30)
        logs = EmailLog.objects.filter(created_at__gte=since)
        by_status = {
            row["status"]: row["n"]
            for row in logs.values("status").annotate(n=Count("id"))
        }
        by_type = list(
            logs.values("email_type")
            .annotate(
                total=Count("id"),
                sent=Count("id", filter=Q(status="sent")),
                failed=Count("id", filter=Q(status="failed")),
                suppressed=Count("id", filter=Q(status="suppressed")),
            )
            .order_by("-total")[:25]
        )
        recent = [
            {
                "email_type": item.email_type,
                "category": item.category,
                "recipient": _mask_email(item.recipient),
                "status": item.status,
                "subject": item.subject,
                "created_at": item.created_at,
            }
            for item in logs.order_by("-created_at")[:25]
        ]
        return Response(
            {
                "window_days": 30,
                "total": logs.count(),
                "by_status": by_status,
                "by_type": by_type,
                "recent": recent,
                "suppressed_total": SuppressedEmail.objects.count(),
            }
        )


# Sample context so previews/test-sends render with realistic dynamic bits
# (links, codes, dates) across every branded template. Missing keys render empty.
_EMAIL_PREVIEW_SAMPLE = {
    "invite_url": "https://app.certanest.com/invite/SAMPLE-CODE",
    "invite_code": "DN-SAMPLE",
    "reset_url": "https://app.certanest.com/reset-password?token=sample",
    "verify_url": "https://app.certanest.com/verify-email?token=sample",
    "action_url": "https://app.certanest.com/dashboard/settings/billing",
    "action_label": "Manage billing",
    "detail_line": "Sample: your plan renews 30 Jun 2026.",
    "preferences_url": "https://app.certanest.com/dashboard/notifications/settings",
}


def _resolved_email_draft(request, key):
    """(definition, subject, body): the saved/default email, overlaid with any
    draft subject/body the founder is editing (so the preview matches the form)."""
    from common.transactional_email import resolve_transactional_email

    _enabled, subject, body, definition = resolve_transactional_email(key)
    draft_subject = (request.data.get("subject") or "").strip()
    draft_body = (request.data.get("body") or "").strip()
    return definition, (draft_subject or subject), (draft_body or body)


class FounderEmailPreviewView(APIView):
    """Render a branded email to HTML for in-console preview (no send)."""

    permission_classes = [IsFounderUser]

    def post(self, request):
        from django.template.loader import render_to_string

        from common.transactional_email import TRANSACTIONAL_EMAILS

        key = request.data.get("key")
        if key not in TRANSACTIONAL_EMAILS:
            return Response(
                {"detail": "Unknown email."}, status=status.HTTP_400_BAD_REQUEST
            )
        definition, subject, body = _resolved_email_draft(request, key)
        ctx = {"subject": subject, "email_body": body, **_EMAIL_PREVIEW_SAMPLE}
        try:
            html = render_to_string(f"emails/{definition.template}.html", ctx)
        except Exception:  # noqa: BLE001
            return Response(
                {"detail": "Could not render preview."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"subject": subject, "html": html})


class FounderEmailTestSendView(APIView):
    """Send a branded email (current draft content) to the founder to preview
    real email-client rendering. Sends even if the email is toggled off."""

    permission_classes = [IsFounderUser]

    def post(self, request, key):
        from common.email import send_branded_email
        from common.transactional_email import TRANSACTIONAL_EMAILS

        if key not in TRANSACTIONAL_EMAILS:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not request.user.email:
            return Response(
                {"detail": "Your account has no email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not getattr(settings, "EMAIL_CONFIGURED", True):
            return Response(
                {"detail": "Email is not configured in this environment."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        definition, subject, body = _resolved_email_draft(request, key)
        ok = send_branded_email(
            subject=f"[Test] {subject}",
            template=definition.template,
            context={"email_body": body, **_EMAIL_PREVIEW_SAMPLE},
            to=request.user.email,
            email_type=f"test_{key}",
            category="transactional",
            fail_silently=False,
        )
        if not ok:
            return Response(
                {"detail": "Could not send the test email."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"detail": f"Test email sent to {request.user.email}."})

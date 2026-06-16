"""
Founder Growth Command Center API: serializers + founder-only views for the
overview, funnel, campaigns, UTM builder, and action center.

Every view requires :class:`IsFounderUser`. No view exposes document contents.
"""

from __future__ import annotations

from django.utils.text import slugify
from rest_framework import generics, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .growth import (
    build_growth_funnel,
    build_growth_overview,
    build_utm_url,
    campaign_metrics,
)
from .models import CampaignLink, GrowthAction, MarketingCampaign
from .permissions import IsFounderUser


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
class CampaignLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignLink
        fields = [
            "id",
            "campaign",
            "label",
            "base_url",
            "full_url",
            "source",
            "medium",
            "content",
            "term",
            "created_at",
        ]
        read_only_fields = ["id", "full_url", "created_at"]


class MarketingCampaignSerializer(serializers.ModelSerializer):
    metrics = serializers.SerializerMethodField()
    links = CampaignLinkSerializer(many=True, read_only=True)

    class Meta:
        model = MarketingCampaign
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "channel",
            "source",
            "medium",
            "campaign",
            "content",
            "target_audience",
            "status",
            "start_date",
            "end_date",
            "budget_amount",
            "currency",
            "goal",
            "cta",
            "landing_url",
            "generated_url",
            "tags",
            "notes",
            "metrics",
            "links",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "generated_url", "created_at", "updated_at"]

    def get_metrics(self, obj):
        range_key = self.context.get("range_key")
        return campaign_metrics(obj, range_key)

    def validate_tags(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list of strings.")
        return [str(t)[:40] for t in value][:20]

    def _ensure_slug(self, name: str) -> str:
        base = slugify(name)[:160] or "campaign"
        slug = base
        i = 2
        while MarketingCampaign.objects.filter(slug=slug).exists():
            slug = f"{base}-{i}"
            i += 1
        return slug

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["slug"] = self._ensure_slug(validated_data.get("name", ""))
        if not validated_data.get("campaign"):
            validated_data["campaign"] = validated_data["slug"]
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
            validated_data["updated_by"] = request.user
        # Build a generated UTM URL when a landing URL is supplied.
        landing = validated_data.get("landing_url")
        if landing:
            try:
                validated_data["generated_url"] = build_utm_url(
                    landing,
                    source=validated_data.get("source") or "direct",
                    medium=validated_data.get("medium") or "referral",
                    campaign=validated_data["campaign"],
                    content=validated_data.get("content", ""),
                )
            except ValueError:
                validated_data["generated_url"] = ""
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["updated_by"] = request.user
        return super().update(instance, validated_data)


class GrowthActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GrowthAction
        fields = [
            "id",
            "title",
            "description",
            "reason",
            "action_type",
            "priority",
            "status",
            "related_metric",
            "campaign",
            "due_at",
            "snoozed_until",
            "action_url",
            "metadata",
            "created_automatically",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_automatically", "created_at", "updated_at"]

    def validate_metadata(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Metadata must be an object.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
            validated_data.setdefault("owner", request.user)
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------
class _GrowthContextMixin:
    permission_classes = [IsFounderUser]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["range_key"] = self.request.query_params.get("range")
        return ctx


class FounderGrowthOverviewView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_growth_overview(request.query_params.get("range")))


class FounderGrowthFunnelView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(
            build_growth_funnel(
                request.query_params.get("range"),
                campaign_key=request.query_params.get("campaign") or None,
            )
        )


class FounderGrowthCampaignListCreateView(_GrowthContextMixin, generics.ListCreateAPIView):
    serializer_class = MarketingCampaignSerializer

    def get_queryset(self):
        qs = MarketingCampaign.objects.all().prefetch_related("links")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs


class FounderGrowthCampaignDetailView(_GrowthContextMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MarketingCampaignSerializer
    queryset = MarketingCampaign.objects.all().prefetch_related("links")


class FounderGrowthUtmBuilderView(APIView):
    permission_classes = [IsFounderUser]

    def post(self, request):
        data = request.data
        try:
            url = build_utm_url(
                data.get("base_url", ""),
                source=data.get("source", ""),
                medium=data.get("medium", ""),
                campaign=data.get("campaign", ""),
                content=data.get("content", ""),
                term=data.get("term", ""),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Optionally persist as a saved link on a campaign.
        campaign_id = data.get("campaign_id")
        saved = None
        if campaign_id:
            try:
                campaign = MarketingCampaign.objects.get(pk=campaign_id)
            except MarketingCampaign.DoesNotExist:
                return Response(
                    {"error": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND
                )
            link = CampaignLink.objects.create(
                campaign=campaign,
                label=data.get("label", "")[:160],
                base_url=data.get("base_url", ""),
                full_url=url,
                source=data.get("source", ""),
                medium=data.get("medium", ""),
                content=data.get("content", ""),
                term=data.get("term", ""),
                created_by=request.user,
            )
            saved = CampaignLinkSerializer(link).data

        return Response({"url": url, "saved_link": saved})


class FounderGrowthActionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = GrowthActionSerializer

    def get_queryset(self):
        qs = GrowthAction.objects.all()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs


class FounderGrowthActionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = GrowthActionSerializer
    queryset = GrowthAction.objects.all()


# ===========================================================================
# Additional modules: content calendar, segments, ambassadors, referrals,
# charts, exports, auto-actions, attribution capture.
# ===========================================================================
from django.http import HttpResponse  # noqa: E402
from rest_framework.permissions import IsAuthenticated  # noqa: E402

from .growth_modules import (  # noqa: E402
    ambassador_leaderboard,
    build_growth_charts,
    campaigns_csv,
    capture_attribution,
    evaluate_segment_queryset,
    generate_auto_actions,
    record_referral_signup,
    referral_leaderboard,
    referrals_csv,
    segment_summary,
)
from .models import AmbassadorProfile, AudienceSegment, ContentItem  # noqa: E402


class ContentItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentItem
        fields = [
            "id", "title", "channel", "content_type", "target_audience", "campaign",
            "status", "priority", "scheduled_at", "published_at", "cta", "utm_link",
            "notes", "tags", "result_metrics", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_tags(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list.")
        return [str(t)[:40] for t in value][:20]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class AudienceSegmentSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()

    class Meta:
        model = AudienceSegment
        fields = [
            "id", "name", "description", "rules_json", "is_dynamic", "status",
            "summary", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "summary", "created_at", "updated_at"]

    def get_summary(self, obj):
        return segment_summary(obj)

    def validate_rules_json(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Rules must be an object.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class AmbassadorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AmbassadorProfile
        fields = [
            "id", "name", "email", "community", "campus", "referral_code",
            "status", "notes", "reward_notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class FounderGrowthContentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = ContentItemSerializer

    def get_queryset(self):
        qs = ContentItem.objects.all()
        status_filter = self.request.query_params.get("status")
        return qs.filter(status=status_filter) if status_filter else qs


class FounderGrowthContentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = ContentItemSerializer
    queryset = ContentItem.objects.all()


class FounderGrowthSegmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = AudienceSegmentSerializer
    queryset = AudienceSegment.objects.all()


class FounderGrowthSegmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = AudienceSegmentSerializer
    queryset = AudienceSegment.objects.all()


class FounderGrowthSegmentMembersView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request, pk):
        try:
            segment = AudienceSegment.objects.get(pk=pk)
        except AudienceSegment.DoesNotExist:
            return Response({"error": "Segment not found."}, status=status.HTTP_404_NOT_FOUND)
        from apps.documents.models import Document

        users = evaluate_segment_queryset(segment.rules_json)[:200]
        activated_ids = set(
            Document.objects.filter(is_trashed=False).values_list("owner_id", flat=True)
        )
        members = [
            {
                "id": u.id,
                "email": u.email,
                "plan": u.plan,
                "activated": u.id in activated_ids,
                "date_joined": u.date_joined.isoformat(),
            }
            for u in users
        ]
        return Response({"count": len(members), "members": members})


class FounderGrowthAmbassadorListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = AmbassadorProfileSerializer
    queryset = AmbassadorProfile.objects.all()


class FounderGrowthAmbassadorDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsFounderUser]
    serializer_class = AmbassadorProfileSerializer
    queryset = AmbassadorProfile.objects.all()


class FounderGrowthReferralsView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(
            {
                "referrals": referral_leaderboard(limit=50),
                "ambassadors": ambassador_leaderboard(),
            }
        )


class FounderGrowthChartsView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        return Response(build_growth_charts(request.query_params.get("range")))


class FounderGrowthGenerateActionsView(APIView):
    permission_classes = [IsFounderUser]

    def post(self, request):
        created = generate_auto_actions()
        return Response(
            {"created": len(created), "actions": GrowthActionSerializer(created, many=True).data}
        )


class FounderGrowthExportView(APIView):
    permission_classes = [IsFounderUser]

    def get(self, request):
        from .audit import log_founder_action

        export_type = request.query_params.get("type", "campaigns")
        if export_type == "referrals":
            content, filename = referrals_csv(), "referrals.csv"
        else:
            content, filename = campaigns_csv(), "campaigns.csv"
        log_founder_action(request, "growth_export", export_type=export_type)
        response = HttpResponse(content, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="duenest-{filename}"'
        return response


class GrowthAttributionCaptureView(APIView):
    """Any authenticated user records their own acquisition attribution.

    Not founder-only: it writes the *caller's* first/last-touch UTM data (set on
    landing) and optionally logs a referral. Never returns other users' data.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        capture_attribution(request.user, data)
        referral_code = data.get("referral_code")
        if referral_code:
            record_referral_signup(request.user, referral_code)
        return Response({"status": "ok"})

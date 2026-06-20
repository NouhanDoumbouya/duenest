"""
Unified, owner-scoped quick search.

Powers the command palette (Cmd/Ctrl+K): a single lightweight endpoint that
looks across the few things a user jumps to most — their documents,
subscriptions, and organizations — and returns a small, capped list of safe
"go here" results. It deliberately does **not** expose anything the requester
can't already see: every queryset is scoped to ``request.user``.
"""

from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.documents.models import Document
from apps.features.flags import is_feature_enabled
from apps.organizations.models import Organization, OrganizationMembership
from apps.subscriptions.models import Subscription

# Per-type result cap. The palette is for fast jumps, not browsing, so a short
# list keeps the response small and the UI calm.
PER_TYPE_LIMIT = 5


def _document_results(user, query):
    qs = (
        Document.objects.filter(owner=user, is_trashed=False)
        .filter(
            Q(title__icontains=query)
            | Q(document_type__icontains=query)
            | Q(issuer__icontains=query)
            | Q(country__icontains=query)
            | Q(reference_number__icontains=query)
        )
        .order_by("-updated_at")[:PER_TYPE_LIMIT]
    )
    results = []
    for doc in qs:
        subtitle = doc.document_type or "Document"
        if doc.country:
            subtitle = f"{subtitle} · {doc.country}"
        results.append(
            {
                "type": "document",
                "id": doc.id,
                "title": doc.title,
                "subtitle": subtitle,
                "url": f"/dashboard/documents/{doc.id}",
            }
        )
    return results


def _subscription_results(user, query):
    qs = (
        Subscription.objects.filter(owner=user, is_archived=False)
        .filter(
            Q(name__icontains=query)
            | Q(provider__icontains=query)
            | Q(plan_name__icontains=query)
        )
        .order_by("-updated_at")[:PER_TYPE_LIMIT]
    )
    results = []
    for sub in qs:
        subtitle = sub.provider or sub.plan_name or "Subscription"
        results.append(
            {
                "type": "subscription",
                "id": sub.id,
                "title": sub.name,
                "subtitle": subtitle,
                "url": f"/dashboard/subscriptions/{sub.id}",
            }
        )
    return results


def _organization_results(user, query):
    org_ids = OrganizationMembership.objects.filter(
        user=user, status=OrganizationMembership.Status.ACTIVE
    ).values_list("organization_id", flat=True)
    qs = (
        Organization.objects.filter(
            id__in=org_ids, archived_at__isnull=True, name__icontains=query
        )
        .order_by("name")[:PER_TYPE_LIMIT]
    )
    return [
        {
            "type": "organization",
            "id": org.id,
            "title": org.name,
            "subtitle": org.get_organization_type_display(),
            "url": f"/dashboard/organizations/{org.id}",
        }
        for org in qs
    ]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workspace_search(request):
    """
    Owner-scoped quick search across documents, subscriptions, and
    organizations. Returns a small flat ``results`` list (capped per type).
    A blank query returns an empty list rather than everything.
    """
    query = (request.query_params.get("q") or "").strip()
    if not query:
        return Response({"query": "", "results": []})

    results = [
        *_document_results(request.user, query),
        *_organization_results(request.user, query),
    ]
    # Subscription Radar is deprecated; only surface legacy rows in search when a
    # founder has deliberately re-enabled the feature to inspect old data.
    if is_feature_enabled("subscriptions", request.user):
        results[1:1] = _subscription_results(request.user, query)
    return Response({"query": query, "results": results})

"use client";

// Organization portal — Documents / Files. A folder/tag/collection/smart-view
// lens over the org's portal documents: Cases / People / system folders, folder
// contents, org tags + collections, and (for admins) the folder-structure
// settings panel.
//
// Same access model as the rest of the portal: behind the `b2b_portals` flag
// (503 → "coming soon"), gated by a Teams entitlement (403 portal_not_enabled →
// paywall). Reads are open to any member; folder/structure writes are admin /
// owner only (a 403 surfaces "Only admins can change the folder structure").
//
// Trust model: folders are a presentation lens — they do NOT change who can see
// or access a document. The folder tree is NEVER exposed on any public route.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FolderTree,
  Inbox,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { OrganizationWorkspace } from "@/components/features/document-organization/organization-workspace";
import type { OrganizationDataSource } from "@/components/features/document-organization/organization-workspace";
import { StructureSettings } from "@/components/features/document-organization/structure-settings";
import { PortalNav } from "@/components/features/portals/portal-nav";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import { isPortalNotEnabledError } from "@/lib/portals";
import {
  addToCollection,
  createOrgCollection,
  createOrgFolder,
  createOrgTag,
  getCollectionItems,
  getOrgCollections,
  getOrgDocumentOrganization,
  getOrgFolderContents,
  getOrgFolders,
  getOrgTags,
  moveDocumentToFolder,
  resolveSmartView,
  updateOrgFolder,
} from "@/lib/document-organization";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type { OrgStructurePreference } from "@/types/document-organization";

type BlockKind = "coming_soon" | "paywall" | null;

export default function OrganizationDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orgId = Number(id);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [preference, setPreference] = useState<OrgStructurePreference | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrganization(orgId)
      .then((organization) => {
        if (active) setOrg(organization);
        return getOrgDocumentOrganization(orgId);
      })
      .then((overview) => {
        if (active) setPreference(overview.preference);
      })
      .catch((err) => {
        if (!active) return;
        if (isPortalNotEnabledError(err)) {
          setBlock("paywall");
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 503) {
            setBlock("coming_soon");
            return;
          }
          setLoadError(err.message);
          return;
        }
        setLoadError("Unable to load the document workspace.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  // Admin-only writes are attached only when the role allows them; members get a
  // read-only workspace. A late 403 from any write still surfaces a clear toast.
  const source: OrganizationDataSource = {
    getFolders: () => getOrgFolders(orgId, false),
    getTags: () => getOrgTags(orgId),
    getCollections: () => getOrgCollections(orgId),
    getFolderContents: (folderId) => getOrgFolderContents(orgId, folderId),
    resolveSmartView,
    getCollectionItems,
    ...(canManage
      ? {
          createFolder: (body) => createOrgFolder(orgId, body),
          renameFolder: (folderId, body) =>
            updateOrgFolder(orgId, folderId, {
              name: body.name,
              color: body.color,
              description: body.description,
            }),
          moveDocumentToFolder,
          createTag: (body) => createOrgTag(orgId, body),
          createCollection: (body) => createOrgCollection(orgId, body),
          addToCollection,
        }
      : {}),
  };

  const backLink = (
    <Link
      href={`/dashboard/organizations/${orgId}`}
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" />
      Back to organization
    </Link>
  );

  if (!portalsEnabled || block === "coming_soon") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Documents" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Inbox}
            title="The document workspace is coming soon."
            description="Organize your organization's documents into folders, tags, and collections. This isn't enabled for your account yet."
          />
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer width="wide">
        {backLink}
        <span className="sr-only" role="status">
          Loading documents…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (block === "paywall") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader
          eyebrow={org ? org.name : "Organization"}
          title="Documents"
        />
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Teams
          </span>
          <h2 className="mt-3 font-heading text-xl font-semibold">
            The document workspace is part of B2B Portals on Teams.
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Organize the documents your team collects into folders, tags, and
            collections. This organization isn&apos;t on a Teams plan yet.
          </p>
        </section>
      </PageContainer>
    );
  }

  if (loadError) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Documents" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      {backLink}
      <PortalNav orgId={orgId} active="documents" />
      <PageHeader
        eyebrow={org?.name || "Organization"}
        title="Documents"
        description="Folders, tags, collections, and smart views for the documents your team collects."
      />

      <TrustNotice icon={FolderTree} title="An organizing lens">
        Folders organize how your team browses documents. They don&apos;t change
        who can see or access a document, and they&apos;re never shown on public
        upload or sharing links.
      </TrustNotice>

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can browse folders, tags, and collections. Only organization
          owners and admins can change the folder structure.
        </TrustNotice>
      )}

      <OrganizationWorkspace source={source} canManage={canManage} />

      {canManage && preference && (
        <StructureSettings
          orgId={orgId}
          preference={preference}
          onSaved={setPreference}
        />
      )}
    </PageContainer>
  );
}

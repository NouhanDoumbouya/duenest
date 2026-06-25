"use client";

// Organization case templates (B2B Portals). A reusable-blueprint library: list
// the org's templates, create/edit them, duplicate or archive them, and spin a
// new portal case from one.
//
// Same access model as the portal: behind the `b2b_portals` flag (503 →
// "coming soon"), gated by a Teams entitlement (403 portal_not_enabled →
// paywall), and writes are admin/owner only (403 → view-only). Any member can
// read the template list.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileStack,
  Inbox,
  LayoutTemplate,
  Loader2,
  Package,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, type ToastState } from "@/components/ui/toast";
import {
  CreateCaseFromTemplateModal,
  TemplateFormModal,
} from "@/components/features/portals/template-modals";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  CASE_TYPE_LABELS,
  archivePortalTemplate,
  duplicatePortalTemplate,
  getPortalPeople,
  getPortalTemplate,
  getPortalTemplates,
  isPortalNotEnabledError,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  OrgCaseTemplate,
  OrgCaseTemplateSummary,
  PortalPerson,
} from "@/types/portals";

type BlockKind = "coming_soon" | "paywall" | "view_only" | null;

// Example chips for the empty state — calm, recognizable starting points.
const EXAMPLE_TEMPLATES = [
  "Visa application",
  "Scholarship application",
  "Employee onboarding",
  "Client KYC",
];

export default function OrganizationTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orgId = Number(id);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [templates, setTemplates] = useState<OrgCaseTemplateSummary[] | null>(
    null,
  );
  const [people, setPeople] = useState<PortalPerson[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Modal state.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrgCaseTemplate | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createCaseFor, setCreateCaseFor] =
    useState<OrgCaseTemplateSummary | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  const loadTemplates = useCallback(
    async (includeArchived: boolean): Promise<OrgCaseTemplateSummary[]> => {
      const response = await getPortalTemplates(orgId, {
        include_archived: includeArchived,
      });
      return response.templates;
    },
    [orgId],
  );

  const refresh = useCallback(
    async (message?: string) => {
      const next = await loadTemplates(showArchived);
      setTemplates(next);
      if (message) setToast({ message, kind: "success" });
    },
    [loadTemplates, showArchived],
  );

  useEffect(() => {
    let active = true;
    getOrganization(orgId)
      .then((organization) => {
        if (active) setOrg(organization);
      })
      .then(() =>
        Promise.all([
          getPortalTemplates(orgId, { include_archived: false }),
          getPortalPeople(orgId),
        ]),
      )
      .then(([templatesResponse, peopleResponse]) => {
        if (!active) return;
        setTemplates(templatesResponse.templates);
        setPeople(peopleResponse.people);
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
          if (err.status === 403) {
            setBlock("view_only");
            return;
          }
          setLoadError(err.message);
          return;
        }
        setLoadError("Unable to load templates.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  // When archived toggle flips after the first load, refetch the list.
  const reloadForArchived = useCallback(
    async (next: boolean) => {
      setShowArchived(next);
      try {
        const list = await loadTemplates(next);
        setTemplates(list);
      } catch {
        // Keep the existing list on a refresh failure; a toast would be noisy.
      }
    },
    [loadTemplates],
  );

  async function openEdit(templateId: number) {
    setEditingId(templateId);
    setBusyId(templateId);
    try {
      const full = await getPortalTemplate(orgId, templateId);
      setEditing(full);
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not open template.",
        kind: "error",
      });
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(templateId: number) {
    setBusyId(templateId);
    try {
      await duplicatePortalTemplate(orgId, templateId);
      await refresh("Template duplicated.");
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Could not duplicate this template.",
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(templateId: number) {
    setBusyId(templateId);
    try {
      await archivePortalTemplate(orgId, templateId);
      await refresh("Template archived.");
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Could not archive this template.",
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  const backLink = (
    <Link
      href={`/dashboard/organizations/${orgId}/portal`}
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" />
      Back to portal
    </Link>
  );

  if (!portalsEnabled || block === "coming_soon") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Templates" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Inbox}
            title="Templates are coming soon."
            description="Save the cases you set up most often as reusable blueprints — defaults and required documents in one click. This isn't enabled for your account yet."
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
          Loading templates…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-44" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (block === "paywall") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow={org ? org.name : "Organization"} title="Templates" />
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Teams
          </span>
          <h2 className="mt-3 font-heading text-xl font-semibold">
            Templates are part of B2B Portals on Teams.
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Reusable case templates let your team set up new cases in one click —
            with the right defaults and required documents already in place. This
            organization isn&apos;t on a Teams plan yet.
          </p>
        </section>
      </PageContainer>
    );
  }

  if (loadError && templates === null) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Templates" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  if (block === "view_only" && templates === null) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Templates" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={ShieldAlert}
            title="You don't have access to templates."
            description="Templates are managed by organization owners and admins. Ask an admin if you need access."
          />
        </div>
      </PageContainer>
    );
  }

  const list = templates ?? [];

  return (
    <PageContainer width="wide">
      {backLink}
      <PageHeader
        eyebrow={org?.name || "Organization"}
        title="Case templates"
        description="Reusable blueprints for the cases you set up most often — defaults and required documents, ready to go."
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New template
            </Button>
          ) : undefined
        }
      />

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can view templates. Creating, editing, duplicating, and archiving
          templates — and creating cases from them — are limited to organization
          owners and admins.
        </TrustNotice>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={LayoutTemplate}
            title="Create your first organization template"
            description="Templates capture the case type, default title, priority, due window, and the documents each case needs — so a new case is one click away."
            action={
              canManage ? (
                <div className="flex flex-col items-center gap-3">
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="size-4" /> New template
                  </Button>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {EXAMPLE_TEMPLATES.map((example) => (
                      <span
                        key={example}
                        className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        {example}
                      </span>
                    ))}
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => void reloadForArchived(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Show archived templates
          </label>

          <div className="grid gap-3">
            {list.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                canManage={canManage}
                busy={busyId === template.id}
                hasPeople={people.length > 0}
                onEdit={() => void openEdit(template.id)}
                onCreateCase={() => setCreateCaseFor(template)}
                onDuplicate={() => void handleDuplicate(template.id)}
                onArchive={() => void handleArchive(template.id)}
              />
            ))}
          </div>
        </>
      )}

      {creating && canManage && (
        <TemplateFormModal
          orgId={orgId}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refresh("Template created.");
          }}
        />
      )}

      {editing && editingId !== null && canManage && (
        <TemplateFormModal
          orgId={orgId}
          template={editing}
          onClose={() => {
            setEditing(null);
            setEditingId(null);
          }}
          onSaved={async () => {
            setEditing(null);
            setEditingId(null);
            await refresh("Template updated.");
          }}
        />
      )}

      {createCaseFor && canManage && (
        <CreateCaseFromTemplateModal
          orgId={orgId}
          template={createCaseFor}
          people={people}
          onClose={() => setCreateCaseFor(null)}
          onCreated={async () => {
            setCreateCaseFor(null);
            await refresh("Case created from template.");
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

function TemplateCard({
  template,
  canManage,
  busy,
  hasPeople,
  onEdit,
  onCreateCase,
  onDuplicate,
  onArchive,
}: {
  template: OrgCaseTemplateSummary;
  canManage: boolean;
  busy: boolean;
  hasPeople: boolean;
  onEdit: () => void;
  onCreateCase: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const isArchived = template.status === "archived";
  const autoBadges = useMemo(() => {
    const badges: string[] = [];
    if (template.auto_create_requests) badges.push("Requests");
    if (template.auto_create_pack) badges.push("Pack");
    if (template.auto_create_room) badges.push("Room");
    return badges;
  }, [template]);

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-card",
        isArchived && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{template.name}</h3>
            <StatusBadge tone="neutral" withDot={false}>
              {CASE_TYPE_LABELS[template.case_type]}
            </StatusBadge>
            {isArchived && (
              <StatusBadge tone="neutral" withDot>
                Archived
              </StatusBadge>
            )}
          </div>
          {template.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {template.description}
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileStack className="size-3.5" aria-hidden />
              {template.requirement_count} requirement
              {template.requirement_count === 1 ? "" : "s"}
            </span>
            {autoBadges.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Package className="size-3.5" aria-hidden />
                Auto: {autoBadges.join(" · ")}
              </span>
            )}
          </p>
        </div>

        {canManage && !isArchived && (
          <Button
            size="sm"
            onClick={onCreateCase}
            disabled={busy || !hasPeople}
            title={hasPeople ? undefined : "Add a person to the portal first"}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-3.5" aria-hidden />
            )}
            Create case
          </Button>
        )}
      </div>

      {canManage && !isArchived && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={busy}
          >
            <Pencil className="size-3.5" aria-hidden /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDuplicate}
            disabled={busy}
          >
            <Copy className="size-3.5" aria-hidden /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onArchive}
            disabled={busy}
            className="text-muted-foreground"
          >
            <CheckCircle2 className="size-3.5" aria-hidden /> Archive
          </Button>
        </div>
      )}
    </article>
  );
}

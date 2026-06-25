"use client";

// Organization portal customization (B2B Custom Fields and Statuses V1). One
// settings surface for two things an org tailors:
//   • Custom fields — extra structured attributes on a person or case.
//   • Custom case statuses — the org's own stage vocabulary, mapped to system
//     statuses so the rest of the portal keeps working.
//
// Same access model as the rest of the portal: behind the `b2b_portals` flag
// (503 → "coming soon"), gated by a Teams entitlement (403 portal_not_enabled →
// paywall), and writes are admin/owner only (403 → view-only). Any member can
// read the definitions. V1 custom fields are INTERNAL — never shown on public
// pages.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Tags,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, SegmentedControl, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, type ToastState } from "@/components/ui/toast";
import { CustomStatusChip } from "@/components/features/portals/custom-status-chip";
import {
  CaseStatusFormModal,
  CustomFieldFormModal,
} from "@/components/features/portals/customization-modals";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  FIELD_TYPE_LABELS,
  FIELD_VISIBILITY_LABELS,
  STATUS_CATEGORY_LABELS,
  STATUS_CATEGORY_ORDER,
  archiveCaseStatus,
  archiveCustomField,
  getCaseStatuses,
  getCustomFields,
  isPortalNotEnabledError,
  seedDefaultCaseStatuses,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  CaseStatus,
  CustomField,
  CustomFieldTarget,
  StatusCategory,
} from "@/types/portals";

type BlockKind = "coming_soon" | "paywall" | "view_only" | null;

const FIELD_TABS: { value: CustomFieldTarget; label: string }[] = [
  { value: "person", label: "Person fields" },
  { value: "case", label: "Case fields" },
];

export default function PortalCustomizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orgId = Number(id);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [personFields, setPersonFields] = useState<CustomField[]>([]);
  const [caseFields, setCaseFields] = useState<CustomField[]>([]);
  const [statuses, setStatuses] = useState<CaseStatus[]>([]);
  const [fieldTab, setFieldTab] = useState<CustomFieldTarget>("person");
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Modal state.
  const [fieldModal, setFieldModal] = useState<{
    target: CustomFieldTarget;
    field?: CustomField;
  } | null>(null);
  const [statusModal, setStatusModal] = useState<
    { status?: CaseStatus } | null
  >(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  const reloadFields = useCallback(async () => {
    const [people, cases] = await Promise.all([
      getCustomFields(orgId, "person"),
      getCustomFields(orgId, "case"),
    ]);
    setPersonFields(people.fields);
    setCaseFields(cases.fields);
  }, [orgId]);

  const reloadStatuses = useCallback(async () => {
    const response = await getCaseStatuses(orgId);
    setStatuses(response.statuses);
  }, [orgId]);

  useEffect(() => {
    let active = true;
    getOrganization(orgId)
      .then((organization) => {
        if (active) setOrg(organization);
      })
      .then(() =>
        Promise.all([
          getCustomFields(orgId, "person"),
          getCustomFields(orgId, "case"),
          getCaseStatuses(orgId),
        ]),
      )
      .then(([people, cases, statusResponse]) => {
        if (!active) return;
        setPersonFields(people.fields);
        setCaseFields(cases.fields);
        setStatuses(statusResponse.statuses);
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
        setLoadError("Unable to load customization.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  async function handleArchiveField(field: CustomField) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Archive “${field.label}”? It will leave the schema.`)
    ) {
      return;
    }
    setBusyKey(`field-${field.id}`);
    try {
      await archiveCustomField(orgId, field.id);
      await reloadFields();
      setToast({ message: "Field archived.", kind: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not archive the field.",
        kind: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleArchiveStatus(status: CaseStatus) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Archive “${status.label}”? It will leave the list.`)
    ) {
      return;
    }
    setBusyKey(`status-${status.id}`);
    try {
      await archiveCaseStatus(orgId, status.id);
      await reloadStatuses();
      setToast({ message: "Status archived.", kind: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Could not archive the status.",
        kind: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSeedDefaults() {
    setBusyKey("seed");
    try {
      const response = await seedDefaultCaseStatuses(orgId);
      setStatuses(response.statuses);
      setToast({ message: "Default statuses added.", kind: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Could not add default statuses.",
        kind: "error",
      });
    } finally {
      setBusyKey(null);
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
        <PageHeader eyebrow="Organization" title="Customization" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Inbox}
            title="Customization is coming soon."
            description="Tailor your portal with custom fields and your own case statuses. This isn't enabled for your account yet."
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
          Loading customization…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
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
          title="Customization"
        />
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Teams
          </span>
          <h2 className="mt-3 font-heading text-xl font-semibold">
            Customization is part of B2B Portals on Teams.
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Custom fields and your own case statuses let your team capture
            exactly what each case needs. This organization isn&apos;t on a Teams
            plan yet.
          </p>
        </section>
      </PageContainer>
    );
  }

  if (loadError) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Customization" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  if (block === "view_only" && personFields.length === 0 && caseFields.length === 0) {
    // A non-member shouldn't reach here, but if the org read itself is forbidden
    // we surface a clear access message rather than an empty page.
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Customization" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={ShieldAlert}
            title="You don't have access to customization."
            description="Custom fields and statuses are managed by organization owners and admins. Ask an admin if you need access."
          />
        </div>
      </PageContainer>
    );
  }

  const activeFields = fieldTab === "person" ? personFields : caseFields;

  return (
    <PageContainer width="wide">
      {backLink}
      <PageHeader
        eyebrow={org?.name || "Organization"}
        title="Customization"
        description="Tailor your portal with custom fields and your own case statuses — the details every case and person needs."
      />

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can view customization. Adding, editing, and archiving custom
          fields and statuses is limited to organization owners and admins.
        </TrustNotice>
      )}

      {/* ---- Custom fields ---- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Custom fields</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Extra attributes your team fills in on each person or case. Kept
              internal to your team.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setFieldModal({ target: fieldTab })}>
              <Plus className="size-4" /> New field
            </Button>
          )}
        </div>

        <SegmentedControl
          value={fieldTab}
          options={FIELD_TABS}
          onChange={setFieldTab}
          label="Custom field target"
        />

        {activeFields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card">
            <EmptyState
              icon={Tags}
              title={
                fieldTab === "person"
                  ? "No person fields yet"
                  : "No case fields yet"
              }
              description={
                fieldTab === "person"
                  ? "Add a field to capture extra details about each person you serve."
                  : "Add a field to capture extra details about each case."
              }
              action={
                canManage ? (
                  <Button onClick={() => setFieldModal({ target: fieldTab })}>
                    <Plus className="size-4" /> New field
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="grid gap-2">
            {activeFields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                canManage={canManage}
                busy={busyKey === `field-${field.id}`}
                onEdit={() =>
                  setFieldModal({ target: field.target, field })
                }
                onArchive={() => void handleArchiveField(field)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Case statuses ---- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Case statuses</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your own stage names for a case. Each maps to a system status so
              readiness and queues keep working.
            </p>
          </div>
          {canManage && statuses.length > 0 && (
            <Button onClick={() => setStatusModal({})}>
              <Plus className="size-4" /> New status
            </Button>
          )}
        </div>

        {statuses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card">
            <EmptyState
              icon={Tags}
              title="No custom statuses yet"
              description="Start with a calm default set you can rename, or build your own from scratch."
              action={
                canManage ? (
                  <div className="flex flex-col items-center gap-2 sm:flex-row">
                    <Button
                      onClick={() => void handleSeedDefaults()}
                      disabled={busyKey === "seed"}
                    >
                      {busyKey === "seed" && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      Seed default statuses
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setStatusModal({})}
                    >
                      <Plus className="size-4" /> New status
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-5">
            {STATUS_CATEGORY_ORDER.map((category) => {
              const inCategory = statuses.filter(
                (status) => status.category === category,
              );
              if (inCategory.length === 0) return null;
              return (
                <StatusCategoryGroup
                  key={category}
                  category={category}
                  statuses={inCategory}
                  canManage={canManage}
                  busyKey={busyKey}
                  onEdit={(status) => setStatusModal({ status })}
                  onArchive={(status) => void handleArchiveStatus(status)}
                />
              );
            })}
          </div>
        )}
      </section>

      {fieldModal && canManage && (
        <CustomFieldFormModal
          orgId={orgId}
          target={fieldModal.target}
          field={fieldModal.field}
          onClose={() => setFieldModal(null)}
          onSaved={async () => {
            const wasEdit = Boolean(fieldModal.field);
            setFieldModal(null);
            await reloadFields();
            setToast({
              message: wasEdit ? "Field updated." : "Field created.",
              kind: "success",
            });
          }}
        />
      )}

      {statusModal && canManage && (
        <CaseStatusFormModal
          orgId={orgId}
          status={statusModal.status}
          onClose={() => setStatusModal(null)}
          onSaved={async () => {
            const wasEdit = Boolean(statusModal.status);
            setStatusModal(null);
            await reloadStatuses();
            setToast({
              message: wasEdit ? "Status updated." : "Status created.",
              kind: "success",
            });
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

function FieldRow({
  field,
  canManage,
  busy,
  onEdit,
  onArchive,
}: {
  field: CustomField;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const isArchived = !field.is_active;
  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-card",
        isArchived && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{field.label}</h3>
            <StatusBadge tone="neutral" withDot={false}>
              {FIELD_TYPE_LABELS[field.field_type]}
            </StatusBadge>
            {field.required && (
              <StatusBadge tone="info" withDot={false}>
                Required
              </StatusBadge>
            )}
            {field.visibility !== "internal" && (
              <StatusBadge tone="warning" withDot={false}>
                {FIELD_VISIBILITY_LABELS[field.visibility]}
              </StatusBadge>
            )}
            {isArchived && (
              <StatusBadge tone="neutral" withDot>
                Archived
              </StatusBadge>
            )}
          </div>
          {field.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {field.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Key: <code className="rounded bg-muted px-1">{field.key}</code>
          </p>
        </div>

        {canManage && !isArchived && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
              <Pencil className="size-3.5" aria-hidden /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onArchive}
              disabled={busy}
              className="text-muted-foreground"
            >
              Archive
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function StatusCategoryGroup({
  category,
  statuses,
  canManage,
  busyKey,
  onEdit,
  onArchive,
}: {
  category: StatusCategory;
  statuses: CaseStatus[];
  canManage: boolean;
  busyKey: string | null;
  onEdit: (status: CaseStatus) => void;
  onArchive: (status: CaseStatus) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {STATUS_CATEGORY_LABELS[category]}
      </h3>
      <ul className="mt-2 grid gap-2">
        {statuses.map((status) => {
          const isArchived = !status.is_active;
          return (
            <li
              key={status.id}
              className={cn(
                "rounded-xl border border-border bg-card p-3 shadow-card",
                isArchived && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CustomStatusChip status={status} />
                    {status.is_default && (
                      <StatusBadge tone="info" withDot={false}>
                        Default
                      </StatusBadge>
                    )}
                    {status.is_terminal && (
                      <StatusBadge tone="neutral" withDot={false}>
                        Terminal
                      </StatusBadge>
                    )}
                    {isArchived && (
                      <StatusBadge tone="neutral" withDot>
                        Archived
                      </StatusBadge>
                    )}
                  </div>
                  {status.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {status.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Maps to {status.maps_to_system_status.replace(/_/g, " ")}
                  </p>
                </div>

                {canManage && !isArchived && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(status)}
                      disabled={busyKey === `status-${status.id}`}
                    >
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onArchive(status)}
                      disabled={busyKey === `status-${status.id}`}
                      className="text-muted-foreground"
                    >
                      Archive
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

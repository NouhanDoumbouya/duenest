"use client";

import {
  FormEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Copy,
  DoorClosed,
  FileText,
  Loader2,
  Package,
  Plus,
  ShieldAlert,
  Upload,
  UsersRound,
} from "lucide-react";

import { ProductMetric, SegmentedControl } from "@/components/ui/product-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  CAMPAIGN_STATUS_LABELS,
  ORGANIZATION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  ROLE_LABELS,
  approveOrganizationRequest,
  bulkInviteOrganizationMembers,
  canEditOrganization,
  canManageOrganization,
  createOrganizationBundle,
  createOrganizationCampaign,
  createOrganizationDocument,
  createOrganizationRequest,
  createOrganizationSecureRoom,
  getOrganization,
  getOrganizationActivity,
  getOrganizationBundles,
  getOrganizationCalendar,
  getOrganizationCampaigns,
  getOrganizationDocuments,
  getOrganizationInvites,
  getOrganizationMembers,
  getOrganizationMyTasks,
  getOrganizationRequests,
  getOrganizationSecureRooms,
  getOrganizationSummary,
  listOrganizationRequestTemplates,
  rejectOrganizationRequest,
  submitOrganizationRequest,
  uploadOrganizationDocumentFile,
} from "@/lib/organizations";
import { cn } from "@/lib/utils";
import type {
  DocumentCollectionCampaign,
  DocumentRequest,
  Organization,
  OrganizationActivity,
  OrganizationBundle,
  OrganizationCalendarEvent,
  OrganizationDocument,
  OrganizationInvite,
  OrganizationMembership,
  OrganizationRequestTemplate,
  OrganizationRole,
  OrganizationSecureRoom,
  OrganizationSummary,
} from "@/types/organizations";

type WorkspaceTab =
  | "overview"
  | "requests"
  | "campaigns"
  | "documents"
  | "members"
  | "packs"
  | "activity";

interface WorkspaceState {
  organization: Organization;
  summary: OrganizationSummary;
  members: OrganizationMembership[];
  invites: OrganizationInvite[];
  documents: OrganizationDocument[];
  requests: DocumentRequest[];
  myTasks: DocumentRequest[];
  campaigns: DocumentCollectionCampaign[];
  bundles: OrganizationBundle[];
  rooms: OrganizationSecureRoom[];
  activity: OrganizationActivity[];
  calendarEvents: OrganizationCalendarEvent[];
}

const tabs: Array<{ value: WorkspaceTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "requests", label: "Requests" },
  { value: "campaigns", label: "Campaigns" },
  { value: "documents", label: "Documents" },
  { value: "members", label: "Members" },
  { value: "packs", label: "Packs" },
  { value: "activity", label: "Activity" },
];

export default function OrganizationWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const organizationId = Number(id);
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async (): Promise<WorkspaceState> => {
    const organization = await getOrganization(organizationId);
    const canManage = canManageOrganization(organization.user_role);
    const [
      summary,
      members,
      documents,
      requests,
      myTasks,
      campaigns,
      bundles,
      rooms,
      activity,
      calendar,
      invites,
    ] = await Promise.all([
      getOrganizationSummary(organizationId),
      getOrganizationMembers(organizationId),
      getOrganizationDocuments(organizationId),
      getOrganizationRequests(organizationId),
      getOrganizationMyTasks(organizationId),
      getOrganizationCampaigns(organizationId),
      getOrganizationBundles(organizationId),
      getOrganizationSecureRooms(organizationId),
      getOrganizationActivity(organizationId),
      getOrganizationCalendar(organizationId),
      canManage ? getOrganizationInvites(organizationId) : Promise.resolve([]),
    ]);
    return {
      organization,
      summary,
      members,
      documents,
      requests,
      myTasks: myTasks.items,
      campaigns,
      bundles,
      rooms,
      activity,
      calendarEvents: calendar.events,
      invites,
    };
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    fetchWorkspace()
      .then((nextState) => {
        if (!active) return;
        setState(nextState);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load this organization workspace.",
        );
      });
    return () => {
      active = false;
    };
  }, [fetchWorkspace]);

  async function refresh(message?: string) {
    const nextState = await fetchWorkspace();
    setState(nextState);
    if (message) setNotice(message);
  }

  if (error && state === null) {
    return (
      <PageContainer>
        <Link
          href="/dashboard/organizations"
          className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
        >
          <ArrowLeft className="size-4" />
          Organizations
        </Link>
        <Card>
          <CardContent className="py-10">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (!state) {
    return (
      <PageContainer className="space-y-6">
        <span className="sr-only" role="status">
          Loading organization workspace…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-1/2 max-w-sm" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageContainer>
    );
  }

  const organization = state.organization;
  const canManage = canManageOrganization(organization.user_role);
  const canEdit = canEditOrganization(organization.user_role);
  const overdueRequests = state.requests.filter((request) => request.is_overdue);
  const submittedRequests = state.requests.filter(
    (request) => request.status === "submitted",
  );

  return (
    <PageContainer width="full">
      <Link
        href="/dashboard/organizations"
        className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
      >
        <ArrowLeft className="size-4" />
        Organizations
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {organization.name}
            </h1>
            {organization.user_role && (
              <Badge variant="outline">{ROLE_LABELS[organization.user_role]}</Badge>
            )}
          </div>
          <p className="mt-1.5 max-w-3xl text-muted-foreground">
            {ORGANIZATION_TYPE_LABELS[organization.organization_type]}
            {organization.country ? ` - ${organization.country}` : ""} -{" "}
            {state.summary.member_count} members
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => setTab("documents")}>
              <FileText className="size-4" />
              Add document
            </Button>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setTab("requests")}>
                <ClipboardList className="size-4" />
                Request document
              </Button>
              <Button onClick={() => setTab("members")}>
                <UsersRound className="size-4" />
                Invite member
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <p
          className="rounded-lg bg-brand-success/10 px-4 py-3 text-sm text-brand-success"
          role="status"
        >
          {notice}
        </p>
      )}

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <SegmentedControl
        value={tab}
        options={tabs}
        onChange={setTab}
        label="Organization workspace sections"
        className="max-w-full overflow-x-auto"
      />

      {tab === "overview" && (
        <OverviewTab
          state={state}
          overdueRequests={overdueRequests}
          submittedRequests={submittedRequests}
        />
      )}
      {tab === "requests" && (
        <RequestsTab
          state={state}
          canManage={canManage}
          onRefresh={refresh}
          onError={setError}
        />
      )}
      {tab === "campaigns" && (
        <CampaignsTab
          state={state}
          canManage={canManage}
          onRefresh={refresh}
          onError={setError}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab
          state={state}
          canEdit={canEdit}
          onRefresh={refresh}
          onError={setError}
        />
      )}
      {tab === "members" && (
        <MembersTab
          state={state}
          canManage={canManage}
          onRefresh={refresh}
          onError={setError}
        />
      )}
      {tab === "packs" && (
        <PacksTab
          state={state}
          canManage={canManage}
          onRefresh={refresh}
          onError={setError}
        />
      )}
      {tab === "activity" && <ActivityTab state={state} />}
    </PageContainer>
  );
}

function OverviewTab({
  state,
  overdueRequests,
  submittedRequests,
}: {
  state: WorkspaceState;
  overdueRequests: DocumentRequest[];
  submittedRequests: DocumentRequest[];
}) {
  const summary = state.summary;
  return (
    <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProductMetric
            label="Documents"
            value={summary.document_count}
            hint={`${summary.missing_files_count} missing files`}
            icon={FileText}
            tone={summary.missing_files_count ? "warn" : "secure"}
          />
          <ProductMetric
            label="Open requests"
            value={summary.open_requests_count}
            hint={`${summary.overdue_requests_count} overdue`}
            icon={ShieldAlert}
            tone={summary.overdue_requests_count ? "danger" : "warn"}
          />
          <ProductMetric
            label="Campaign progress"
            value={`${summary.campaign_completion_percent}%`}
            hint={`${summary.active_campaigns_count} active`}
            icon={ClipboardList}
          />
          <ProductMetric
            label="Readiness"
            value={`${summary.readiness.score}%`}
            hint={summary.readiness.status.replace("_", " ")}
            icon={CheckCircle2}
            tone={
              summary.readiness.status === "healthy"
                ? "good"
                : summary.readiness.status === "critical"
                  ? "danger"
                  : "warn"
            }
          />
        </div>

        <SectionCard
          title="Readiness board"
          description="The next step that moves readiness forward, with anything still blocking it."
        >
          <div className="space-y-3">
            <p className="text-sm font-medium">{summary.next_recommended_action}</p>
            {summary.readiness.reasons.length > 0 ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {summary.readiness.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand-amber" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No unresolved readiness issues in the current snapshot.
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Member compliance preview">
          {/* Mobile: stacked cards, so nothing scrolls off-screen sideways. */}
          <ul className="space-y-3 sm:hidden">
            {state.members.slice(0, 6).map((member) => (
              <li key={member.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.user_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.user_email}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {ROLE_LABELS[member.role]}
                  </Badge>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>
                    Assigned:{" "}
                    <span className="font-medium text-foreground">
                      {member.assigned_requests_count}
                    </span>
                  </span>
                  <span>
                    Overdue:{" "}
                    <span className="font-medium text-foreground">
                      {member.overdue_requests_count}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: the full table. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Member</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Assigned</th>
                  <th className="py-2 font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {state.members.slice(0, 6).map((member) => (
                  <tr key={member.id}>
                    <td className="py-3">
                      <p className="font-medium">{member.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.user_email}
                      </p>
                    </td>
                    <td className="py-3">
                      <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                    </td>
                    <td className="py-3">{member.assigned_requests_count}</td>
                    <td className="py-3">{member.overdue_requests_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6">
        <SectionCard title="Open risk">
          <div className="space-y-3 text-sm">
            <RiskRow label="Overdue requests" value={overdueRequests.length} />
            <RiskRow label="Submitted for review" value={submittedRequests.length} />
            <RiskRow
              label="Upcoming deadlines"
              value={summary.upcoming_deadlines_count}
            />
            <RiskRow label="Active rooms" value={summary.active_secure_rooms_count} />
          </div>
        </SectionCard>

        <DeadlineList events={state.calendarEvents.slice(0, 6)} />

        <SectionCard title="Recent activity">
          <ActivityList items={state.activity.slice(0, 6)} />
        </SectionCard>
      </div>
    </div>
  );
}

function RequestsTab({
  state,
  canManage,
  onRefresh,
  onError,
}: {
  state: WorkspaceState;
  canManage: boolean;
  onRefresh: (message?: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiredType, setRequiredType] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [deadline, setDeadline] = useState("");
  const [submitRequestId, setSubmitRequestId] = useState("");
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<OrganizationRequestTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");

  // Reusable + system templates make recurring requests one click to set up.
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    listOrganizationRequestTemplates(state.organization.id)
      .then((result) => active && setTemplates(result))
      .catch(() => {
        /* templates are optional — the form still works without them */
      });
    return () => {
      active = false;
    };
  }, [canManage, state.organization.id]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => String(t.id) === id);
    if (!template) return;
    setTitle(template.name);
    setDescription(template.description);
    setRequiredType(template.required_file_type);
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await createOrganizationRequest(state.organization.id, {
        title,
        description,
        required_file_type: requiredType,
        assigned_to_member: assignedTo ? Number(assignedTo) : null,
        recipient_email: recipientEmail,
        deadline: deadline || null,
      });
      setTitle("");
      setDescription("");
      setRequiredType("");
      setAssignedTo("");
      setRecipientEmail("");
      setDeadline("");
      setTemplateId("");
      await onRefresh("Document request created.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to create request.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitRequestId || !submitFile) return;
    setBusy(true);
    onError(null);
    try {
      await submitOrganizationRequest(state.organization.id, Number(submitRequestId), {
        file: submitFile,
      });
      setSubmitRequestId("");
      setSubmitFile(null);
      await onRefresh("Request submitted.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to submit request.");
    } finally {
      setBusy(false);
    }
  }

  async function review(requestId: number, action: "approve" | "reject") {
    setBusy(true);
    onError(null);
    try {
      if (action === "approve") {
        await approveOrganizationRequest(state.organization.id, requestId);
      } else {
        await rejectOrganizationRequest(
          state.organization.id,
          requestId,
          "Rejected from workspace review.",
        );
      }
      await onRefresh(action === "approve" ? "Request approved." : "Request rejected.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to review request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <SectionCard title="Document requests">
        <RequestList
          requests={state.requests}
          canManage={canManage}
          onReview={review}
          busy={busy}
        />
      </SectionCard>

      <div className="space-y-6">
        {canManage && (
          <SectionCard title="Create request">
            <form className="space-y-4" onSubmit={createRequest}>
              {templates.length > 0 && (
                <Field label="Start from a template">
                  <select
                    value={templateId}
                    onChange={(event) => applyTemplate(event.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">No template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                        {template.is_system ? " (suggested)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Upload passport copy"
                />
              </Field>
              <Field label="Description">
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  placeholder="What exactly do you need, and any rules (e.g. PDF, both sides)?"
                />
              </Field>
              <Field label="Required file type">
                <Input
                  value={requiredType}
                  onChange={(event) => setRequiredType(event.target.value)}
                  placeholder="e.g. PDF, image"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Assigned member">
                  <select
                    value={assignedTo}
                    onChange={(event) => setAssignedTo(event.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">Unassigned</option>
                    {state.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.user_name || member.user_email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Deadline">
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="External recipient email">
                <Input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="recipient@example.com"
                />
              </Field>
              <Button type="submit" disabled={busy || !title.trim()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Create request
              </Button>
            </form>
          </SectionCard>
        )}

        <SectionCard title="My assigned requests">
          <form className="space-y-4" onSubmit={submitRequest}>
            <Field label="Request">
              <select
                value={submitRequestId}
                onChange={(event) => setSubmitRequestId(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select request</option>
                {state.myTasks.map((request) => (
                  <option key={request.id} value={request.id}>
                    {request.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="File">
              <Input
                type="file"
                onChange={(event) =>
                  setSubmitFile(event.target.files?.[0] ?? null)
                }
              />
            </Field>
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !submitRequestId || !submitFile}
            >
              <Upload className="size-4" />
              Submit file
            </Button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

function CampaignsTab({
  state,
  canManage,
  onRefresh,
  onError,
}: {
  state: WorkspaceState;
  canManage: boolean;
  onRefresh: (message?: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [requirementTitle, setRequirementTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await createOrganizationCampaign(state.organization.id, {
        title,
        deadline: deadline || undefined,
        target_all_members: true,
        requirements: requirementTitle ? [{ title: requirementTitle }] : [],
      });
      setTitle("");
      setDeadline("");
      setRequirementTitle("");
      await onRefresh("Campaign created.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to create campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <SectionCard title="Collection campaigns">
        <div className="space-y-3">
          {state.campaigns.length === 0 ? (
            <EmptyLine text="No campaigns yet." />
          ) : (
            state.campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{campaign.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.deadline
                        ? `Deadline ${formatDate(campaign.deadline)}`
                        : "No deadline"}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                  </Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${campaign.progress.completion_percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {campaign.progress.submitted_count} of{" "}
                  {campaign.progress.target_count} submitted
                </p>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {canManage && (
        <SectionCard title="Create campaign">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field label="Campaign name">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="Collect member IDs"
              />
            </Field>
            <Field label="Deadline">
              <Input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </Field>
            <Field label="First requirement">
              <Input
                value={requirementTitle}
                onChange={(event) => setRequirementTitle(event.target.value)}
                placeholder="Passport copy"
              />
            </Field>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Create campaign
            </Button>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

function DocumentsTab({
  state,
  canEdit,
  onRefresh,
  onError,
}: {
  state: WorkspaceState;
  canEdit: boolean;
  onRefresh: (message?: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [selectedDocument, setSelectedDocument] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await createOrganizationDocument(state.organization.id, {
        title,
        document_type: documentType,
      });
      setTitle("");
      setDocumentType("");
      await onRefresh("Organization document created.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to create document.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocument || !file) return;
    setBusy(true);
    onError(null);
    try {
      await uploadOrganizationDocumentFile(
        state.organization.id,
        Number(selectedDocument),
        file,
      );
      setSelectedDocument("");
      setFile(null);
      await onRefresh("File uploaded.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to upload file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <SectionCard title="Organization documents">
        <div className="space-y-3">
          {state.documents.length === 0 ? (
            <EmptyLine text="No organization documents yet." />
          ) : (
            state.documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{document.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {document.document_type || "Document"} - {document.file_count} files
                  </p>
                </div>
                <Badge variant={document.file_count ? "outline" : "destructive"}>
                  {document.file_count ? "Has files" : "Missing files"}
                </Badge>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {canEdit && (
        <div className="space-y-6">
          <SectionCard title="Add document">
            <form className="space-y-4" onSubmit={createDocument}>
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Club registration certificate"
                />
              </Field>
              <Field label="Type">
                <Input
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  placeholder="certificate"
                />
              </Field>
              <Button type="submit" disabled={busy || !title.trim()}>
                <Plus className="size-4" />
                Add document
              </Button>
            </form>
          </SectionCard>

          <SectionCard title="Upload file">
            <form className="space-y-4" onSubmit={uploadFile}>
              <Field label="Document">
                <select
                  value={selectedDocument}
                  onChange={(event) => setSelectedDocument(event.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Select document</option>
                  {state.documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="File">
                <Input
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={busy || !selectedDocument || !file}
              >
                <Upload className="size-4" />
                Upload file
              </Button>
            </form>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function MembersTab({
  state,
  canManage,
  onRefresh,
  onError,
}: {
  state: WorkspaceState;
  canManage: boolean;
  onRefresh: (message?: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<OrganizationRole>("member");
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await bulkInviteOrganizationMembers(state.organization.id, { emails, role });
      setEmails("");
      await onRefresh("Invite created.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to invite members.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite(invite: OrganizationInvite) {
    const url = `${window.location.origin}${invite.invite_url}`;
    await navigator.clipboard?.writeText(url);
    setCopied(invite.id);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <SectionCard title="Members">
        {/* Mobile: stacked cards instead of a sideways-scrolling table. */}
        <ul className="space-y-3 sm:hidden">
          {state.members.map((member) => (
            <li key={member.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{member.user_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user_email}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {ROLE_LABELS[member.role]}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="capitalize">Status: {member.status}</span>
                <span>
                  Assigned:{" "}
                  <span className="font-medium text-foreground">
                    {member.assigned_requests_count}
                  </span>
                </span>
                <span>
                  Overdue:{" "}
                  <span className="font-medium text-foreground">
                    {member.overdue_requests_count}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop: the full table. */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Member</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Assigned</th>
                <th className="py-2 font-medium">Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.members.map((member) => (
                <tr key={member.id}>
                  <td className="py-3">
                    <p className="font-medium">{member.user_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.user_email}
                    </p>
                  </td>
                  <td className="py-3">
                    <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                  </td>
                  <td className="py-3 capitalize">{member.status}</td>
                  <td className="py-3">{member.assigned_requests_count}</td>
                  <td className="py-3">{member.overdue_requests_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="space-y-6">
        {canManage && (
          <SectionCard title="Invite members">
            <form className="space-y-4" onSubmit={invite}>
              <Field label="Emails">
                <Textarea
                  value={emails}
                  onChange={(event) => setEmails(event.target.value)}
                  required
                  rows={5}
                  placeholder="member@example.com, teammate@example.com"
                />
              </Field>
              <Field label="Role">
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as OrganizationRole)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={busy || !emails.trim()}>
                <UsersRound className="size-4" />
                Send invite
              </Button>
            </form>
          </SectionCard>
        )}

        <SectionCard title="Pending invites">
          <div className="space-y-2">
            {state.invites.length === 0 ? (
              <EmptyLine text="No invites yet." />
            ) : (
              state.invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[invite.role]} - expires in{" "}
                      {invite.expires_in_days} days
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyInvite(invite)}
                    disabled={invite.status !== "pending"}
                  >
                    <Copy className="size-4" />
                    {copied === invite.id ? "Copied" : "Copy"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function PacksTab({
  state,
  canManage,
  onRefresh,
  onError,
}: {
  state: WorkspaceState;
  canManage: boolean;
  onRefresh: (message?: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [bundleTitle, setBundleTitle] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDocument, setRoomDocument] = useState("");
  const [busy, setBusy] = useState(false);

  async function createBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await createOrganizationBundle(state.organization.id, { title: bundleTitle });
      setBundleTitle("");
      await onRefresh("Pack created.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to create bundle.");
    } finally {
      setBusy(false);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await createOrganizationSecureRoom(state.organization.id, {
        title: roomTitle,
        status: "active",
        items: roomDocument ? [{ document: Number(roomDocument) }] : [],
      });
      setRoomTitle("");
      setRoomDocument("");
      await onRefresh("Secure room created.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to create room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Bundles">
        <div className="space-y-3">
          {state.bundles.length === 0 ? (
            <EmptyLine text="No organization bundles yet." />
          ) : (
            state.bundles.map((bundle) => (
              <div key={bundle.id} className="rounded-xl border border-border p-4">
                <p className="font-medium">{bundle.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bundle.status.replace("_", " ")} - readiness{" "}
                  {bundle.readiness_score}%
                </p>
              </div>
            ))
          )}
        </div>
        {canManage && (
          <form className="mt-5 flex gap-2" onSubmit={createBundle}>
            <Input
              value={bundleTitle}
              onChange={(event) => setBundleTitle(event.target.value)}
              placeholder="Event application pack"
            />
            <Button type="submit" disabled={busy || !bundleTitle.trim()}>
              <Package className="size-4" />
              Create
            </Button>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Secure rooms">
        <div className="space-y-3">
          {state.rooms.length === 0 ? (
            <EmptyLine text="No organization secure rooms yet." />
          ) : (
            state.rooms.map((room) => (
              <div key={room.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{room.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {room.status} - {room.items.length} items
                    </p>
                  </div>
                  {room.public_url && (
                    <Link
                      href={room.public_url}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Public view
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {canManage && (
          <form className="mt-5 space-y-3" onSubmit={createRoom}>
            <Field label="Room title">
              <Input
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder="Advisor review room"
              />
            </Field>
            <Field label="Included document">
              <select
                value={roomDocument}
                onChange={(event) => setRoomDocument(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No document selected</option>
                {state.documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={busy || !roomTitle.trim()}>
              <DoorClosed className="size-4" />
              Create room
            </Button>
          </form>
        )}
      </SectionCard>
    </div>
  );
}

function ActivityTab({ state }: { state: WorkspaceState }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <SectionCard title="Activity log">
        <ActivityList items={state.activity} />
      </SectionCard>
      <DeadlineList events={state.calendarEvents} />
    </div>
  );
}

function RequestList({
  requests,
  canManage,
  onReview,
  busy,
}: {
  requests: DocumentRequest[];
  canManage: boolean;
  onReview: (requestId: number, action: "approve" | "reject") => void;
  busy: boolean;
}) {
  if (requests.length === 0) return <EmptyLine text="No document requests yet." />;
  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div key={request.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{request.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {request.assigned_to_name || request.recipient_email || "Unassigned"}
                {request.deadline ? ` - due ${formatDate(request.deadline)}` : ""}
              </p>
            </div>
            <StatusBadge status={REQUEST_STATUS_LABELS[request.status]} />
          </div>
          {request.public_upload_token && (
            <p className="mt-3 break-all rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Public upload: /org-request/{request.public_upload_token}
            </p>
          )}
          {canManage && request.status === "submitted" && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onReview(request.id, "approve")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => onReview(request.id, "reject")}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ActivityList({ items }: { items: OrganizationActivity[] }) {
  if (items.length === 0) return <EmptyLine text="No activity yet." />;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 text-sm">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
          <span className="min-w-0">
            <span className="block font-medium">{item.safe_summary}</span>
            <span className="text-xs text-muted-foreground">
              {item.actor_name || "System"} - {formatDate(item.created_at)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DeadlineList({ events }: { events: OrganizationCalendarEvent[] }) {
  return (
    <SectionCard title="Deadlines">
      {events.length === 0 ? (
        <EmptyLine text="No upcoming organization deadlines." />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{event.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(event.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RiskRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const danger = ["Rejected", "Overdue", "Cancelled"].includes(status);
  const good = ["Approved", "Completed"].includes(status);
  return (
    <Badge variant={danger ? "destructive" : good ? "default" : "outline"}>
      {status}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useMemo(() => label.toLowerCase().replace(/\s+/g, "-"), [label]);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

import { apiFetch } from "./api";
import type {
  DocumentCollectionCampaign,
  DocumentRequest,
  DocumentRequestSubmission,
  Organization,
  OrganizationActivity,
  OrganizationBundle,
  OrganizationCalendarEvent,
  OrganizationDocument,
  OrganizationDocumentFile,
  OrganizationInvite,
  OrganizationInviteDetail,
  OrganizationMembership,
  OrganizationRole,
  OrganizationSecureRoom,
  OrganizationSummary,
  OrganizationType,
  Paginated,
  PublicDocumentRequest,
  PublicOrganizationSecureRoom,
} from "@/types/organizations";

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  student_association: "Student association",
  ngo: "NGO",
  club: "Club",
  small_team: "Small team",
  company: "Company",
  community_group: "Community group",
  scholarship_team: "Scholarship team",
  competition_team: "Competition team",
  other: "Other",
};

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const REQUEST_STATUS_LABELS: Record<DocumentRequest["status"], string> = {
  open: "Open",
  submitted: "Submitted",
  needs_changes: "Needs changes",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

export const CAMPAIGN_STATUS_LABELS: Record<
  DocumentCollectionCampaign["status"],
  string
> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

export function canManageOrganization(role: Organization["user_role"]) {
  return role === "owner" || role === "admin";
}

export function canEditOrganization(role: Organization["user_role"]) {
  return role === "owner" || role === "admin" || role === "member";
}

export function getOrganizations(): Promise<Paginated<Organization>> {
  return apiFetch<Paginated<Organization>>("/organizations/", { auth: true });
}

export function getOrganization(id: number): Promise<Organization> {
  return apiFetch<Organization>(`/organizations/${id}/`, { auth: true });
}

export function createOrganization(payload: {
  name: string;
  organization_type: OrganizationType;
  description?: string;
  country?: string;
  website?: string;
}): Promise<Organization> {
  return apiFetch<Organization>("/organizations/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function getOrganizationSummary(id: number): Promise<OrganizationSummary> {
  return apiFetch<OrganizationSummary>(`/organizations/${id}/summary/`, {
    auth: true,
  });
}

export function getOrganizationMembers(id: number): Promise<OrganizationMembership[]> {
  return apiFetch<OrganizationMembership[]>(`/organizations/${id}/members/`, {
    auth: true,
  });
}

export function updateOrganizationMember(
  orgId: number,
  membershipId: number,
  payload: Partial<Pick<OrganizationMembership, "role" | "status">>,
): Promise<OrganizationMembership> {
  return apiFetch<OrganizationMembership>(
    `/organizations/${orgId}/members/${membershipId}/`,
    { method: "PATCH", body: payload, auth: true },
  );
}

export function removeOrganizationMember(
  orgId: number,
  membershipId: number,
): Promise<void> {
  return apiFetch<void>(`/organizations/${orgId}/members/${membershipId}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function getOrganizationInvites(id: number): Promise<OrganizationInvite[]> {
  return apiFetch<OrganizationInvite[]>(`/organizations/${id}/invites/`, {
    auth: true,
  });
}

export function inviteOrganizationMember(
  id: number,
  payload: { email: string; role: OrganizationRole },
): Promise<OrganizationInvite> {
  return apiFetch<OrganizationInvite>(`/organizations/${id}/invites/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function bulkInviteOrganizationMembers(
  id: number,
  payload: { emails: string; role: OrganizationRole },
): Promise<{ count: number; items: OrganizationInvite[] }> {
  return apiFetch(`/organizations/${id}/invites/bulk/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function getOrganizationInvite(
  token: string,
): Promise<OrganizationInviteDetail> {
  return apiFetch<OrganizationInviteDetail>(
    `/organization-invites/${encodeURIComponent(token)}/`,
    { auth: true },
  );
}

export function acceptOrganizationInvite(
  token: string,
): Promise<OrganizationMembership> {
  return apiFetch<OrganizationMembership>(
    `/organization-invites/${encodeURIComponent(token)}/accept/`,
    { method: "POST", auth: true },
  );
}

export function getOrganizationDocuments(id: number): Promise<OrganizationDocument[]> {
  return apiFetch<OrganizationDocument[]>(`/organizations/${id}/documents/`, {
    auth: true,
  });
}

export function createOrganizationDocument(
  id: number,
  payload: Partial<OrganizationDocument> & { title: string },
): Promise<OrganizationDocument> {
  return apiFetch<OrganizationDocument>(`/organizations/${id}/documents/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function uploadOrganizationDocumentFile(
  orgId: number,
  documentId: number,
  file: File,
): Promise<OrganizationDocumentFile> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<OrganizationDocumentFile>(
    `/organizations/${orgId}/documents/${documentId}/files/`,
    { method: "POST", body, auth: true },
  );
}

export function getOrganizationRequests(id: number): Promise<DocumentRequest[]> {
  return apiFetch<DocumentRequest[]>(
    `/organizations/${id}/document-requests/`,
    { auth: true },
  );
}

export function getOrganizationMyTasks(id: number): Promise<{ items: DocumentRequest[] }> {
  return apiFetch<{ items: DocumentRequest[] }>(
    `/organizations/${id}/my-tasks/`,
    { auth: true },
  );
}

export function createOrganizationRequest(
  id: number,
  payload: Partial<DocumentRequest> & { title: string },
): Promise<DocumentRequest> {
  return apiFetch<DocumentRequest>(`/organizations/${id}/document-requests/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function submitOrganizationRequest(
  orgId: number,
  requestId: number,
  payload: { file: File; notes?: string },
): Promise<DocumentRequestSubmission> {
  const body = new FormData();
  body.append("file", payload.file);
  if (payload.notes) body.append("notes", payload.notes);
  return apiFetch<DocumentRequestSubmission>(
    `/organizations/${orgId}/document-requests/${requestId}/submit/`,
    { method: "POST", body, auth: true },
  );
}

export function approveOrganizationRequest(
  orgId: number,
  requestId: number,
): Promise<DocumentRequest> {
  return apiFetch<DocumentRequest>(
    `/organizations/${orgId}/document-requests/${requestId}/approve/`,
    { method: "POST", auth: true },
  );
}

export function rejectOrganizationRequest(
  orgId: number,
  requestId: number,
  rejectionReason: string,
): Promise<DocumentRequest> {
  return apiFetch<DocumentRequest>(
    `/organizations/${orgId}/document-requests/${requestId}/reject/`,
    { method: "POST", body: { rejection_reason: rejectionReason }, auth: true },
  );
}

export function requestOrganizationChanges(
  orgId: number,
  requestId: number,
  rejectionReason: string,
): Promise<DocumentRequest> {
  return apiFetch<DocumentRequest>(
    `/organizations/${orgId}/document-requests/${requestId}/request-changes/`,
    { method: "POST", body: { rejection_reason: rejectionReason }, auth: true },
  );
}

export function getOrganizationCampaigns(
  id: number,
): Promise<DocumentCollectionCampaign[]> {
  return apiFetch<DocumentCollectionCampaign[]>(`/organizations/${id}/campaigns/`, {
    auth: true,
  });
}

export function createOrganizationCampaign(
  id: number,
  payload: {
    title: string;
    description?: string;
    deadline?: string;
    target_all_members?: boolean;
    target_member_ids?: number[];
    requirements?: Array<{
      title: string;
      description?: string;
      required_file_type?: string;
      is_required?: boolean;
    }>;
  },
): Promise<DocumentCollectionCampaign> {
  return apiFetch<DocumentCollectionCampaign>(`/organizations/${id}/campaigns/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function getOrganizationBundles(id: number): Promise<OrganizationBundle[]> {
  return apiFetch<OrganizationBundle[]>(`/organizations/${id}/bundles/`, {
    auth: true,
  });
}

export function createOrganizationBundle(
  id: number,
  payload: { title: string; description?: string; target_date?: string },
): Promise<OrganizationBundle> {
  return apiFetch<OrganizationBundle>(`/organizations/${id}/bundles/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function getOrganizationSecureRooms(
  id: number,
): Promise<OrganizationSecureRoom[]> {
  return apiFetch<OrganizationSecureRoom[]>(
    `/organizations/${id}/secure-rooms/`,
    { auth: true },
  );
}

export function createOrganizationSecureRoom(
  id: number,
  payload: {
    title: string;
    description?: string;
    recipient_label?: string;
    permission?: "view_only" | "download_allowed";
    status?: OrganizationSecureRoom["status"];
    items?: Array<{ document?: number; file?: number; notes?: string }>;
  },
): Promise<OrganizationSecureRoom> {
  return apiFetch<OrganizationSecureRoom>(`/organizations/${id}/secure-rooms/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function getOrganizationActivity(id: number): Promise<OrganizationActivity[]> {
  return apiFetch<OrganizationActivity[]>(`/organizations/${id}/activity/`, {
    auth: true,
  });
}

export function getOrganizationCalendar(
  id: number,
): Promise<{ events: OrganizationCalendarEvent[] }> {
  return apiFetch<{ events: OrganizationCalendarEvent[] }>(
    `/organizations/${id}/calendar/`,
    { auth: true },
  );
}

export function getPublicDocumentRequest(
  token: string,
): Promise<PublicDocumentRequest> {
  return apiFetch<PublicDocumentRequest>(
    `/public/document-requests/${encodeURIComponent(token)}/`,
  );
}

export function uploadPublicDocumentRequest(
  token: string,
  payload: { file: File; email?: string; notes?: string },
): Promise<DocumentRequestSubmission> {
  const body = new FormData();
  body.append("file", payload.file);
  if (payload.email) body.append("email", payload.email);
  if (payload.notes) body.append("notes", payload.notes);
  return apiFetch<DocumentRequestSubmission>(
    `/public/document-requests/${encodeURIComponent(token)}/upload/`,
    { method: "POST", body },
  );
}

export function getPublicOrganizationSecureRoom(
  token: string,
): Promise<PublicOrganizationSecureRoom> {
  return apiFetch<PublicOrganizationSecureRoom>(
    `/public/organization-secure-rooms/${encodeURIComponent(token)}/`,
  );
}

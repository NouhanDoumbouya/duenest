// Client for Custom Document Organization V1 — folders, tags, collections, and
// smart views.
//
// Personal endpoints are owner-scoped under `/documents/...`. Organization
// endpoints are under `/organizations/{orgId}/portal/...` and are gated by the
// `b2b_portals` flag + a Teams entitlement; member reads / admin writes (a 403
// means "view only"). All requests flow through the shared `apiFetch` (cookie
// auth + CSRF + normalized errors).
//
// Trust model: folders are VIRTUAL metadata — a presentation lens. None of
// these payloads contain raw file URLs, tokens, or storage keys, and placing a
// document in a folder does NOT change its sharing or access.

import { ApiError, apiFetch } from "./api";
import type {
  Collection,
  CollectionItemsResponse,
  CollectionsResponse,
  CreateCollectionBody,
  CreateFolderBody,
  CreateTagBody,
  FlatFolder,
  FolderBreadcrumbItem,
  FolderContentsResponse,
  FolderNode,
  FoldersResponse,
  FolderType,
  OrgDocumentOrganization,
  OrgTag,
  SmartViewFilter,
  SmartViewPreset,
  SmartViewResponse,
  StructureMode,
  TagsResponse,
  UpdateFolderBody,
  UpdateOrgStructureBody,
} from "@/types/document-organization";

// ---- Query helpers ----------------------------------------------------------

/** Serialize a smart-view filter (or any flat record) to a query string. */
export function filterToQuery(
  filter: SmartViewFilter | Record<string, unknown> | undefined,
): string {
  if (!filter) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function orgBase(orgId: number, suffix = ""): string {
  return `/organizations/${orgId}/portal/${suffix}`;
}

// ---- Personal: folders ------------------------------------------------------

/** The user's folder tree (nested). Pass `includeArchived` to include archived. */
export function getFolders(includeArchived = false): Promise<FoldersResponse> {
  const query = includeArchived ? "?include_archived=true" : "";
  return apiFetch<FoldersResponse>(`/documents/folders/${query}`);
}

export function createFolder(body: CreateFolderBody): Promise<FolderNode> {
  return apiFetch<FolderNode>("/documents/folders/", {
    method: "POST",
    body,
  });
}

export function updateFolder(
  id: number,
  body: UpdateFolderBody,
): Promise<FolderNode> {
  return apiFetch<FolderNode>(`/documents/folders/${id}/`, {
    method: "PATCH",
    body,
  });
}

export function archiveFolder(id: number): Promise<FolderNode> {
  return apiFetch<FolderNode>(`/documents/folders/${id}/archive/`, {
    method: "POST",
  });
}

export function moveFolder(
  id: number,
  parentId: number | null,
): Promise<FolderNode> {
  return apiFetch<FolderNode>(`/documents/folders/${id}/move/`, {
    method: "POST",
    body: { parent_id: parentId },
  });
}

export function getFolderContents(
  id: number,
  filter?: SmartViewFilter,
): Promise<FolderContentsResponse> {
  return apiFetch<FolderContentsResponse>(
    `/documents/folders/${id}/contents/${filterToQuery(filter)}`,
  );
}

/** Move a document into a folder, or pass `null` to unfile it. */
export function moveDocumentToFolder(
  documentId: number,
  folderId: number | null,
): Promise<unknown> {
  return apiFetch<unknown>(`/documents/${documentId}/move-to-folder/`, {
    method: "POST",
    body: { folder_id: folderId },
  });
}

// ---- Personal: tags ---------------------------------------------------------

export function getTags(): Promise<TagsResponse> {
  return apiFetch<TagsResponse>("/documents/tags/");
}

export function createTag(body: CreateTagBody): Promise<OrgTag> {
  return apiFetch<OrgTag>("/documents/tags/", { method: "POST", body });
}

/** Replace a document's tag set with `tagIds`. */
export function assignDocumentTags(
  documentId: number,
  tagIds: number[],
): Promise<unknown> {
  return apiFetch<unknown>(`/documents/${documentId}/tags/`, {
    method: "POST",
    body: { tag_ids: tagIds },
  });
}

// ---- Personal: collections + saved views ------------------------------------

export function getCollections(): Promise<CollectionsResponse> {
  return apiFetch<CollectionsResponse>("/documents/collections/");
}

export function createCollection(
  body: CreateCollectionBody,
): Promise<Collection> {
  return apiFetch<Collection>("/documents/collections/", {
    method: "POST",
    body,
  });
}

/** Resolved documents for a collection (manual list or smart-view result). */
export function getCollectionItems(
  id: number,
): Promise<CollectionItemsResponse> {
  return apiFetch<CollectionItemsResponse>(`/documents/collections/${id}/items/`);
}

/** Add a document to a manual collection, or pass `remove` to take it out. */
export function addToCollection(
  collectionId: number,
  documentId: number,
  remove = false,
): Promise<unknown> {
  return apiFetch<unknown>(`/documents/collections/${collectionId}/items/`, {
    method: "POST",
    body: { document_id: documentId, remove },
  });
}

/** Collections of type `saved_view` (reusable smart filters). */
export function getSavedViews(): Promise<CollectionsResponse> {
  return apiFetch<CollectionsResponse>("/documents/saved-views/");
}

/** Resolve a smart-view filter into a live document list (no persistence). */
export function resolveSmartView(
  filter: SmartViewFilter,
): Promise<SmartViewResponse> {
  return apiFetch<SmartViewResponse>(`/documents/smart-view/${filterToQuery(filter)}`);
}

// ---- Organization -----------------------------------------------------------

export function getOrgDocumentOrganization(
  orgId: number,
): Promise<OrgDocumentOrganization> {
  return apiFetch<OrgDocumentOrganization>(orgBase(orgId, "document-organization/"));
}

export function updateOrgStructurePreference(
  orgId: number,
  body: UpdateOrgStructureBody,
): Promise<OrgDocumentOrganization> {
  return apiFetch<OrgDocumentOrganization>(
    orgBase(orgId, "document-organization/preferences/"),
    { method: "PATCH", body },
  );
}

export function getOrgFolders(
  orgId: number,
  includeArchived = false,
): Promise<FoldersResponse> {
  const query = includeArchived ? "?include_archived=true" : "";
  return apiFetch<FoldersResponse>(orgBase(orgId, `folders/${query}`));
}

export function createOrgFolder(
  orgId: number,
  body: CreateFolderBody,
): Promise<FolderNode> {
  return apiFetch<FolderNode>(orgBase(orgId, "folders/"), {
    method: "POST",
    body,
  });
}

export function updateOrgFolder(
  orgId: number,
  id: number,
  body: UpdateFolderBody,
): Promise<FolderNode> {
  return apiFetch<FolderNode>(orgBase(orgId, `folders/${id}/`), {
    method: "PATCH",
    body,
  });
}

export function archiveOrgFolder(
  orgId: number,
  id: number,
): Promise<FolderNode> {
  return apiFetch<FolderNode>(orgBase(orgId, `folders/${id}/archive/`), {
    method: "POST",
  });
}

export function moveOrgFolder(
  orgId: number,
  id: number,
  parentId: number | null,
): Promise<FolderNode> {
  return apiFetch<FolderNode>(orgBase(orgId, `folders/${id}/move/`), {
    method: "POST",
    body: { parent_id: parentId },
  });
}

export function getOrgFolderContents(
  orgId: number,
  id: number,
  filter?: SmartViewFilter,
): Promise<FolderContentsResponse> {
  return apiFetch<FolderContentsResponse>(
    orgBase(orgId, `folders/${id}/contents/${filterToQuery(filter)}`),
  );
}

export function getOrgTags(orgId: number): Promise<TagsResponse> {
  return apiFetch<TagsResponse>(orgBase(orgId, "tags/"));
}

export function createOrgTag(
  orgId: number,
  body: CreateTagBody,
): Promise<OrgTag> {
  return apiFetch<OrgTag>(orgBase(orgId, "tags/"), { method: "POST", body });
}

export function getOrgCollections(
  orgId: number,
): Promise<CollectionsResponse> {
  return apiFetch<CollectionsResponse>(orgBase(orgId, "collections/"));
}

export function createOrgCollection(
  orgId: number,
  body: CreateCollectionBody,
): Promise<Collection> {
  return apiFetch<Collection>(orgBase(orgId, "collections/"), {
    method: "POST",
    body,
  });
}

export function getOrgSavedViews(
  orgId: number,
): Promise<CollectionsResponse> {
  return apiFetch<CollectionsResponse>(orgBase(orgId, "saved-views/"));
}

export function createOrgSavedView(
  orgId: number,
  body: CreateCollectionBody,
): Promise<Collection> {
  return apiFetch<Collection>(orgBase(orgId, "saved-views/"), {
    method: "POST",
    body: { ...body, collection_type: "saved_view" },
  });
}

// ---- Error helpers ----------------------------------------------------------

/**
 * True for a plain 403 — typically a non-admin org member trying an admin-only
 * folder/structure write. Surface as "Only admins can change the folder
 * structure."
 */
export function isOrgOrgForbidden(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 403;
}

// ---- Pure label helpers -----------------------------------------------------

export const FOLDER_TYPE_LABELS: Record<FolderType, string> = {
  normal: "Folder",
  system: "System",
  case: "Case",
  person: "Person",
  template: "Template",
};

export const STRUCTURE_MODE_LABELS: Record<StructureMode, string> = {
  by_person: "By person",
  by_case: "By case",
  by_document_type: "By document type",
  by_template: "By template",
  custom: "Custom",
};

/** One-click smart-view lenses shown across the Vault and portal. */
export const SMART_VIEW_PRESETS: SmartViewPreset[] = [
  { key: "expiring_soon", label: "Expiring soon", filter: { expiring_soon: true } },
  {
    key: "recently_uploaded",
    label: "Recently uploaded",
    filter: { recently_uploaded: true },
  },
  { key: "needs_review", label: "Needs review", filter: { needs_review: true } },
  { key: "unfiled", label: "Unfiled", filter: { unfiled: true } },
];

// ---- Pure tree helpers (covered by document-organization.test.ts) -----------

/**
 * Depth-annotate a nested folder tree into a flat, render-ready list (depth-0
 * roots first, each followed by its descendants). Used for indented pickers and
 * sidebars. Order within a level follows the input order.
 */
export function flattenFolderTree(
  nodes: FolderNode[],
  depth = 0,
): FlatFolder[] {
  const out: FlatFolder[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0) {
      out.push(...flattenFolderTree(node.children, depth + 1));
    }
  }
  return out;
}

/** Find a folder by id anywhere in the tree, or null. */
export function findFolderInTree(
  nodes: FolderNode[],
  id: number,
): FolderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findFolderInTree(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Build the breadcrumb (root → … → target) for a folder id. Returns an empty
 * array when the id is not in the tree. Each item is `{ id, name }`.
 */
export function folderBreadcrumb(
  nodes: FolderNode[],
  id: number,
): FolderBreadcrumbItem[] {
  function walk(
    list: FolderNode[],
    trail: FolderBreadcrumbItem[],
  ): FolderBreadcrumbItem[] | null {
    for (const node of list) {
      const next = [...trail, { id: node.id, name: node.name }];
      if (node.id === id) return next;
      const deeper = walk(node.children, next);
      if (deeper) return deeper;
    }
    return null;
  }
  return walk(nodes, []) ?? [];
}

/**
 * Find the org folder linked to a given portal case (by `linked_case_id`),
 * searching the whole tree. Returns null when no case folder exists yet.
 */
export function findCaseFolder(
  nodes: FolderNode[],
  caseId: number,
): FolderNode | null {
  for (const node of nodes) {
    if (node.linked_case_id === caseId) return node;
    const found = findCaseFolder(node.children, caseId);
    if (found) return found;
  }
  return null;
}

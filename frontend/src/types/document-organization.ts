// Types for Custom Document Organization V1 — folders, tags, collections, and
// smart views for the personal Vault and the organization portal.
//
// Folders are VIRTUAL metadata: a presentation lens over documents. Payloads
// from these endpoints NEVER contain file URLs, tokens, or storage keys. Folder
// placement is presentation only and does not change sharing or access.

/** A folder's kind. System/case/person/template folders may be auto-managed. */
export type FolderType =
  | "normal"
  | "system"
  | "case"
  | "person"
  | "template";

/**
 * A node in the (nested) folder tree. `children` is the immediate child folders;
 * `document_count` is null when the backend did not compute it for that node.
 */
export interface FolderNode {
  id: number;
  name: string;
  parent_id: number | null;
  description: string;
  color: string;
  icon: string;
  sort_order: number;
  folder_type: FolderType;
  linked_case_id: number | null;
  linked_person_id: number | null;
  is_archived: boolean;
  document_count: number | null;
  children: FolderNode[];
}

/** A lightweight document row as returned by folder/collection/smart-view reads. */
export interface DocOrg {
  id: number;
  title: string;
  document_type: string;
  status: string;
  primary_folder_id: number | null;
  expiry_date: string | null;
  tags: string[];
  updated_at: string;
}

/** A user/org-owned tag. */
export interface OrgTag {
  id: number;
  name: string;
  slug: string;
  color: string;
}

/** A collection's kind. `saved_view` collections carry a `filter_config`. */
export type CollectionType = "manual" | "smart" | "saved_view";

/** A manual collection or a saved smart view. */
export interface Collection {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  collection_type: CollectionType;
  filter_config: SmartViewFilter;
  item_count: number;
  created_at: string;
}

/** How an org's portal folder tree is auto-structured. */
export type StructureMode =
  | "by_person"
  | "by_case"
  | "by_document_type"
  | "by_template"
  | "custom";

/** The org's folder-structure preference (admin-editable). */
export interface OrgStructurePreference {
  structure_mode: StructureMode;
  auto_create_case_folder: boolean;
  auto_create_person_folder: boolean;
  auto_file_accepted_uploads: boolean;
  default_root_folder_id: number | null;
}

/**
 * The whitelisted smart-view / saved-view filter keys. All optional; an empty
 * object resolves to "everything". Backend ignores any key not listed here.
 */
export interface SmartViewFilter {
  document_type?: string;
  tag_id?: number;
  folder_id?: number;
  status?: string;
  lifecycle_status?: string;
  expiring_soon?: boolean;
  needs_review?: boolean;
  recently_uploaded?: boolean;
  unfiled?: boolean;
  uploaded_after?: string;
  uploaded_before?: string;
  due_after?: string;
  due_before?: string;
}

/** Breadcrumb entry for a folder-contents view. */
export interface FolderBreadcrumbItem {
  id: number;
  name: string;
}

// ---- Response shapes --------------------------------------------------------

export interface FoldersResponse {
  folders: FolderNode[];
}

export interface FolderContentsResponse {
  folder: FolderNode;
  breadcrumb: FolderBreadcrumbItem[];
  documents: DocOrg[];
  count: number;
}

export interface TagsResponse {
  tags: OrgTag[];
}

export interface CollectionsResponse {
  collections: Collection[];
}

export interface CollectionItemsResponse {
  documents: DocOrg[];
  count: number;
}

export interface SmartViewResponse {
  filter_config: SmartViewFilter;
  documents: DocOrg[];
  count: number;
}

/** Org document-organization overview (folders + tags + collections + prefs). */
export interface OrgDocumentOrganization {
  folders: FolderNode[];
  tags: OrgTag[];
  collections: Collection[];
  preference: OrgStructurePreference;
}

// ---- Request bodies ---------------------------------------------------------

export interface CreateFolderBody {
  name: string;
  parent?: number | null;
  description?: string;
  color?: string;
  icon?: string;
  folder_type?: FolderType;
}

export interface UpdateFolderBody {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface CreateTagBody {
  name: string;
  color?: string;
}

export interface CreateCollectionBody {
  name: string;
  collection_type?: CollectionType;
  description?: string;
  color?: string;
  filter_config?: SmartViewFilter;
}

export interface UpdateOrgStructureBody {
  structure_mode?: StructureMode;
  auto_create_case_folder?: boolean;
  auto_create_person_folder?: boolean;
  auto_file_accepted_uploads?: boolean;
  default_root_folder_id?: number | null;
}

/** A folder annotated with its depth, for indented flat-list rendering. */
export interface FlatFolder {
  node: FolderNode;
  depth: number;
}

/** A named smart-view preset shown as a one-click lens. */
export interface SmartViewPreset {
  key: string;
  label: string;
  filter: SmartViewFilter;
}

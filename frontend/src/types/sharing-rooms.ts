// Types for Sharing Rooms V1 (apps.sharing_rooms). Owner-scoped.
//
// A Sharing Room is a single secure space an owner shares through one public
// link. It can gather several documents, files, and document requests in one
// place — useful for an application pack, an organization's onboarding, or any
// "here is everything you need from me" moment.
//
// Two surfaces:
//   * Owner endpoints (authenticated) manage rooms and their items.
//   * Public endpoints (token only, NO auth) expose a read view plus proxied
//     preview/download of the room's documents. The public view never includes
//     the owner's private file URLs — files are only reachable through the
//     token-scoped public proxy routes.

/** Lifecycle status of a sharing room. */
export type SharingRoomStatus = "active" | "expired" | "revoked" | "archived";

/** What kind of space the room represents (labels/context only). */
export type SharingRoomType =
  | "general"
  | "application"
  | "pack"
  | "organization"
  | "emergency";

/** The kind of thing an item in a room points at. */
export type SharingRoomItemType = "document" | "file" | "request";

/**
 * The PRIVATE file reference for a room item. `download_url` is the owner-only
 * route (`/api/v1/files/{id}/download/`) — used solely by the authenticated
 * owner via the blob-download helper, NEVER linked on the public page.
 */
export interface SharingRoomItemFileInfo {
  id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  /** PRIVATE owner-only download route. Do not surface publicly. */
  download_url: string;
}

/** Lightweight request reference attached to a room item. */
export interface SharingRoomItemRequestInfo {
  id: number;
  status: string;
  requested_document_title: string;
}

/** A single item placed inside a room by the owner. */
export interface SharingRoomItem {
  id: number;
  item_type: SharingRoomItemType;
  document: number | null;
  file: number | null;
  request_link: number | null;
  title: string;
  note: string;
  sort_order: number;
  file_info: SharingRoomItemFileInfo | null;
  request_info: SharingRoomItemRequestInfo | null;
  created_at: string;
}

/** A room participant (someone who has opened the link). */
export interface SharingRoomParticipant {
  id: number;
  name: string;
  email: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
}

/** A full sharing room owned by the current user. */
export interface SharingRoom {
  id: number;
  owner: number;
  title: string;
  description: string;
  room_type: SharingRoomType;
  status: SharingRoomStatus;
  /** Opaque token used in the public room URL. */
  token: string;
  /** The full public room URL the recipient visits. */
  public_url: string;

  linked_bundle: number | null;
  linked_application: number | null;

  expires_at: string | null;
  allow_download: boolean;
  allow_upload: boolean;

  items: SharingRoomItem[];
  participants: SharingRoomParticipant[];

  item_count: number;
  request_count: number;

  is_expired: boolean;
  is_open: boolean;

  opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  revoked_at: string | null;

  created_at: string;
  updated_at: string;
}

/** List response for the owner's sharing rooms. */
export interface SharingRoomListResponse {
  rooms: SharingRoom[];
  count: number;
}

/** Body for creating a sharing room. Only the title is required. */
export interface CreateSharingRoomBody {
  title: string;
  description?: string;
  room_type?: SharingRoomType;
  linked_bundle?: number;
  linked_application?: number;
  expires_at?: string;
  allow_download?: boolean;
  allow_upload?: boolean;
}

/** Body for editing a room's metadata (no status transitions here). */
export interface UpdateSharingRoomBody {
  title?: string;
  description?: string;
  room_type?: SharingRoomType;
  expires_at?: string | null;
  allow_download?: boolean;
  allow_upload?: boolean;
}

/** Body for adding an item to a room. The id field depends on `item_type`. */
export interface AddSharingRoomItemBody {
  item_type: SharingRoomItemType;
  document?: number;
  file?: number;
  request_link?: number;
  title?: string;
  note?: string;
}

// ---- Public (no-auth) shapes ------------------------------------------------

/** Why a public room can't currently be viewed. */
export type PublicSharingRoomState =
  | "ok"
  | "expired"
  | "revoked"
  | "not_found";

/** A document the public room exposes for viewing/downloading (no raw URL). */
export interface PublicSharingRoomDocument {
  /** Used ONLY against the token-scoped public proxy routes. Not a raw URL. */
  file_id: number;
  name: string;
  content_type: string;
  file_size: number;
  is_previewable: boolean;
  label: string;
}

/** A document request surfaced in the public room. */
export interface PublicSharingRoomRequest {
  title: string;
  instructions: string;
  status: string;
  can_upload: boolean;
  /** Token for the existing public document-request upload page, if open. */
  upload_token: string | null;
}

/** Context labels for a linked pack/application (no private ids). */
export interface PublicSharingRoomContext {
  pack_title?: string;
  application_title?: string;
}

/**
 * The PUBLIC view of a room, returned by the token route with NO auth. It omits
 * the owner's identity beyond a display name and never includes private file
 * URLs — documents are reachable only via the token-scoped public proxy routes.
 */
export interface PublicSharingRoom {
  title: string;
  description: string;
  room_type: SharingRoomType;
  status: SharingRoomStatus;
  allow_download: boolean;
  allow_upload: boolean;
  expires_at: string | null;
  /** Display name of the person who shared the room. */
  from_name: string;
  /** Optional app/organization name shown for context. */
  app_name: string;
  context: PublicSharingRoomContext;
  documents: PublicSharingRoomDocument[];
  requests: PublicSharingRoomRequest[];
  state: PublicSharingRoomState;
}

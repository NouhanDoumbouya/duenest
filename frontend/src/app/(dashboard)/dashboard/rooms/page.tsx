"use client";

// Owner dashboard for Sharing Rooms V1. Create a secure room that gathers
// documents, files, and requests behind one public link, then track who has
// opened it and revoke or archive when you're done. Private until you share the
// link — distinct from the older "Secure rooms" feature.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  Copy,
  Download,
  DoorOpen,
  FileText,
  FileUp,
  Loader2,
  Lock,
  Package,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import {
  formatFileSize,
  getInboxFileDownloadBlob,
  saveBlob,
} from "@/lib/document-files";
import {
  SHARING_ROOM_ITEM_TYPE_LABELS,
  SHARING_ROOM_STATUS_LABELS,
  SHARING_ROOM_STATUS_TONE,
  SHARING_ROOM_TYPE_LABELS,
  SHARING_ROOM_TYPE_ORDER,
  addSharingRoomItem,
  archiveSharingRoom,
  buildPublicRoomUrl,
  copyToClipboard,
  createSharingRoom,
  getSharingRooms,
  removeSharingRoomItem,
  revokeSharingRoom,
} from "@/lib/sharing-rooms";
import type {
  AddSharingRoomItemBody,
  CreateSharingRoomBody,
  SharingRoom,
  SharingRoomItem,
  SharingRoomItemType,
  SharingRoomType,
} from "@/types/sharing-rooms";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SharingRoomsPage() {
  const [rooms, setRooms] = useState<SharingRoom[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let active = true;
    getSharingRooms()
      .then((res) => active && setRooms(res.rooms))
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Could not load your sharing rooms.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const activeRoom = useMemo(
    () => (rooms ?? []).find((r) => r.id === activeId) ?? null,
    [rooms, activeId],
  );

  function upsert(updated: SharingRoom) {
    setRooms((current) =>
      (current ?? []).map((r) => (r.id === updated.id ? updated : r)),
    );
  }

  function prepend(created: SharingRoom) {
    setRooms((current) => [created, ...(current ?? [])]);
  }

  const hasRooms = (rooms ?? []).length > 0;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Prepare & share"
        title="Sharing Rooms"
        description="Gather documents, files, and requests behind one secure link. Private until you share it — revoke access any time."
        actions={
          hasRooms ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New room
            </Button>
          ) : undefined
        }
      />

      {loadError && <InlineAlert>{loadError}</InlineAlert>}

      {loading ? (
        <section
          className="grid gap-3"
          aria-busy="true"
          aria-label="Loading rooms"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : !hasRooms ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={DoorOpen}
            title="Create your first room."
            description="Bring a set of documents, files, and requests together behind one secure link — perfect for an application, an organization, or any 'here's everything you need' moment. Nothing is shared until you hand out the link."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" /> New room
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {(rooms ?? []).map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onOpen={() => setActiveId(room.id)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateRoomModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            prepend(created);
            setCreating(false);
            setActiveId(created.id);
            setToast({ message: "Room created.", kind: "success" });
          }}
        />
      )}

      {activeRoom && (
        <RoomDetailDrawer
          key={activeRoom.id}
          room={activeRoom}
          onClose={() => setActiveId(null)}
          onUpdated={upsert}
          onToast={setToast}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

// ---- List card -------------------------------------------------------------

function RoomCard({
  room,
  onOpen,
}: {
  room: SharingRoom;
  onOpen: () => void;
}) {
  const expires = formatDate(room.expires_at);
  const lastOpened = formatDate(room.last_opened_at);
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transform-none motion-reduce:transition-none">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 text-left focus-visible:outline-none"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <DoorOpen className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{room.title}</h3>
            <StatusBadge
              tone={SHARING_ROOM_STATUS_TONE[room.status]}
              withDot={false}
            >
              {SHARING_ROOM_STATUS_LABELS[room.status]}
            </StatusBadge>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {SHARING_ROOM_TYPE_LABELS[room.room_type]}
            </span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" aria-hidden />
              {room.item_count} item{room.item_count === 1 ? "" : "s"}
            </span>
            {room.request_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileUp className="size-3.5" aria-hidden />
                {room.request_count} request
                {room.request_count === 1 ? "" : "s"}
              </span>
            )}
            {(room.linked_bundle || room.linked_application) && (
              <span className="inline-flex items-center gap-1">
                <Package className="size-3.5" aria-hidden />
                {room.linked_application ? "Application" : "Pack"}
              </span>
            )}
            {expires && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden /> Expires{" "}
                {expires}
              </span>
            )}
            {lastOpened ? (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden /> Last opened{" "}
                {lastOpened}
              </span>
            ) : (
              <span>Not opened yet</span>
            )}
          </p>
        </div>
        <ArrowUpRight
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
    </article>
  );
}

// ---- Create modal ----------------------------------------------------------

function CreateRoomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: SharingRoom) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState<SharingRoomType>("general");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowUpload, setAllowUpload] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);

  const titleEmpty = title.trim().length === 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (titleEmpty) {
      setTitleTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    const body: CreateSharingRoomBody = {
      title: title.trim(),
      room_type: roomType,
      allow_download: allowDownload,
      allow_upload: allowUpload,
    };
    if (description.trim()) body.description = description.trim();
    if (expiresAt) body.expires_at = expiresAt;

    try {
      const created = await createSharingRoom(body);
      onCreated(created);
    } catch (err) {
      // Plan-limit 403 is surfaced globally (apiFetch dispatches
      // duenest:plan-limit → upgrade modal). Show a friendly inline note too.
      if (err instanceof ApiError && err.status === 403) {
        const data = err.data as Record<string, unknown> | null;
        if (data?.code === "plan_limit_exceeded") {
          setError(
            "You've reached your plan's sharing-room limit. Upgrade to create more.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError(
          err instanceof ApiError ? err.message : "Could not create this room.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="New sharing room"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              New sharing room
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Private until you share the link. No public link is live yet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-title">
              Room title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="e.g. Visa application documents"
              aria-invalid={titleTouched && titleEmpty}
              disabled={submitting}
            />
            {titleTouched && titleEmpty && (
              <p className="text-xs text-destructive">
                Give the room a clear title.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-description">Description (optional)</Label>
            <Textarea
              id="sr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short note explaining what's in this room."
              rows={3}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sr-type">Room type</Label>
              <select
                id="sr-type"
                value={roomType}
                onChange={(e) =>
                  setRoomType(e.target.value as SharingRoomType)
                }
                disabled={submitting}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {SHARING_ROOM_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {SHARING_ROOM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sr-expires">Link expires (optional)</Label>
              <Input
                id="sr-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Permissions
            </legend>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={allowDownload}
                onChange={(e) => setAllowDownload(e.target.checked)}
                disabled={submitting}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Allow downloads</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Visitors can download the documents, not just preview them.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={allowUpload}
                onChange={(e) => setAllowUpload(e.target.checked)}
                disabled={submitting}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Allow uploads</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Let visitors respond to document requests you add to the room.
                </span>
              </span>
            </label>
          </fieldset>

          {error && <InlineAlert>{error}</InlineAlert>}

          <TrustNotice icon={ShieldCheck} title="Private until shared">
            No public link has been created yet — only people you send the link
            to can open the room, and you can revoke access at any time.
          </TrustNotice>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || titleEmpty}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create room
          </Button>
        </div>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Detail drawer ---------------------------------------------------------

function RoomDetailDrawer({
  room,
  onClose,
  onUpdated,
  onToast,
}: {
  room: SharingRoom;
  onClose: () => void;
  onUpdated: (room: SharingRoom) => void;
  onToast: (t: ToastState) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const publicUrl = buildPublicRoomUrl(room);
  const expires = formatDate(room.expires_at);
  const isActive = room.status === "active";

  async function handleCopy() {
    const ok = await copyToClipboard(publicUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      onToast({ message: "Could not copy the link.", kind: "error" });
    }
  }

  async function run(
    key: string,
    fn: () => Promise<SharingRoom>,
    successMessage: string,
  ) {
    setBusy(key);
    try {
      const updated = await fn();
      onUpdated(updated);
      onToast({ message: successMessage, kind: "success" });
    } catch (err) {
      onToast({
        message: err instanceof ApiError ? err.message : "Something went wrong.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadItem(item: SharingRoomItem) {
    if (!item.file_info) return;
    setBusy(`dl-${item.id}`);
    try {
      const blob = await getInboxFileDownloadBlob(item.file_info.id);
      saveBlob(blob, item.file_info.original_filename);
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Could not download the file.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={room.title}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                tone={SHARING_ROOM_STATUS_TONE[room.status]}
                withDot={false}
              >
                {SHARING_ROOM_STATUS_LABELS[room.status]}
              </StatusBadge>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {SHARING_ROOM_TYPE_LABELS[room.room_type]}
              </span>
            </div>
            <h2 className="mt-2 font-heading text-lg font-semibold break-words">
              {room.title}
            </h2>
            {room.description && (
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {room.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Status notices for blocked rooms */}
        {room.status === "revoked" && (
          <div className="mt-4">
            <InlineAlert>
              This room is revoked. The link no longer works for anyone.
            </InlineAlert>
          </div>
        )}
        {room.status === "expired" && (
          <div className="mt-4">
            <InlineAlert tone="warn">
              This room has expired. Visitors can no longer open the link.
            </InlineAlert>
          </div>
        )}

        {/* Secure link + copy */}
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Secure room link
          </h3>
          <p className="mt-1.5 truncate font-mono text-xs text-foreground/80">
            {publicUrl || "Link will appear once the room is ready."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!publicUrl}
            >
              {copied ? (
                <Check className="size-4 text-brand-success" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            {publicUrl && (
              <Link
                href={`/room/${room.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                <ArrowUpRight className="size-3.5" aria-hidden />
                Open public preview
              </Link>
            )}
          </div>
        </div>

        {/* Permissions + dates */}
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Downloads</dt>
            <dd className="font-medium">
              {room.allow_download ? "Allowed" : "Off"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Uploads</dt>
            <dd className="font-medium">
              {room.allow_upload ? "Allowed" : "Off"}
            </dd>
          </div>
          {expires && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Link expires</dt>
              <dd className="font-medium">{expires}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Opened</dt>
            <dd className="font-medium">
              {room.open_count} time{room.open_count === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>

        {/* Linked pack / application */}
        {(room.linked_bundle || room.linked_application) && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Package className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {room.linked_application
                  ? "Linked to an application"
                  : "Linked to an application pack"}
              </p>
              <p className="text-xs text-muted-foreground">
                Items were gathered from the linked source.
              </p>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Items ({room.items.length})
            </h3>
          </div>
          {room.items.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-4 text-center text-sm text-muted-foreground">
              No items yet. Add a document, file, or request below.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {room.items.map((item) => (
                <RoomItemRow
                  key={item.id}
                  item={item}
                  canRemove={isActive}
                  removing={busy === `rm-${item.id}`}
                  downloading={busy === `dl-${item.id}`}
                  onDownload={() => handleDownloadItem(item)}
                  onRemove={() =>
                    run(
                      `rm-${item.id}`,
                      () => removeSharingRoomItem(room.id, item.id),
                      "Item removed.",
                    )
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Add item (V1: by id) */}
        {isActive && (
          <AddItemForm
            disabled={busy !== null}
            onAdd={(body, key) =>
              run(key, () => addSharingRoomItem(room.id, body), "Item added.")
            }
          />
        )}

        {/* Footer: revoke + archive */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            <Lock className="mr-1 inline size-3.5" aria-hidden />
            Revoking stops the link working for everyone.
          </p>
          <div className="flex gap-2">
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() =>
                  run(
                    "revoke",
                    () => revokeSharingRoom(room.id),
                    "Room revoked.",
                  )
                }
                disabled={busy === "revoke"}
              >
                {busy === "revoke" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Revoke
              </Button>
            )}
            {room.status !== "archived" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  run(
                    "archive",
                    () => archiveSharingRoom(room.id),
                    "Room archived.",
                  )
                }
                disabled={busy === "archive"}
              >
                {busy === "archive" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Archive
              </Button>
            )}
          </div>
        </div>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function RoomItemRow({
  item,
  canRemove,
  removing,
  downloading,
  onDownload,
  onRemove,
}: {
  item: SharingRoomItem;
  canRemove: boolean;
  removing: boolean;
  downloading: boolean;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const fileInfo = item.file_info;
  const requestInfo = item.request_info;
  const title =
    item.title ||
    fileInfo?.original_filename ||
    requestInfo?.requested_document_title ||
    SHARING_ROOM_ITEM_TYPE_LABELS[item.item_type];

  const Icon = item.item_type === "request" ? FileUp : FileText;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          {SHARING_ROOM_ITEM_TYPE_LABELS[item.item_type]}
          {fileInfo ? ` · ${formatFileSize(fileInfo.file_size)}` : ""}
          {requestInfo ? ` · ${requestInfo.status}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {fileInfo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            disabled={downloading}
            aria-label="Download item"
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
          </Button>
        )}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            disabled={removing}
            aria-label="Remove item"
          >
            {removing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        )}
      </div>
    </li>
  );
}

function AddItemForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (body: AddSharingRoomItemBody, key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<SharingRoomItemType>("document");
  const [refId, setRefId] = useState("");
  const [itemTitle, setItemTitle] = useState("");

  const idEmpty = refId.trim().length === 0 || Number.isNaN(Number(refId));

  function submit() {
    if (idEmpty) return;
    const id = Number(refId);
    const body: AddSharingRoomItemBody = { item_type: itemType };
    if (itemType === "document") body.document = id;
    else if (itemType === "file") body.file = id;
    else body.request_link = id;
    if (itemTitle.trim()) body.title = itemTitle.trim();
    onAdd(body, "add-item");
    setRefId("");
    setItemTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <Plus className="size-4" /> Add item
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sr-item-type">Type</Label>
          <select
            id="sr-item-type"
            value={itemType}
            onChange={(e) =>
              setItemType(e.target.value as SharingRoomItemType)
            }
            disabled={disabled}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="document">Document</option>
            <option value="file">File</option>
            <option value="request">Request</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sr-item-id">
            {SHARING_ROOM_ITEM_TYPE_LABELS[itemType]} ID
          </Label>
          <Input
            id="sr-item-id"
            inputMode="numeric"
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder="e.g. 42"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="sr-item-title">Label (optional)</Label>
        <Input
          id="sr-item-title"
          value={itemTitle}
          onChange={(e) => setItemTitle(e.target.value)}
          placeholder="Shown to visitors instead of the file name"
          disabled={disabled}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Add by ID for now. A full picker is coming. Find IDs in your Vault, File
        Inbox, or Document Requests.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={disabled}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={disabled || idEmpty}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  );
}

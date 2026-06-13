"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import { getDocuments } from "@/lib/documents";
import { getDocumentFiles } from "@/lib/document-files";
import {
  addShareRoomItem,
  deleteShareRoom,
  getShareRoom,
  getShareRoomActivity,
  removeShareRoomItem,
  revokeShareRoom,
} from "@/lib/share-rooms";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";
import type { RoomActivity, RoomStatus, ShareRoom } from "@/types/share-rooms";

const statusClass: Record<RoomStatus, string> = {
  active: "bg-brand-success/10 text-brand-success",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
  limit_reached: "bg-amber-100 text-amber-700",
};

function countdown(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
}

function roomUrl(token: string): string {
  if (typeof window === "undefined") return `/rooms/${token}`;
  return `${window.location.origin}/rooms/${token}`;
}

export default function ShareRoomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = Number(params.id);

  const [room, setRoom] = useState<ShareRoom | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activity, setActivity] = useState<RoomActivity[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const [selectedDoc, setSelectedDoc] = useState<string>("");
  const [docFiles, setDocFiles] = useState<DocumentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(roomId)) return;
    let active = true;
    getShareRoom(roomId)
      .then((result) => active && setRoom(result))
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This room could not be found."
            : "Unable to load this room.",
        );
      });
    getDocuments({ ordering: "title" })
      .then((page) => active && setDocuments(page.results))
      .catch(() => active && setDocuments([]));
    getShareRoomActivity(roomId)
      .then((entries) => active && setActivity(entries))
      .catch(() => active && setActivity([]));
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!selectedDoc) return;
    let active = true;
    getDocumentFiles(Number(selectedDoc))
      .then((page) => active && setDocFiles(page.results))
      .catch(() => active && setDocFiles([]));
    return () => {
      active = false;
    };
  }, [selectedDoc]);

  // Derived so we never clear state synchronously inside the effect above.
  const visibleDocFiles = selectedDoc ? docFiles : [];

  const summaryLine = useMemo(() => {
    if (!room) return "";
    const parts = [
      `${room.file_count} file${room.file_count === 1 ? "" : "s"}`,
      room.permission === "view_only" ? "View-only" : "Download allowed",
    ];
    if (room.watermark_enabled) parts.push("Watermarked");
    if (room.access_code_required) parts.push("Access code");
    parts.push(countdown(room.expires_at));
    return parts.join(" · ");
  }, [room]);

  async function refresh() {
    try {
      setRoom(await getShareRoom(roomId));
    } catch {
      /* keep existing */
    }
  }

  async function handleAddDocument() {
    if (!selectedDoc) return;
    setBusy(true);
    setError(null);
    try {
      setRoom(await addShareRoomItem(roomId, { document: Number(selectedDoc) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add document.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFile(fileId: number) {
    setBusy(true);
    setError(null);
    try {
      setRoom(await addShareRoomItem(roomId, { file: fileId }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(itemId: number) {
    setBusy(true);
    try {
      await removeShareRoomItem(roomId, itemId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(roomUrl(room.token));
      setCopyMessage(
        room.permission === "view_only"
          ? "Room link copied. View-only access is enabled."
          : "Room link copied.",
      );
    } catch {
      setCopyMessage("Could not copy the link. Select it manually.");
    }
  }

  async function handleRevoke() {
    setConfirmRevoke(false);
    try {
      setRoom(await revokeShareRoom(roomId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke room.");
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      await deleteShareRoom(roomId);
      router.push("/dashboard/share-rooms");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete room.");
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl py-16 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link
          href="/dashboard/share-rooms"
          className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
        >
          Back to rooms
        </Link>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading room…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        href="/dashboard/share-rooms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Secure rooms
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {room.title}
            </h1>
            <Badge variant="outline" className={statusClass[room.status]}>
              {room.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{summaryLine}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/rooms/${room.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Eye className="size-4" />
            Preview as recipient
          </a>
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="size-4" />
            Copy link
          </Button>
        </div>
      </div>

      {copyMessage && (
        <p className="flex items-center gap-2 rounded-lg bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
          <Check className="size-4" />
          {copyMessage}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Files &amp; documents</CardTitle>
          <CardDescription>
            Only the items below are shared. Everything else in your vault stays
            private.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {room.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No items yet. Add a document or file below to share it through this
              room.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {room.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {item.kind}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(item.id)}
                    disabled={busy}
                    aria-label={`Remove ${item.title}`}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <p className="mb-2 text-sm font-medium">Add to this room</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedDoc}
                onChange={(event) => setSelectedDoc(event.target.value)}
                className="h-10 flex-1 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">Choose a document…</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleAddDocument}
                disabled={!selectedDoc || busy}
              >
                <Plus className="size-4" />
                Add whole document
              </Button>
            </div>
            {visibleDocFiles.length > 0 && (
              <ul className="mt-3 space-y-1">
                {visibleDocFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-2 text-sm"
                  >
                    <span className="truncate">{file.original_filename}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddFile(file.id)}
                      disabled={busy}
                    >
                      Add file
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Access &amp; security</CardTitle>
          <CardDescription>
            These settings are enforced for everyone who opens the room link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SummaryRow
            label="Permission"
            value={
              room.permission === "view_only"
                ? "View only (downloads blocked)"
                : "View and download"
            }
          />
          <SummaryRow
            label="Expiry"
            value={countdown(room.expires_at)}
          />
          <SummaryRow
            label="Access code"
            value={room.access_code_required ? "Required" : "Not required"}
          />
          <SummaryRow
            label="Watermark"
            value={room.watermark_enabled ? "Enabled" : "Off"}
          />
          <SummaryRow
            label="Access limit"
            value={
              room.access_limit_type === "one_time"
                ? `One-time view (${room.view_count}/1 used)`
                : room.access_limit_type === "limited_count"
                  ? `${room.view_count}/${room.max_views ?? "?"} views used`
                  : "Unlimited"
            }
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmRevoke(true)}
              disabled={room.status === "revoked"}
            >
              <ShieldCheck className="size-4" />
              Revoke room
            </Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete room
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Opens, previews, and downloads will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {activity.slice(0, 12).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="capitalize">
                    {entry.action.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke this room?"
        description="The room link will stop working immediately for everyone."
        confirmLabel="Revoke"
        onConfirm={handleRevoke}
        onCancel={() => setConfirmRevoke(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this room?"
        description="This permanently removes the room and its link. Your documents are not affected."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

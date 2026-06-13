"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DoorClosed, Loader2, Lock, Plus, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import { createShareRoom, listShareRooms } from "@/lib/share-rooms";
import { cn } from "@/lib/utils";
import type { RoomPermission, RoomStatus, ShareRoom } from "@/types/share-rooms";

const statusClass: Record<RoomStatus, string> = {
  active: "bg-brand-success/10 text-brand-success",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
  limit_reached: "bg-amber-100 text-amber-700",
};

const statusLabel: Record<RoomStatus, string> = {
  active: "active",
  expired: "expired",
  revoked: "revoked",
  limit_reached: "limit reached",
};

export default function ShareRoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<ShareRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [permission, setPermission] = useState<RoomPermission>("view_only");
  const [expiryDays, setExpiryDays] = useState("7");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listShareRooms()
      .then((result) => active && setRooms(result))
      .catch((err) => {
        if (!active) return;
        setRooms([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load secure rooms.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const expires =
        expiryDays === "never"
          ? null
          : new Date(
              Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000,
            ).toISOString();
      const room = await createShareRoom({
        title: title.trim(),
        permission,
        expires_at: expires,
      });
      router.push(`/dashboard/share-rooms/${room.id}`);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not create this room.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Packs &amp; sharing
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Secure rooms
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Share only the documents and files you choose — with expiry, an
            access code, watermarking, and view-only controls. A room never
            exposes the rest of your vault.
          </p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)}>
          <Plus className="size-4" />
          New room
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card"
        >
          <div className="space-y-2">
            <Label htmlFor="room-title">Room title</Label>
            <Input
              id="room-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Visa application pack"
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="room-permission">Permission</Label>
              <select
                id="room-permission"
                value={permission}
                onChange={(event) =>
                  setPermission(event.target.value as RoomPermission)
                }
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="view_only">View only</option>
                <option value="download_allowed">View and download</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-expiry">Expires in</Label>
              <select
                id="room-expiry"
                value={expiryDays}
                onChange={(event) => setExpiryDays(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="never">No expiry</option>
              </select>
            </div>
          </div>
          {createError && (
            <p className="text-sm text-destructive" role="alert">
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !title.trim()}>
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Create room
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {rooms === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading rooms…</span>
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <DoorClosed className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No secure rooms yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create a room to share a curated set of documents with a recipient,
            with full control over expiry, access codes, and downloads.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/dashboard/share-rooms/${room.id}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="truncate font-medium">{room.title}</p>
                <Badge
                  variant="outline"
                  className={cn("shrink-0", statusClass[room.status])}
                >
                  {statusLabel[room.status]}
                </Badge>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {room.file_count} file{room.file_count === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  {room.permission === "view_only"
                    ? "View-only"
                    : "Download allowed"}
                </span>
                {room.watermark_enabled && (
                  <>
                    <span>·</span>
                    <span>Watermarked</span>
                  </>
                )}
                {room.access_code_required && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" /> Code
                    </span>
                  </>
                )}
              </p>
              {room.expires_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Expires {formatDate(room.expires_at)}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link
          href="/dashboard/bundles"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
        >
          Looking for application packs? Open bundles
        </Link>
      </p>
    </div>
  );
}

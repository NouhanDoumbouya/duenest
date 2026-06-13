"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DoorClosed,
  Eye,
  FileText,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  DataRow,
  InlineAlert,
  ProductMetric,
  SectionToolbar,
  TrustNotice,
} from "@/components/ui/product-ui";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
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
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  limit_reached: "Limit reached",
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

  const metrics = useMemo(() => {
    const list = rooms ?? [];
    return {
      active: list.filter((room) => room.status === "active").length,
      protected: list.filter((room) => room.access_code_required).length,
      viewOnly: list.filter((room) => room.permission === "view_only").length,
      files: list.reduce((sum, room) => sum + room.file_count, 0),
    };
  }, [rooms]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
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
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Packs & sharing"
        title="Secure rooms"
        description="Create private rooms that expose only the documents and files you choose, with expiry, view-only controls, access codes, and watermarking."
        actions={
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus className="size-4" />
            New room
          </Button>
        }
      />

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.9fr]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ProductMetric
              icon={DoorClosed}
              label="Active rooms"
              value={rooms === null ? "..." : metrics.active}
              hint="Recipient-ready spaces"
              tone="secure"
            />
            <ProductMetric
              icon={Lock}
              label="Access-code rooms"
              value={rooms === null ? "..." : metrics.protected}
              hint="Extra verification enabled"
              tone="warn"
            />
            <ProductMetric
              icon={Eye}
              label="View-only rooms"
              value={rooms === null ? "..." : metrics.viewOnly}
              hint="Downloads blocked"
              tone="good"
            />
            <ProductMetric
              icon={FileText}
              label="Shared files"
              value={rooms === null ? "..." : metrics.files}
              hint="Explicitly included"
            />
          </div>

          <SectionCard
            title="Room inventory"
            description="Review active, expired, revoked, and limited rooms without exposing private vault contents."
            action={
              rooms && (
                <span className="text-sm text-muted-foreground">
                  {rooms.length} room{rooms.length === 1 ? "" : "s"}
                </span>
              )
            }
          >
            {rooms === null ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-[74px] rounded-xl" />
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <EmptyState
                icon={DoorClosed}
                title="No secure rooms yet"
                description="Create a room when you need to share a curated document set without exposing the rest of your vault."
                action={
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus className="size-4" />
                    Create a room
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {rooms.map((room) => (
                  <DataRow
                    key={room.id}
                    label={
                      <Link
                        href={`/dashboard/share-rooms/${room.id}`}
                        className="hover:text-primary"
                      >
                        {room.title}
                      </Link>
                    }
                    meta={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          {room.file_count} file
                          {room.file_count === 1 ? "" : "s"}
                        </span>
                        <span>{room.item_count} item{room.item_count === 1 ? "" : "s"}</span>
                        <span>
                          {room.permission === "view_only"
                            ? "View-only"
                            : "Download allowed"}
                        </span>
                        {room.access_code_required && (
                          <span className="inline-flex items-center gap-1">
                            <Lock className="size-3" />
                            Access code
                          </span>
                        )}
                        {room.expires_at && (
                          <span>Expires {formatDate(room.expires_at)}</span>
                        )}
                      </span>
                    }
                    value={
                      <Badge
                        variant="outline"
                        className={cn("shrink-0", statusClass[room.status])}
                      >
                        {statusLabel[room.status]}
                      </Badge>
                    }
                    action={
                      <Link
                        href={`/dashboard/share-rooms/${room.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        Open
                      </Link>
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-4">
          {showCreate ? (
            <SectionCard
              title="Create secure room"
              description="Start with safe defaults, then add files and access controls on the room detail page."
            >
              <form onSubmit={handleCreate} className="space-y-4">
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="room-permission">Permission</Label>
                    <select
                      id="room-permission"
                      value={permission}
                      onChange={(event) =>
                        setPermission(event.target.value as RoomPermission)
                      }
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="1">1 day</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="never">No expiry</option>
                    </select>
                  </div>
                </div>
                {createError && <InlineAlert>{createError}</InlineAlert>}
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
            </SectionCard>
          ) : (
            <TrustNotice icon={ShieldCheck} title="Recipient safety model">
              A room is a curated share space. Public recipients can only see
              items explicitly added to that room, and owner controls decide
              expiry, downloads, watermarking, and access-code requirements.
            </TrustNotice>
          )}

          <SectionToolbar>
            <div>
              <p className="text-sm font-medium">Application packs live in Bundles</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use rooms for controlled sharing, and bundles for application
                readiness and export workflows.
              </p>
            </div>
            <Link
              href="/dashboard/bundles"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Open bundles
            </Link>
          </SectionToolbar>
        </aside>
      </div>
    </PageContainer>
  );
}

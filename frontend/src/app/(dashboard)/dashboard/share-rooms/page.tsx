"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DoorClosed,
  Eye,
  FileText,
  Lock,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/lib/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { listShareRooms } from "@/lib/share-rooms";
import { cn } from "@/lib/utils";
import type { RoomStatus, ShareRoom } from "@/types/share-rooms";

const statusTone: Record<RoomStatus, StatusTone> = {
  active: "success",
  expired: "neutral",
  revoked: "danger",
  limit_reached: "warning",
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

  // Creating a new multi-item share is unified on the SafeSend engine: a new
  // "room" is a multi-item SafeSend session, built in the one share wizard.
  // Existing rooms below keep working and open on their own detail page.
  function startNewShare() {
    router.push("/dashboard/quick-share/new");
  }

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

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Packs & sharing"
        title="Secure rooms"
        description="Create private rooms that expose only the documents and files you choose, with expiry, view-only controls, access codes, and watermarking."
        actions={
          <Button onClick={startNewShare}>
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
                  <Button onClick={startNewShare}>
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
                      <StatusBadge
                        tone={statusTone[room.status]}
                        className="shrink-0"
                      >
                        {statusLabel[room.status]}
                      </StatusBadge>
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
          <TrustNotice icon={ShieldCheck} title="Recipient safety model">
            A room is a curated share space. Public recipients can only see items
            explicitly added to that room, and owner controls decide expiry,
            downloads, watermarking, and access-code requirements. New rooms are
            created in the secure share wizard.
          </TrustNotice>

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

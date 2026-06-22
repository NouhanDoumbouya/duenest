"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Inbox, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { InlineAlert } from "@/components/ui/product-ui";
import type { StatusTone } from "@/lib/status-badge";
import { ApiError } from "@/lib/api";
import {
  closeShareRequest,
  createShareRequest,
  deleteShareRequest,
  listShareRequests,
} from "@/lib/share-requests";
import { cn } from "@/lib/utils";
import type { CreateShareRequestItem, ShareRequest } from "@/types/share-requests";

interface DraftItem {
  label: string;
  is_required: boolean;
}

// Request status -> canonical badge tone (see lib/status-badge). Open requests
// read positive, responded reads informational, finished states stay quiet.
const statusTone: Record<string, StatusTone> = {
  open: "success",
  closed: "neutral",
  expired: "neutral",
  responded: "info",
};

export default function ShareRequestsPage() {
  const [requests, setRequests] = useState<ShareRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { label: "", is_required: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = useCallback(() => {
    listShareRequests()
      .then((result) => {
        setRequests(result);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Unable to load requests.",
        ),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setRequests(null);
    load();
  }, [load]);

  const validItems = items.filter((item) => item.label.trim());
  const canSubmit = title.trim() && validItems.length > 0 && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const payload = {
        title: title.trim(),
        message: message.trim(),
        items: validItems.map<CreateShareRequestItem>((item) => ({
          label: item.label.trim(),
          is_required: item.is_required,
        })),
      };
      const created = await createShareRequest(payload);
      setRequests((prev) => [created, ...(prev ?? [])]);
      setTitle("");
      setMessage("");
      setItems([{ label: "", is_required: true }]);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not create this request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(req: ShareRequest) {
    const url = `${window.location.origin}${req.respond_path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(req.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard can fail silently (permissions); nothing else to do.
    }
  }

  async function handleClose(req: ShareRequest) {
    const updated = await closeShareRequest(req.id);
    setRequests((prev) =>
      (prev ?? []).map((r) => (r.id === req.id ? updated : r)),
    );
  }

  async function handleDelete(req: ShareRequest) {
    await deleteShareRequest(req.id);
    setRequests((prev) => (prev ?? []).filter((r) => r.id !== req.id));
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Sharing"
        title="Document requests"
        description="Ask someone for the exact documents you need. They fill your checklist from their CertaNest vault in a few taps — no email back-and-forth."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        {/* List */}
        <div className="space-y-3">
          {error ? (
            <ErrorState description={error} onRetry={retry} />
          ) : requests === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Create a request to ask someone for documents. You'll get a link to send them."
            />
          ) : (
            requests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{req.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {req.items.length} item
                      {req.items.length === 1 ? "" : "s"} ·{" "}
                      {req.response_count} response
                      {req.response_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusBadge
                    tone={statusTone[req.status] ?? "neutral"}
                    className="capitalize"
                  >
                    {req.status}
                  </StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(req)}
                  >
                    {copiedId === req.id ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copiedId === req.id ? "Copied" : "Copy link"}
                  </Button>
                  {req.is_open && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClose(req)}
                    >
                      <X className="size-4" />
                      Close
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(req)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create */}
        <aside>
          <SectionCard
            title="New request"
            description="Title it, then list each document you need."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="req-title">Title</Label>
                <Input
                  id="req-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Rental application documents"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="req-message">Message (optional)</Label>
                <Input
                  id="req-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please provide these by Friday."
                />
              </div>

              <div className="space-y-2">
                <Label>Requested items</Label>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={item.label}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === index ? { ...it, label: e.target.value } : it,
                            ),
                          )
                        }
                        placeholder={
                          index === 0 ? "Passport" : "Proof of address"
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === index
                                ? { ...it, is_required: !it.is_required }
                                : it,
                            ),
                          )
                        }
                        className={cn(
                          "shrink-0 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                          item.is_required
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                        aria-pressed={item.is_required}
                      >
                        {item.is_required ? "Required" : "Optional"}
                      </button>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                          aria-label="Remove item"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      { label: "", is_required: false },
                    ])
                  }
                >
                  <Plus className="size-4" />
                  Add item
                </Button>
              </div>

              {createError && <InlineAlert tone="danger">{createError}</InlineAlert>}

              <Button onClick={handleCreate} disabled={!canSubmit} className="w-full">
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Create request
              </Button>
            </div>
          </SectionCard>
        </aside>
      </div>
    </PageContainer>
  );
}

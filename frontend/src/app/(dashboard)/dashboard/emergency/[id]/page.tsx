"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Lock,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getDocuments, formatDate } from "@/lib/documents";
import { getDocumentFiles } from "@/lib/document-files";
import {
  EMERGENCY_STATUS_LABELS,
  addEmergencyPackItem,
  buildShareUrl,
  deleteEmergencyPack,
  disableEmergencyPack,
  enableEmergencyPack,
  getEmergencyPack,
  regenerateEmergencyPackLink,
  removeEmergencyPackItem,
} from "@/lib/emergency";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";
import type { EmergencyPack } from "@/types/emergency";

export default function EmergencyPackDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [pack, setPack] = useState<EmergencyPack | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid pack.",
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add-item form
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<number | "">("");
  const [docFiles, setDocFiles] = useState<DocumentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<number | "">("");
  const [itemNotes, setItemNotes] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getEmergencyPack(id)
      .then((result) => active && setPack(result))
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This pack could not be found.");
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Unable to load the pack.",
          );
        }
      });
    getDocuments({ ordering: "title" })
      .then((page) => active && setDocuments(page.results))
      .catch(() => active && setDocuments([]));
    return () => {
      active = false;
    };
  }, [id, validId]);

  // Load files for the selected document so a specific file can be chosen.
  useEffect(() => {
    if (selectedDoc === "") return;
    let active = true;
    getDocumentFiles(Number(selectedDoc))
      .then((page) => active && setDocFiles(page.results))
      .catch(() => active && setDocFiles([]));
    return () => {
      active = false;
    };
  }, [selectedDoc]);

  // Resetting dependent selection happens in the handler (not in an effect) to
  // avoid cascading renders.
  function handleSelectDoc(value: number | "") {
    setSelectedDoc(value);
    setSelectedFile("");
    setDocFiles([]);
  }

  async function runAction(
    action: (packId: number) => Promise<EmergencyPack>,
    label: string,
  ) {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await action(id);
      setPack(updated);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : `Could not ${label}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem(event: React.FormEvent) {
    event.preventDefault();
    if (selectedDoc === "") {
      setActionError("Choose a document to add.");
      return;
    }
    setAdding(true);
    setActionError(null);
    try {
      await addEmergencyPackItem(id, {
        linked_document: Number(selectedDoc),
        linked_file: selectedFile === "" ? null : Number(selectedFile),
        notes: itemNotes.trim(),
      });
      const refreshed = await getEmergencyPack(id);
      setPack(refreshed);
      setSelectedDoc("");
      setSelectedFile("");
      setItemNotes("");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not add the item.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveItem(itemId: number) {
    setActionError(null);
    try {
      await removeEmergencyPackItem(id, itemId);
      setPack((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((i) => i.id !== itemId),
              item_count: prev.item_count - 1,
            }
          : prev,
      );
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not remove the item.",
      );
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteEmergencyPack(id);
      router.push("/dashboard/emergency");
      router.refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not delete the pack.",
      );
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  const shareUrl = pack ? buildShareUrl(pack.share_url_path) : null;

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Could not copy the link. Copy it manually.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/dashboard/emergency"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to emergency access
      </Link>

      {loadError ? (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </p>
      ) : pack === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading pack…</span>
        </div>
      ) : (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {pack.title}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  pack.status === "active"
                    ? "bg-brand-success/10 text-brand-success"
                    : pack.status === "expired"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {EMERGENCY_STATUS_LABELS[pack.status]}
              </span>
              {pack.access_code_required && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3.5" /> Code protected
                </span>
              )}
            </div>
            {pack.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {pack.description}
              </p>
            )}
            {pack.expires_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Access expires {formatDate(pack.expires_at)}
              </p>
            )}
          </div>

          {actionError && (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {actionError}
            </p>
          )}

          {/* Sharing & status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Access &amp; sharing</CardTitle>
              <CardDescription>
                Activate the pack to make it usable. Shareable packs get a secret
                link you can revoke at any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {pack.status === "active" ? (
                  <Button
                    variant="outline"
                    onClick={() => runAction(disableEmergencyPack, "disable the pack")}
                    disabled={busy}
                  >
                    <PowerOff className="size-4" />
                    Disable access
                  </Button>
                ) : (
                  <Button
                    onClick={() => runAction(enableEmergencyPack, "enable the pack")}
                    disabled={busy}
                  >
                    <Power className="size-4" />
                    Activate
                  </Button>
                )}
                {pack.access_mode === "share_link" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      runAction(regenerateEmergencyPackLink, "regenerate the link")
                    }
                    disabled={busy}
                  >
                    <RefreshCw className="size-4" />
                    Regenerate link
                  </Button>
                )}
              </div>

              {pack.access_mode === "share_link" ? (
                shareUrl ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="share-url">Public share link</Label>
                    <div className="flex gap-2">
                      <Input
                        id="share-url"
                        readOnly
                        value={shareUrl}
                        className="h-10 font-mono text-xs"
                      />
                      <Button variant="outline" onClick={copyShareUrl}>
                        {copied ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Anyone with this link can view the items in this pack. Share
                      the access code, if set, through a separate channel.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Activate the pack to generate a shareable link.
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  This pack is owner-only. Switch the access mode to a shareable
                  link from the list if you want to share it.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Included documents</CardTitle>
              <CardDescription>
                Only the items added here are ever exposed — never your whole
                vault.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pack.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No documents added yet. Add one below to build the pack.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pack.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.document_title ?? "Document"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.file_name
                            ? `File: ${item.file_name}`
                            : "Whole document"}
                          {item.notes && ` · ${item.notes}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveItem(item.id)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={handleAddItem}
                className="space-y-3 rounded-xl border border-border bg-muted/25 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="add-doc">Document</Label>
                    <select
                      id="add-doc"
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={selectedDoc}
                      onChange={(e) =>
                        handleSelectDoc(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                    >
                      <option value="">Choose a document…</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="add-file">Specific file (optional)</Label>
                    <select
                      id="add-file"
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                      value={selectedFile}
                      disabled={selectedDoc === "" || docFiles.length === 0}
                      onChange={(e) =>
                        setSelectedFile(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                    >
                      <option value="">Whole document</option>
                      {docFiles.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.original_filename}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="add-notes">Notes (optional)</Label>
                  <Input
                    id="add-notes"
                    className="h-10"
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    placeholder="Why this matters in an emergency…"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={adding}>
                    {adding ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Add to pack
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium">Delete this pack</p>
                <p className="text-xs text-muted-foreground">
                  Removes the pack and disables any link. Your documents are not
                  affected.
                </p>
              </div>
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                Delete pack
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete emergency pack?"
        description="The pack and any share link will be removed. The documents inside your vault are not affected."
        confirmLabel="Delete pack"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

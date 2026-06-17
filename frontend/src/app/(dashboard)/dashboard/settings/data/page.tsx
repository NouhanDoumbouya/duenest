"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Database,
  Download,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { PwaStatusCard } from "@/components/pwa/pwa-status-card";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  cancelAccountDeletion,
  downloadDocumentExport,
  getAccountDataSummary,
  requestAccountDeletion,
  requestDataExport,
} from "@/lib/onboarding";
import type {
  AccountDataSummary,
  AccountDeletionRequest,
  DocumentExportRequest,
} from "@/types/onboarding";

const countLabels: Record<keyof AccountDataSummary["counts"], string> = {
  documents: "Documents",
  trashed_documents: "Trashed documents",
  files: "Files",
  share_links: "Share links",
  reminder_rules: "Reminder rules",
  checklists: "Checklists",
  bundles: "Bundles",
  proof_records: "Proof records",
  emergency_packs: "Emergency packs",
  export_requests: "Export requests",
};

function StatusMessage({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  if (error) {
    return (
      <p
        className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        role="alert"
      >
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p className="rounded-lg bg-brand-success/10 px-4 py-3 text-sm text-brand-success">
        {message}
      </p>
    );
  }
  return null;
}

export default function DataSettingsPage() {
  const [summary, setSummary] = useState<AccountDataSummary | null>(null);
  const [latestExport, setLatestExport] = useState<DocumentExportRequest | null>(null);
  const [latestDeletion, setLatestDeletion] =
    useState<AccountDeletionRequest | null>(null);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    getAccountDataSummary()
      .then((data) => {
        setSummary(data);
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load account data controls.",
        );
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    setBusy("export");
    setError(null);
    setMessage(null);
    try {
      const exportRequest = await requestDataExport();
      setLatestExport(exportRequest);
      setMessage("Your export is ready.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create export.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadExport(exportRequest: DocumentExportRequest) {
    setBusy("download-export");
    setError(null);
    setMessage(null);
    try {
      await downloadDocumentExport(exportRequest);
      setMessage("Export download started.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not download this export.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletionRequest() {
    setBusy("delete");
    setError(null);
    setMessage(null);
    try {
      const deletion = await requestAccountDeletion(reason);
      setLatestDeletion(deletion);
      setMessage("Account deletion request has been recorded.");
      setConfirmDelete(false);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not request account deletion.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelDeletion() {
    setBusy("cancel");
    setError(null);
    setMessage(null);
    try {
      const deletion = await cancelAccountDeletion();
      setLatestDeletion(deletion);
      setMessage("Account deletion request has been cancelled.");
      load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not cancel the deletion request.",
      );
    } finally {
      setBusy(null);
    }
  }

  const activeDeletion =
    latestDeletion?.status === "requested" || latestDeletion?.status === "processing"
      ? latestDeletion
      : summary?.active_deletion_request;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Data controls
          </h1>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">
            Review account data counts, request a structured export, or create a
            cancellable account deletion request.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <StatusMessage error={error} message={message} />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ListChecks className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Guided setup</CardTitle>
              <CardDescription className="mt-1">
                Walk through the readiness setup again to add a document, set an
                expiry, and turn on a reminder.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/readiness-setup"
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
          >
            Replay readiness setup
          </Link>
        </CardHeader>
      </Card>

      <PwaStatusCard />

      {!summary ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="h-[260px] animate-pulse" />
          <Card className="h-[260px] animate-pulse" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(summary.counts).map(([key, value]) => (
              <Card key={key} size="sm">
                <CardHeader>
                  <CardDescription>
                    {countLabels[key as keyof AccountDataSummary["counts"]]}
                  </CardDescription>
                  <CardTitle className="text-2xl">{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Download className="size-4" />
                  </span>
                  <CardTitle>Export data</CardTitle>
                </div>
                <CardDescription>
                  Create a structured metadata export. Raw document files are not
                  included in this beta export.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  type="button"
                  onClick={handleExport}
                  disabled={busy !== null}
                >
                  {busy === "export" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Database className="size-4" />
                  )}
                  Request export
                </Button>
                {(latestExport || summary.latest_export) && (
                  <div className="rounded-lg border border-border p-4 text-sm">
                    <p className="font-medium">
                      Latest export:{" "}
                      {(latestExport ?? summary.latest_export)?.status}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Requested{" "}
                      {formatDate(
                        (latestExport ?? summary.latest_export)?.requested_at,
                      )}
                    </p>
                    {latestExport?.download_url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => handleDownloadExport(latestExport)}
                        disabled={busy !== null}
                      >
                        {busy === "download-export" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FileText className="size-4" />
                        )}
                        Download export
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <ShieldAlert className="size-4" />
                  </span>
                  <CardTitle>Account deletion</CardTitle>
                </div>
                <CardDescription>
                  Deletion is recorded as a request first. It is not performed
                  immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeDeletion ? (
                  <div className="rounded-lg border border-border p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <Archive className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          Request status: {activeDeletion.status}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Scheduled for{" "}
                          {formatDate(activeDeletion.scheduled_for)}
                        </p>
                      </div>
                    </div>
                    {activeDeletion.can_cancel && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={handleCancelDeletion}
                        disabled={busy !== null}
                      >
                        <X className="size-4" />
                        Cancel request
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Optional reason"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setConfirmDelete(true)}
                      disabled={busy !== null}
                    >
                      <Trash2 className="size-4" />
                      Request account deletion
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Request account deletion?"
        description="This records a deletion request that can still be cancelled while it is pending. It will not delete the account immediately."
        confirmLabel="Request deletion"
        loading={busy === "delete"}
        onConfirm={handleDeletionRequest}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

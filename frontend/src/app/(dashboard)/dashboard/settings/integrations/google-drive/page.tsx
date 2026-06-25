"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/lib/api";
import {
  driveImportReasonLabel,
  getDriveDestinations,
  getDriveFiles,
  getIntegrationAccounts,
  importDriveFiles,
  previewDriveImport,
} from "@/lib/integrations";
import type {
  ConnectedAccount,
  DriveDestination,
  DriveDestinations,
  DriveFile,
  DriveImportResult,
  DrivePreviewResult,
} from "@/types/integrations";

const TYPE_FILTERS = [
  { key: "", label: "All" },
  { key: "pdf", label: "PDF" },
  { key: "image", label: "Images" },
  { key: "doc", label: "Word" },
  { key: "google", label: "Google" },
];

const PRIVACY_POINTS = [
  "Import selected files only — your wider Drive stays private.",
  "CertaNest will not delete or modify files in Google Drive.",
  "No automatic sync is enabled.",
  "Files are saved into CertaNest private storage after you confirm.",
];

type Step = "browse" | "review" | "done";

export default function GoogleDriveImportPage() {
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [destinations, setDestinations] = useState<DriveDestinations | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [fileType, setFileType] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [listing, setListing] = useState(false);
  const [selected, setSelected] = useState<Record<string, DriveFile>>({});

  const [destType, setDestType] = useState("file_inbox");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [packId, setPackId] = useState<number | null>(null);

  const [step, setStep] = useState<Step>("browse");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DrivePreviewResult | null>(null);
  const [result, setResult] = useState<DriveImportResult | null>(null);

  useEffect(() => {
    let active = true;
    getIntegrationAccounts()
      .then((data) => {
        const google = data.accounts.find(
          (a) => a.provider === "google" && a.status !== "disconnected",
        );
        if (!active) return;
        if (!google) {
          setNotConnected(true);
          return;
        }
        setAccount(google);
        // Load destinations + the first page of files (all in async callbacks).
        return Promise.all([
          getDriveDestinations().then((d) => {
            if (active) setDestinations(d);
          }),
          getDriveFiles(google.id, {})
            .then((r) => {
              if (active) setFiles(r.files);
            })
            .catch(() => {
              if (active) setError("Couldn't load your Drive files.");
            }),
        ]);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else setError("Couldn't load Google Drive import.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadFiles(account_: ConnectedAccount, q: string, type: string) {
    setListing(true);
    setError(null);
    try {
      const data = await getDriveFiles(account_.id, { q, fileType: type });
      setFiles(data.files);
    } catch (err) {
      if (err instanceof ApiError && err.data && (err.data as { status?: string }).status === "not_configured")
        setError("Google Drive isn't configured on this server yet.");
      else setError("Couldn't load your Drive files. Please try again.");
    } finally {
      setListing(false);
    }
  }

  function toggleFile(file: DriveFile) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[file.provider_file_id]) delete next[file.provider_file_id];
      else next[file.provider_file_id] = file;
      return next;
    });
  }

  function buildDestination(): DriveDestination {
    if (destType === "folder" && folderId) return { type: "folder", folder_id: folderId };
    if (destType === "pack" && packId) return { type: "pack", pack_id: packId };
    return { type: destType === "vault" ? "vault" : "file_inbox" };
  }

  function selectedRefs() {
    return Object.values(selected).map((f) => ({
      provider_file_id: f.provider_file_id,
      name: f.name,
      mime_type: f.mime_type,
      size: f.size,
    }));
  }

  async function onReview() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewDriveImport(account.id, selectedRefs(), buildDestination()));
      setStep("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't prepare the import.");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await importDriveFiles(account.id, selectedRefs(), buildDestination()));
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSelected({});
    setPreview(null);
    setResult(null);
    setStep("browse");
  }

  const selectedCount = Object.keys(selected).length;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Integrations"
        title="Import from Google Drive"
        description="Pick files from your Google Drive and import them into CertaNest. Import-only — CertaNest never edits or deletes anything in your Drive."
        actions={
          <Link href="/dashboard/settings/integrations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 size-4" /> Integrations
            </Button>
          </Link>
        }
      />

      {error && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" /> {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : unavailable ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Google Drive import isn&apos;t available on your account yet.
          </CardContent>
        </Card>
      ) : notConnected ? (
        <Card>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Connect a Google account first to import from Google Drive.
            </p>
            <Link href="/dashboard/settings/integrations">
              <Button>Go to Integrations</Button>
            </Link>
          </CardContent>
        </Card>
      ) : step === "done" && result ? (
        <ImportSummary result={result} onReset={reset} />
      ) : step === "review" && preview ? (
        <ReviewStep
          preview={preview}
          busy={busy}
          onBack={() => setStep("browse")}
          onConfirm={onImport}
        />
      ) : (
        <>
          {/* Search + filters */}
          <Card>
            <CardContent className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (account) void loadFiles(account, query, fileType);
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Drive files…"
                    className="pl-8"
                    aria-label="Search Drive files"
                  />
                </div>
                <Button type="submit" variant="outline" disabled={listing}>
                  Search
                </Button>
              </form>
              <div className="flex flex-wrap gap-2">
                {TYPE_FILTERS.map((t) => (
                  <Button
                    key={t.key || "all"}
                    type="button"
                    size="sm"
                    variant={fileType === t.key ? "default" : "outline"}
                    onClick={() => {
                      setFileType(t.key);
                      if (account) void loadFiles(account, query, t.key);
                    }}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* File list */}
          <Card>
            <CardContent className="p-0">
              {listing ? (
                <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading files…
                </div>
              ) : files.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No matching Drive files.
                </div>
              ) : (
                <ul className="divide-y">
                  {files.map((file) => {
                    const isOn = Boolean(selected[file.provider_file_id]);
                    return (
                      <li key={file.provider_file_id}>
                        <button
                          type="button"
                          onClick={() => toggleFile(file)}
                          className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
                          aria-pressed={isOn}
                        >
                          <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                              isOn ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                            }`}
                          >
                            {isOn ? <CheckCircle2 className="size-4" /> : null}
                          </span>
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate text-sm">{file.name}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {file.type_label}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Destination */}
          <Card>
            <CardContent className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Import to
              </p>
              <select
                value={destType}
                onChange={(e) => setDestType(e.target.value)}
                aria-label="Destination"
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                <option value="file_inbox">File Inbox</option>
                <option value="vault">Vault</option>
                {destinations && destinations.folders.length > 0 && (
                  <option value="folder">A folder…</option>
                )}
                {destinations && destinations.packs.length > 0 && (
                  <option value="pack">An application pack…</option>
                )}
              </select>
              {destType === "folder" && destinations && (
                <select
                  value={folderId ?? ""}
                  onChange={(e) => setFolderId(Number(e.target.value) || null)}
                  aria-label="Folder"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                >
                  <option value="">Choose a folder…</option>
                  {destinations.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
              {destType === "pack" && destinations && (
                <select
                  value={packId ?? ""}
                  onChange={(e) => setPackId(Number(e.target.value) || null)}
                  aria-label="Pack"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                >
                  <option value="">Choose a pack…</option>
                  {destinations.packs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedCount} selected
            </p>
            <Button onClick={onReview} disabled={selectedCount === 0 || busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Review &amp; import
            </Button>
          </div>
        </>
      )}

      <Card>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" /> Your privacy
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {PRIVACY_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function ReviewStep({
  preview,
  busy,
  onBack,
  onConfirm,
}: {
  preview: DrivePreviewResult;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">
          Review — {preview.importable_count} will import, {preview.skipped_count} skipped
        </p>
        <ul className="divide-y text-sm">
          {preview.results.map((r) => (
            <li key={r.provider_file_id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{r.name}</span>
              {r.status === "will_import" ? (
                <Badge variant="secondary">Will import</Badge>
              ) : (
                <Badge variant="destructive">{driveImportReasonLabel(r.reason)}</Badge>
              )}
            </li>
          ))}
        </ul>
        {preview.warnings.map((w) => (
          <p key={w} className="text-xs text-muted-foreground">
            {w}
          </p>
        ))}
        <Separator />
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft className="mr-1 size-4" /> Back
          </Button>
          <Button onClick={onConfirm} disabled={busy || preview.importable_count === 0}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Import {preview.importable_count} file{preview.importable_count === 1 ? "" : "s"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportSummary({
  result,
  onReset,
}: {
  result: DriveImportResult;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-5 text-emerald-600" />
          Imported {result.imported_count}, failed {result.failed_count}
        </div>
        <ul className="divide-y text-sm">
          {result.results.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{r.name}</span>
              {r.status === "imported" ? (
                <Badge variant="secondary">Imported</Badge>
              ) : (
                <Badge variant="destructive">{driveImportReasonLabel(r.reason)}</Badge>
              )}
            </li>
          ))}
        </ul>
        <Button onClick={onReset}>Import more files</Button>
      </CardContent>
    </Card>
  );
}

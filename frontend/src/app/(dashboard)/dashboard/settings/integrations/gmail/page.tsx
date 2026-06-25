"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Paperclip,
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
  getGmailDestinations,
  getGmailMessages,
  getIntegrationAccounts,
  gmailImportReasonLabel,
  importGmailAttachments,
  previewGmailImport,
} from "@/lib/integrations";
import type {
  ConnectedAccount,
  DriveDestination,
  DriveDestinations,
  GmailAttachment,
  GmailAttachmentRef,
  GmailImportResult,
  GmailMessage,
  GmailPreviewResult,
} from "@/types/integrations";

const TYPE_FILTERS = [
  { key: "", label: "All" },
  { key: "pdf", label: "PDF" },
  { key: "image", label: "Images" },
  { key: "doc", label: "Word" },
];

const PRIVACY_POINTS = [
  "Import selected attachments only.",
  "CertaNest will not read your inbox automatically.",
  "CertaNest will not delete, archive, label, or send Gmail messages.",
  "No automatic sync is enabled.",
  "Email bodies are not saved by default.",
  "Files are saved into CertaNest private storage only after you confirm.",
];

type Step = "browse" | "review" | "done";

function attKey(a: { provider_message_id: string; provider_attachment_id: string }) {
  return `${a.provider_message_id}:${a.provider_attachment_id}`;
}

export default function GmailImportPage() {
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [destinations, setDestinations] = useState<DriveDestinations | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fileType, setFileType] = useState("");
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [searched, setSearched] = useState(false);
  const [listing, setListing] = useState(false);
  const [selected, setSelected] = useState<Record<string, GmailAttachmentRef>>({});

  const [destType, setDestType] = useState("file_inbox");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [packId, setPackId] = useState<number | null>(null);

  const [step, setStep] = useState<Step>("browse");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<GmailPreviewResult | null>(null);
  const [result, setResult] = useState<GmailImportResult | null>(null);

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
        return getGmailDestinations().then((d) => {
          if (active) setDestinations(d);
        });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else setError("Couldn't load Gmail import.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function runSearch() {
    if (!account) return;
    setListing(true);
    setError(null);
    try {
      const data = await getGmailMessages(account.id, {
        query,
        from: fromEmail,
        fileType,
      });
      setMessages(data.messages);
      setSearched(true);
    } catch (err) {
      if (err instanceof ApiError && (err.data as { status?: string })?.status === "not_configured")
        setError("Gmail isn't configured on this server yet.");
      else setError("Couldn't search Gmail. Please try again.");
    } finally {
      setListing(false);
    }
  }

  function toggleAttachment(a: GmailAttachment) {
    setSelected((prev) => {
      const next = { ...prev };
      const k = attKey(a);
      if (next[k]) delete next[k];
      else
        next[k] = {
          provider_message_id: a.provider_message_id,
          provider_attachment_id: a.provider_attachment_id,
          filename: a.filename,
          mime_type: a.mime_type,
          size: a.size,
        };
      return next;
    });
  }

  function buildDestination(): DriveDestination {
    if (destType === "folder" && folderId) return { type: "folder", folder_id: folderId };
    if (destType === "pack" && packId) return { type: "pack", pack_id: packId };
    return { type: destType === "vault" ? "vault" : "file_inbox" };
  }

  const selectedRefs = () => Object.values(selected);
  const selectedCount = Object.keys(selected).length;

  async function onReview() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewGmailImport(account.id, selectedRefs(), buildDestination()));
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
      setResult(await importGmailAttachments(account.id, selectedRefs(), buildDestination()));
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

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Integrations"
        title="Import from Gmail"
        description="Search your Gmail and import selected attachments. Privacy-first — CertaNest never reads your inbox automatically and never modifies your email."
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
            Gmail import isn&apos;t available on your account yet.
          </CardContent>
        </Card>
      ) : notConnected ? (
        <Card>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Connect a Google account with Gmail access first.
            </p>
            <Link href="/dashboard/settings/integrations">
              <Button>Go to Integrations</Button>
            </Link>
          </CardContent>
        </Card>
      ) : step === "done" && result ? (
        <GmailImportSummary result={result} onReset={reset} />
      ) : step === "review" && preview ? (
        <GmailReviewStep
          preview={preview}
          busy={busy}
          onBack={() => setStep("browse")}
          onConfirm={onImport}
        />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runSearch();
                }}
                className="space-y-2"
              >
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Gmail (e.g. transcript, invoice)…"
                    className="pl-8"
                    aria-label="Search Gmail"
                  />
                </div>
                <Input
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="From (email, optional)"
                  aria-label="From email"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {TYPE_FILTERS.map((t) => (
                    <Button
                      key={t.key || "all"}
                      type="button"
                      size="sm"
                      variant={fileType === t.key ? "default" : "outline"}
                      onClick={() => setFileType(t.key)}
                    >
                      {t.label}
                    </Button>
                  ))}
                  <Button type="submit" disabled={listing} className="ml-auto">
                    {listing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Search
                  </Button>
                </div>
              </form>
              <p className="text-xs text-muted-foreground">
                Only messages with attachments are searched. We never read or store
                email bodies.
              </p>
            </CardContent>
          </Card>

          {searched && (
            <Card>
              <CardContent className="p-0">
                {listing ? (
                  <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Searching…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No messages with attachments matched your search.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {messages.map((m) => (
                      <li key={m.provider_message_id} className="p-3">
                        <div className="mb-2 space-y-0.5">
                          <p className="truncate text-sm font-medium">
                            {m.subject || "(no subject)"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.from_display || m.from_email} · {m.date}
                          </p>
                        </div>
                        <ul className="space-y-1">
                          {m.attachments.map((a) => {
                            const isOn = Boolean(selected[attKey(a)]);
                            return (
                              <li key={a.provider_attachment_id}>
                                <button
                                  type="button"
                                  onClick={() => toggleAttachment(a)}
                                  className="flex w-full items-center gap-2 rounded p-1.5 text-left text-sm hover:bg-muted/50"
                                  aria-pressed={isOn}
                                >
                                  <span
                                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                                      isOn ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                                    }`}
                                  >
                                    {isOn ? <CheckCircle2 className="size-3" /> : null}
                                  </span>
                                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                                  <span className="flex-1 truncate">{a.filename}</span>
                                  {a.already_imported && (
                                    <Badge variant="secondary" className="shrink-0">
                                      Imported
                                    </Badge>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

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
            <p className="text-sm text-muted-foreground">{selectedCount} selected</p>
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

function GmailReviewStep({
  preview,
  busy,
  onBack,
  onConfirm,
}: {
  preview: GmailPreviewResult;
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
            <li
              key={`${r.provider_message_id}:${r.provider_attachment_id}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="truncate">{r.filename}</span>
              {r.status === "will_import" ? (
                <Badge variant="secondary">Will import</Badge>
              ) : (
                <Badge variant="destructive">{gmailImportReasonLabel(r.reason)}</Badge>
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
            Import {preview.importable_count} attachment
            {preview.importable_count === 1 ? "" : "s"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GmailImportSummary({
  result,
  onReset,
}: {
  result: GmailImportResult;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="size-5 text-primary" />
          Imported {result.imported_count}, skipped {result.skipped_count}, failed{" "}
          {result.failed_count}
        </div>
        <ul className="divide-y text-sm">
          {result.results.map((r, i) => (
            <li key={`${r.filename}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{r.filename}</span>
              {r.status === "imported" ? (
                <Badge variant="secondary">Imported</Badge>
              ) : (
                <Badge variant={r.status === "skipped" ? "outline" : "destructive"}>
                  {gmailImportReasonLabel(r.reason)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
        <Button onClick={onReset}>Import more</Button>
      </CardContent>
    </Card>
  );
}

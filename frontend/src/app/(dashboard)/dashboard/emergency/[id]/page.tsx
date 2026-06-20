"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmergencyQrCard } from "@/components/emergency/emergency-qr-card";
import { ApiError } from "@/lib/api";
import { getDocuments, formatDate } from "@/lib/documents";
import { getDocumentFiles } from "@/lib/document-files";
import {
  addEmergencyPackItem,
  addTrustedContact,
  approveUnlockRequest,
  armEmergencyCheckin,
  buildPublicViewerUrl,
  cancelEmergencyCheckin,
  deleteEmergencyPack,
  denyUnlockRequest,
  disableEmergencyPack,
  enableEmergencyPack,
  getEmergencyActivity,
  getEmergencyPack,
  getTrustedContacts,
  extendEmergencyCheckin,
  getUnlockRequests,
  regenerateEmergencyPackLink,
  removeEmergencyPackItem,
  removeTrustedContact,
  reviewEmergencyPack,
  revokeUnlockRequest,
  updateEmergencyLocation,
  updateEmergencyPack,
} from "@/lib/emergency";
import { getFeatureMap } from "@/lib/features";
import {
  READINESS_LABELS,
  UNLOCK_DELAY_OPTIONS,
  UNLOCK_MODES,
  buildUnlockModeDescription,
  computeEmergencyReadiness,
  formatUnlockCountdown,
  getReadinessTone,
  isEmergencyDocumentIncomplete,
} from "@/lib/emergency-protocol";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";
import type {
  EmergencyActivityEvent,
  EmergencyPack,
  EmergencyTrustedContact,
  EmergencyUnlockMode,
  EmergencyUnlockRequest,
  TrustedContactRelationship,
} from "@/types/emergency";

const RELATIONSHIPS: TrustedContactRelationship[] = [
  "parent",
  "sibling",
  "spouse",
  "friend",
  "guardian",
  "roommate",
  "colleague",
  "other",
];

export default function EmergencyProtocolPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [pack, setPack] = useState<EmergencyPack | null>(null);
  const [contacts, setContacts] = useState<EmergencyTrustedContact[]>([]);
  const [requests, setRequests] = useState<EmergencyUnlockRequest[]>([]);
  const [activity, setActivity] = useState<EmergencyActivityEvent[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid pack.",
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Whether the safety check-in tool is launched for this viewer (founder-gated
  // until released). Hidden entirely when off — the backend 503s regardless.
  const [checkinEnabled, setCheckinEnabled] = useState(false);

  const refreshPack = useCallback(async () => {
    const refreshed = await getEmergencyPack(id);
    setPack(refreshed);
    return refreshed;
  }, [id]);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    Promise.all([
      getEmergencyPack(id),
      getTrustedContacts(id).catch(() => []),
      getUnlockRequests(id).catch(() => []),
      getEmergencyActivity(id).catch(() => []),
    ])
      .then(([p, c, r, a]) => {
        if (!active) return;
        setPack(p);
        setContacts(c);
        setRequests(r);
        setActivity(a);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This emergency setup could not be found.");
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Unable to load this setup.",
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

  // Resolve whether the founder-gated safety check-in tool is available. Failure
  // leaves it hidden, which is the safe default.
  useEffect(() => {
    let active = true;
    getFeatureMap()
      .then((map) => {
        if (active) setCheckinEnabled(map.features.emergency_checkin?.enabled ?? false);
      })
      .catch(() => {
        /* keep the tool hidden if availability can't be resolved */
      });
    return () => {
      active = false;
    };
  }, []);

  const shareUrl = pack ? buildPublicViewerUrl(pack.public_url_path) : null;
  const readiness = pack
    ? computeEmergencyReadiness(pack, contacts.length)
    : null;

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

  async function runPackAction(
    fn: () => Promise<EmergencyPack>,
    label: string,
  ) {
    setBusy(true);
    setActionError(null);
    try {
      setPack(await fn());
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Could not ${label}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetUnlockMode(mode: EmergencyUnlockMode) {
    await runPackAction(
      () => updateEmergencyPack(id, { unlock_mode: mode }),
      "update the unlock rule",
    );
    getEmergencyActivity(id).then(setActivity).catch(() => {});
  }

  async function handleSetDelay(hours: number) {
    await runPackAction(
      () => updateEmergencyPack(id, { unlock_delay_hours: hours }),
      "update the delay",
    );
  }

  async function handleToggleDownloads(value: boolean) {
    await runPackAction(
      () => updateEmergencyPack(id, { allow_downloads: value }),
      "update downloads",
    );
  }

  async function handleMarkTested() {
    if (!shareUrl) return;
    window.open(shareUrl, "_blank", "noopener");
    await runPackAction(
      () => updateEmergencyPack(id, { metadata: { ...pack?.metadata, tested: true } }),
      "mark as tested",
    );
  }

  async function handleReview() {
    await runPackAction(() => reviewEmergencyPack(id), "mark as reviewed");
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteEmergencyPack(id);
      router.push("/dashboard/emergency");
      router.refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not delete.");
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  async function handleRequestDecision(
    requestId: number,
    decision: "approve" | "deny" | "revoke",
  ) {
    setActionError(null);
    const fn =
      decision === "approve"
        ? approveUnlockRequest
        : decision === "deny"
          ? denyUnlockRequest
          : revokeUnlockRequest;
    try {
      const updated = await fn(id, requestId);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? updated : r)),
      );
      getEmergencyActivity(id).then(setActivity).catch(() => {});
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not update the request.",
      );
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <BackLink />
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </p>
      </div>
    );
  }

  if (!pack || !readiness) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <BackLink />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const openRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "countdown",
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <BackLink />

      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Emergency Protocol
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {pack.title}
          </h1>
          <Badge className={getReadinessTone(readiness.status)}>
            {READINESS_LABELS[readiness.status]}
          </Badge>
          {pack.access_code_required && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Code protected
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Prepare selected documents and trusted access so people you choose can
          help if needed. They can only see what you choose — your full vault
          stays private.
        </p>
      </header>

      {actionError && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {/* 1 + 2. Readiness + checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Emergency readiness</CardTitle>
          <CardDescription>
            {readiness.completed} of {readiness.total} steps complete
            {readiness.nextStep && ` · Next: ${readiness.nextStep}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-success transition-all"
                style={{ width: `${readiness.percent}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {readiness.percent}%
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {readiness.steps.map((step) => (
              <li key={step.key} className="flex items-center gap-2 text-sm">
                {step.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-brand-success" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn(step.done && "text-muted-foreground")}>
                  {step.label}
                  {step.optional && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (optional)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {pack.last_reviewed_at ? (
              <span>Last reviewed {formatDate(pack.last_reviewed_at)}.</span>
            ) : (
              <span>Not reviewed yet.</span>
            )}
            <Button variant="ghost" size="sm" onClick={handleReview} disabled={busy}>
              Mark reviewed
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending unlock requests (only when present) */}
      {openRequests.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-lg">Access requests</CardTitle>
            <CardDescription>
              Someone has requested emergency access. Approve or deny it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openRequests.map((req) => (
              <div
                key={req.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{req.requester_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {req.relationship && `${req.relationship} · `}
                    {req.status === "countdown" && req.unlock_at
                      ? `Unlocks ${formatUnlockCountdown(req.unlock_at)} unless denied`
                      : "Waiting for your approval"}
                  </p>
                  {req.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      “{req.reason}”
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleRequestDecision(req.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRequestDecision(req.id, "deny")}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 6. Activation + QR/card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Emergency QR &amp; card</CardTitle>
          <CardDescription>
            This QR starts an emergency request. It does not unlock documents
            immediately unless you choose instant access. It never exposes your
            full vault.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {pack.status === "active" ? (
              <Button
                variant="outline"
                onClick={() => runPackAction(() => disableEmergencyPack(id), "disable")}
                disabled={busy}
              >
                <PowerOff className="size-4" />
                Disable access
              </Button>
            ) : (
              <Button
                onClick={() => runPackAction(() => enableEmergencyPack(id), "activate")}
                disabled={busy}
              >
                <Power className="size-4" />
                Activate
              </Button>
            )}
            {pack.access_mode === "share_link" && (
              <Button variant="outline" onClick={() => setConfirmRegen(true)} disabled={busy}>
                <RefreshCw className="size-4" />
                Regenerate QR
              </Button>
            )}
            {shareUrl && (
              <Button variant="outline" onClick={handleMarkTested} disabled={busy}>
                <ExternalLink className="size-4" />
                Test access
              </Button>
            )}
          </div>

          {pack.access_mode === "share_link" ? (
            shareUrl ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="share-url">Public request link</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    readOnly
                    value={shareUrl}
                    className="h-10 font-mono text-xs"
                  />
                  <Button variant="outline" onClick={copyShareUrl}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Activate to generate the QR and shareable request link.
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              This pack is owner-only preview. Switch to a shareable link to get a
              QR and public request page.
            </p>
          )}

          <EmergencyQrCard
            pack={pack}
            viewerUrl={shareUrl}
            contactName={contacts[0]?.name}
            contactPhone={contacts[0]?.phone}
          />
        </CardContent>
      </Card>

      {/* Unlock rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Unlock rules</CardTitle>
          <CardDescription>
            Control what happens when a trusted person opens the link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {UNLOCK_MODES.map((mode) => {
              const active = pack.unlock_mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => handleSetUnlockMode(mode.value)}
                  disabled={busy}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{mode.label}</span>
                    {active && <Check className="size-4 text-primary" />}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {mode.description}
                  </span>
                  {mode.tone === "warning" && (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3" />
                      Less private
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {pack.unlock_mode === "delayed" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="delay">Unlock delay</Label>
              <select
                id="delay"
                value={pack.unlock_delay_hours}
                onChange={(e) => handleSetDelay(Number(e.target.value))}
                disabled={busy}
                className="h-10 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {UNLOCK_DELAY_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h} hour{h === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {buildUnlockModeDescription("delayed").bestFor}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emergency documents */}
      <EmergencyDocumentsSection
        pack={pack}
        documents={documents}
        onChanged={async () => {
          await refreshPack();
          getEmergencyActivity(id).then(setActivity).catch(() => {});
        }}
        setActionError={setActionError}
      />

      {/* Trusted contacts */}
      <TrustedContactsSection
        packId={id}
        contacts={contacts}
        setContacts={setContacts}
        setActionError={setActionError}
        onChanged={() => getEmergencyActivity(id).then(setActivity).catch(() => {})}
      />

      {/* Emergency location */}
      <EmergencyLocationSection
        pack={pack}
        onSaved={setPack}
        setActionError={setActionError}
      />

      {/* Safety check-in (founder-gated) */}
      {checkinEnabled && (
        <EmergencyCheckinSection
          pack={pack}
          contacts={contacts}
          onSaved={(p) => {
            setPack(p);
            getEmergencyActivity(id).then(setActivity).catch(() => {});
          }}
          setActionError={setActionError}
        />
      )}

      {/* Activity log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity log</CardTitle>
          <CardDescription>
            Every important emergency action is recorded here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.slice(0, 20).map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p>{event.description || event.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.actor_label && `${event.actor_label} · `}
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Safety controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Safety &amp; control</CardTitle>
          <CardDescription>You stay in control of access at all times.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Allow downloads
              <span className="block text-xs text-muted-foreground">
                When off, trusted people can preview but not download files.
              </span>
            </span>
            <input
              type="checkbox"
              checked={pack.allow_downloads}
              onChange={(e) => handleToggleDownloads(e.target.checked)}
              disabled={busy}
              className="size-4 rounded border-input"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Delete this emergency setup</p>
              <p className="text-xs text-muted-foreground">
                Removes the setup and disables any link. Your documents are not
                affected.
              </p>
            </div>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete emergency setup?"
        description="The setup and any QR/link will be removed immediately. The documents inside your vault are not affected."
        confirmLabel="Delete setup"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmRegen}
        title="Regenerate emergency QR?"
        description="Regenerating this QR will make previously printed or shared emergency cards stop working."
        confirmLabel="Regenerate QR"
        onConfirm={async () => {
          setConfirmRegen(false);
          await runPackAction(
            () => regenerateEmergencyPackLink(id),
            "regenerate the QR",
          );
          getEmergencyActivity(id).then(setActivity).catch(() => {});
        }}
        onCancel={() => setConfirmRegen(false)}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/emergency"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to emergency access
    </Link>
  );
}

// ---- Emergency documents ---------------------------------------------------

function EmergencyDocumentsSection({
  pack,
  documents,
  onChanged,
  setActionError,
}: {
  pack: EmergencyPack;
  documents: DocumentRecord[];
  onChanged: () => Promise<void>;
  setActionError: (msg: string | null) => void;
}) {
  const [selectedDoc, setSelectedDoc] = useState<number | "">("");
  const [docFiles, setDocFiles] = useState<DocumentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<number | "">("");
  const [adding, setAdding] = useState(false);

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

  const docById = new Map(documents.map((d) => [d.id, d]));

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (selectedDoc === "") {
      setActionError("Choose a document to add.");
      return;
    }
    setAdding(true);
    setActionError(null);
    try {
      await addEmergencyPackItem(pack.id, {
        linked_document: Number(selectedDoc),
        linked_file: selectedFile === "" ? null : Number(selectedFile),
      });
      setSelectedDoc("");
      setSelectedFile("");
      setDocFiles([]);
      await onChanged();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not add the document.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(itemId: number) {
    setActionError(null);
    try {
      await removeEmergencyPackItem(pack.id, itemId);
      await onChanged();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not remove the document.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Emergency documents</CardTitle>
        <CardDescription>
          Emergency contacts can only see the documents selected here. Your full
          vault stays private.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pack.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Select only the documents you would want trusted people to access in
            an emergency.
          </p>
        ) : (
          <ul className="space-y-2">
            {pack.items.map((item) => {
              const doc = docById.get(item.linked_document);
              const warn = doc
                ? isEmergencyDocumentIncomplete(doc)
                : { incomplete: false, warnings: [] };
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.document_title ?? "Document"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.file_name ? `File: ${item.file_name}` : "Whole document"}
                    </p>
                    {warn.warnings.length > 0 && (
                      <span className="mt-1 inline-flex flex-wrap items-center gap-1">
                        {warn.warnings.map((w) => (
                          <span
                            key={w}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                          >
                            <AlertTriangle className="size-3" />
                            {w}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(item.id)}
                    aria-label="Remove document"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-xl border border-border bg-muted/25 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-doc">Document</Label>
              <select
                id="add-doc"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={selectedDoc}
                onChange={(e) => {
                  setSelectedDoc(e.target.value === "" ? "" : Number(e.target.value));
                  setSelectedFile("");
                  setDocFiles([]);
                }}
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
                  setSelectedFile(e.target.value === "" ? "" : Number(e.target.value))
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
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add to emergency pack
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Trusted contacts ------------------------------------------------------

function TrustedContactsSection({
  packId,
  contacts,
  setContacts,
  setActionError,
  onChanged,
}: {
  packId: number;
  contacts: EmergencyTrustedContact[];
  setContacts: React.Dispatch<React.SetStateAction<EmergencyTrustedContact[]>>;
  setActionError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] =
    useState<TrustedContactRelationship>("parent");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setActionError("Give the contact a name.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const created = await addTrustedContact(packId, {
        name: name.trim(),
        relationship,
        email: email.trim(),
        phone: phone.trim(),
        is_primary: contacts.length === 0,
      });
      setContacts((prev) => [...prev, created]);
      setName("");
      setEmail("");
      setPhone("");
      setShowForm(false);
      onChanged();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not add the contact.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(contactId: number) {
    setActionError(null);
    try {
      await removeTrustedContact(packId, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      onChanged();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not remove the contact.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Trusted contacts</CardTitle>
        <CardDescription>
          Trusted contacts do not get access immediately unless you choose instant
          access. They can request access based on your unlock rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {contacts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-5 text-muted-foreground" />
            Add at least one trusted person who can request access if needed.
          </p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.name}
                    {c.is_primary && (
                      <Badge variant="secondary" className="ml-2">
                        Primary
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {c.relationship}
                    {c.email && ` · ${c.email}`}
                    {c.phone && ` · ${c.phone}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(c.id)}
                  aria-label="Remove contact"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {showForm ? (
          <form
            onSubmit={handleAdd}
            className="space-y-3 rounded-xl border border-border bg-muted/25 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-name">Name</Label>
                <Input
                  id="c-name"
                  className="h-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mum"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-rel">Relationship</Label>
                <select
                  id="c-rel"
                  value={relationship}
                  onChange={(e) =>
                    setRelationship(e.target.value as TrustedContactRelationship)
                  }
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm capitalize shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r} className="capitalize">
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-email">Email (optional)</Label>
                <Input
                  id="c-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-phone">Phone (optional)</Label>
                <Input
                  id="c-phone"
                  className="h-10"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Add contact
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <UserPlus className="size-4" />
            Add trusted contact
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Emergency location ----------------------------------------------------

/** Great-circle distance between two lat/lng points, in metres. */
function metersBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Foreground auto-refresh cadence: persist at most this often, or sooner if the
// device has moved more than this distance. Keeps the stored last-known
// location fresh without spamming the API while the page sits open.
const AUTO_MIN_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_MIN_MOVE_M = 50;

function EmergencyLocationSection({
  pack,
  onSaved,
  setActionError,
}: {
  pack: EmergencyPack;
  onSaved: (pack: EmergencyPack) => void;
  setActionError: (msg: string | null) => void;
}) {
  const [label, setLabel] = useState(pack.last_known_location?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  // Foreground auto-refresh: session-only (NOT persisted to the pack). While on,
  // the page watches GPS and refreshes the stored location periodically; it
  // stops on toggle-off, when location sharing is disabled, or on unmount/close.
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(
    null,
  );
  const labelRef = useRef(label);
  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  // Coordinates already stored on the pack (set via GPS capture). Kept so a
  // label-only "Update" doesn't silently wipe a captured pin — both are sent
  // together. lat/lng are only shared on the recipient's map when precision is
  // "precise" (the public serializer drops them for "approximate").
  const lat = pack.last_known_location?.lat ?? null;
  const lng = pack.last_known_location?.lng ?? null;
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  async function save(payload: Parameters<typeof updateEmergencyLocation>[1]) {
    setSaving(true);
    setActionError(null);
    try {
      onSaved(await updateEmergencyLocation(pack.id, payload));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not update location.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Capture the device's current GPS position (with permission) and store it
  // alongside the typed label. Browser-only; nothing is tracked continuously —
  // this is a one-off "last known location" snapshot the owner chooses to set.
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setActionError("This device or browser can't share a GPS location.");
      return;
    }
    setLocating(true);
    setActionError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void save({
          label,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setLocating(false);
        setActionError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. You can still type a place name."
            : "Couldn't get your current location. Please try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  // Turn the foreground auto-refresh on/off. Availability + the initial status
  // are handled here (in the event handler) so the effect body never calls
  // setState synchronously — it only subscribes to watchPosition.
  function toggleAutoUpdate(next: boolean) {
    if (!next) {
      setAutoUpdate(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setActionError("This device or browser can't share a GPS location.");
      return;
    }
    setActionError(null);
    lastSentRef.current = null;
    setAutoStatus("Waiting for a location fix…");
    setAutoUpdate(true);
  }

  // Keep `onSaved` reachable from the watch callback without making it a
  // dependency (it changes identity each render and would restart the watch).
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  // Foreground auto-refresh loop. Runs only while the toggle is on AND location
  // sharing is enabled; watchPosition delivers fixes while the page is open and
  // we throttle persistence by time + distance. Cleanup (toggle-off, disabling
  // location, unmount, tab close) clears the watch — there is no background work.
  useEffect(() => {
    if (!autoUpdate || !pack.location_enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const plat = pos.coords.latitude;
        const plng = pos.coords.longitude;
        const now = Date.now();
        const last = lastSentRef.current;
        const moved = last
          ? metersBetween(last.lat, last.lng, plat, plng)
          : Infinity;
        if (
          last &&
          now - last.at < AUTO_MIN_INTERVAL_MS &&
          moved < AUTO_MIN_MOVE_M
        ) {
          return; // too soon and barely moved — skip this fix
        }
        lastSentRef.current = { at: now, lat: plat, lng: plng };
        updateEmergencyLocation(pack.id, {
          label: labelRef.current,
          lat: plat,
          lng: plng,
          auto: true,
        })
          .then((updated) => {
            onSavedRef.current(updated);
            setAutoStatus(`Updated ${new Date().toLocaleTimeString()}`);
          })
          .catch(() => {
            /* transient network error — keep watching, try next fix */
          });
      },
      (err) => {
        setAutoStatus(null);
        setActionError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Auto-update turned off."
            : "Couldn't keep your location updated. Auto-update turned off.",
        );
        setAutoUpdate(false);
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 },
    );
    watchIdRef.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
      setAutoStatus(null);
    };
  }, [autoUpdate, pack.location_enabled, pack.id, setActionError]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Emergency location</CardTitle>
        <CardDescription>
          Location sharing is off by default because location is sensitive. It is
          only shown after your unlock rules allow access. This is not live
          tracking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            Share a last known location after unlock
          </span>
          <input
            type="checkbox"
            checked={pack.location_enabled}
            onChange={(e) => {
              if (!e.target.checked) setAutoUpdate(false);
              void save({ location_enabled: e.target.checked });
            }}
            disabled={saving}
            className="size-4 rounded border-input"
          />
        </label>

        {pack.location_enabled && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loc-label">Last known location</Label>
              <div className="flex gap-2">
                <Input
                  id="loc-label"
                  className="h-10"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Berlin, Germany"
                />
                <Button
                  variant="outline"
                  onClick={() => save({ label, lat, lng })}
                  disabled={saving || locating}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Update"}
                </Button>
              </div>
              {/* GPS capture — fills in precise coordinates without typing. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={useMyLocation}
                  disabled={saving || locating}
                >
                  {locating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LocateFixed className="size-4" />
                  )}
                  {locating ? "Getting location…" : "Use my current location"}
                </Button>
                {hasCoords && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    {lat!.toFixed(5)}, {lng!.toFixed(5)}
                  </a>
                )}
                {hasCoords && (
                  <button
                    type="button"
                    onClick={() => save({ label, lat: null, lng: null })}
                    disabled={saving || locating}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Clear pin
                  </button>
                )}
              </div>
              {hasCoords && pack.location_precision === "approximate" && (
                <p className="text-xs text-muted-foreground">
                  A GPS pin is saved, but it is only shared on the recipient&apos;s
                  map when precision is set to <strong>Precise</strong> below.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>
                  Keep updating while this page is open
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Refreshes about every 5 minutes while this tab stays open. It
                    stops the moment you close it — this is not background
                    tracking.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={autoUpdate}
                  onChange={(e) => toggleAutoUpdate(e.target.checked)}
                  disabled={saving || locating}
                  className="mt-0.5 size-4 rounded border-input"
                />
              </label>
              {autoUpdate && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2 animate-pulse rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  {autoStatus ?? "Auto-updating while open…"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="loc-precision">Precision</Label>
              <select
                id="loc-precision"
                value={pack.location_precision}
                onChange={(e) =>
                  save({
                    location_precision: e.target.value as
                      | "approximate"
                      | "precise",
                  })
                }
                disabled={saving}
                className="h-10 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="approximate">Approximate (recommended)</option>
                <option value="precise">Precise</option>
              </select>
            </div>
            {pack.last_known_location_at && (
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                Updated {formatDate(pack.last_known_location_at)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Safety check-in ("dead man's switch") ---------------------------------

const CHECKIN_INTERVALS: { value: number; label: string }[] = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 1440, label: "24 hours" },
];

/** "2h 5m left" / "Overdue" from a future deadline relative to now. */
function formatCheckinRemaining(dueAt: Date, now: number): string {
  const ms = dueAt.getTime() - now;
  if (ms <= 0) return "Overdue";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return "under a minute left";
}

function EmergencyCheckinSection({
  pack,
  contacts,
  onSaved,
  setActionError,
}: {
  pack: EmergencyPack;
  contacts: EmergencyTrustedContact[];
  onSaved: (pack: EmergencyPack) => void;
  setActionError: (msg: string | null) => void;
}) {
  const [interval, setInterval] = useState<number>(
    pack.checkin_interval_minutes ?? 60,
  );
  const [message, setMessage] = useState(pack.checkin_message ?? "");
  const [revealLocation, setRevealLocation] = useState(
    pack.checkin_reveal_location,
  );
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const emailContacts = contacts.filter((c) => c.email);
  const armed = pack.checkin_armed;
  const dueAt = pack.checkin_due_at ? new Date(pack.checkin_due_at) : null;

  // Tick the countdown every second while armed so the time-left stays live.
  useEffect(() => {
    if (!armed) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [armed]);

  async function run(action: () => Promise<EmergencyPack>) {
    setSaving(true);
    setActionError(null);
    try {
      onSaved(await action());
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not update the check-in.",
      );
    } finally {
      setSaving(false);
    }
  }

  const overdue = dueAt ? dueAt.getTime() - now <= 0 : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Safety check-in</CardTitle>
        <CardDescription>
          Set a timer before you head somewhere. If you don&apos;t check in by the
          deadline, your trusted contacts are emailed automatically — this runs on
          our servers, so it still works even if your phone dies. It&apos;s a
          one-time alert you can extend or cancel anytime, not live tracking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {emailContacts.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Add at least one trusted contact with an email address so the alert can
            reach someone.
          </p>
        )}

        {armed && dueAt ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    overdue ? "bg-red-500" : "animate-pulse bg-emerald-500",
                  )}
                  aria-hidden
                />
                {overdue ? "Check-in overdue" : "Check-in armed"}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  overdue ? "text-red-600" : "text-foreground",
                )}
              >
                {formatCheckinRemaining(dueAt, now)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Checking in by {formatDate(pack.checkin_due_at!)}. If you don&apos;t,
              we&apos;ll alert {emailContacts.length} trusted contact
              {emailContacts.length === 1 ? "" : "s"}
              {pack.checkin_reveal_location && pack.location_enabled
                ? " and share your last known location"
                : ""}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => run(() => cancelEmergencyCheckin(pack.id))}
                disabled={saving}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                I&apos;m safe
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  run(() => extendEmergencyCheckin(pack.id, { interval_minutes: interval }))
                }
                disabled={saving}
              >
                <Clock className="size-4" />
                Extend
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-interval">Check in within</Label>
              <select
                id="ci-interval"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                disabled={saving}
                className="h-10 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {CHECKIN_INTERVALS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-message">Message to your contacts</Label>
              <textarea
                id="ci-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="e.g. If you get this, I haven't checked in. Please call me and check on me."
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            {pack.location_enabled && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  Include my last known location in the alert
                </span>
                <input
                  type="checkbox"
                  checked={revealLocation}
                  onChange={(e) => setRevealLocation(e.target.checked)}
                  disabled={saving}
                  className="size-4 rounded border-input"
                />
              </label>
            )}
            <Button
              onClick={() =>
                run(() =>
                  armEmergencyCheckin(pack.id, {
                    interval_minutes: interval,
                    message,
                    reveal_location: revealLocation,
                  }),
                )
              }
              disabled={saving || emailContacts.length === 0}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
              Arm check-in
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

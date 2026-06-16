"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  createUnlockRequest,
  downloadEmergencyItem,
  getEmergencyItemPreviewBlob,
  getPublicEmergencyPack,
  getUnlockRequestStatus,
} from "@/lib/emergency";
import { formatUnlockCountdown } from "@/lib/emergency-protocol";
import type {
  PublicEmergencyItem,
  PublicEmergencyPack,
} from "@/types/emergency";

interface ViewerError {
  title: string;
  message: string;
}

function errorFromApi(err: unknown): ViewerError {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const data = err.data as Record<string, unknown>;
    const state = typeof data.state === "string" ? data.state : undefined;
    if (state === "invalid") {
      return {
        title: "This emergency access link is invalid or no longer exists.",
        message: "Check the link, or ask the person who shared it for a new one.",
      };
    }
    if (state === "unavailable") {
      return {
        title: "This emergency access link is no longer available.",
        message:
          "It may have expired or been turned off by the owner. Ask them to share a new link if you still need access.",
      };
    }
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "This emergency link could not be opened.";
    return { title: detail, message: detail };
  }
  return {
    title: "This emergency link could not be opened.",
    message: err instanceof Error ? err.message : "Please try again later.",
  };
}

function formatDocType(value: string): string {
  if (!value) return "Document";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function storageKey(token: string): string {
  return `dn-emergency-req-${token}`;
}

export default function EmergencyViewerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [pack, setPack] = useState<PublicEmergencyPack | null>(null);
  const [error, setError] = useState<ViewerError | null>(null);
  const [loading, setLoading] = useState(true);
  // Request token (for owner-approval / delayed packs), kept in memory + session.
  // Restored from sessionStorage at first render so a refresh keeps status.
  const [requestToken, setRequestToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(storageKey(token));
  });
  // Access code stays in memory only; re-sent for preview/download.
  const [accessCode, setAccessCode] = useState<string>("");

  // Pure fetch (no setState) so effects only call setState inside .then/.catch,
  // satisfying the "no synchronous setState in effects" rule.
  const fetchPack = useCallback((): Promise<PublicEmergencyPack> => {
    return requestToken
      ? getUnlockRequestStatus(token, requestToken)
      : getPublicEmergencyPack(token, accessCode || undefined);
  }, [token, requestToken, accessCode]);

  useEffect(() => {
    let active = true;
    fetchPack()
      .then((result) => {
        if (!active) return;
        setPack(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setPack(null);
        setError(errorFromApi(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchPack]);

  // Poll while waiting for approval or a delayed countdown.
  const status = pack?.request?.status;
  useEffect(() => {
    if (!requestToken) return;
    if (status !== "pending" && status !== "countdown") return;
    const interval = setInterval(() => {
      fetchPack()
        .then((result) => setPack(result))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [requestToken, status, fetchPack]);

  function onRequestCreated(newToken: string) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey(token), newToken);
    }
    setRequestToken(newToken);
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Logo href="/" size="md" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Emergency access
          </span>
        </header>

        <section className="flex flex-1 flex-col py-8">
          <ViewerBody
            token={token}
            pack={pack}
            error={error}
            loading={loading}
            requestToken={requestToken}
            accessCode={accessCode}
            setAccessCode={setAccessCode}
            onRequestCreated={onRequestCreated}
          />
        </section>

        <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Emergency access is controlled by the owner. Only selected documents
            are shown.
          </p>
        </footer>
      </div>
    </main>
  );
}

function ViewerBody({
  token,
  pack,
  error,
  loading,
  requestToken,
  accessCode,
  setAccessCode,
  onRequestCreated,
}: {
  token: string;
  pack: PublicEmergencyPack | null;
  error: ViewerError | null;
  loading: boolean;
  requestToken: string | null;
  accessCode: string;
  setAccessCode: (v: string) => void;
  onRequestCreated: (token: string) => void;
}) {
  if (loading) {
    return (
      <CenteredCard
        icon={<Loader2 className="size-6 animate-spin" />}
        title="Opening emergency access"
        message="Checking the link and what was shared with you…"
      />
    );
  }
  if (error) {
    return (
      <CenteredCard icon={<EyeOff className="size-6" />} title={error.title} message={error.message} />
    );
  }
  if (!pack) return null;

  // Already open: show the documents.
  if (pack.access_state === "open") {
    return <PackView pack={pack} token={token} accessCode={accessCode} requestToken={requestToken ?? undefined} />;
  }

  // Request-gated packs: show the request flow based on status.
  const status = pack.request?.status;
  if (requestToken && status) {
    if (status === "pending") {
      return (
        <CenteredCard
          icon={<Clock className="size-6" />}
          title="Waiting for owner approval"
          message="Your request was sent and the owner has been notified. This page will update automatically."
        />
      );
    }
    if (status === "countdown") {
      return (
        <CenteredCard
          icon={<Clock className="size-6" />}
          title={`Access will unlock ${formatUnlockCountdown(pack.request?.unlock_at ?? null)}`}
          message="Access unlocks automatically after the delay unless the owner denies the request."
        />
      );
    }
    if (status === "denied") {
      return (
        <CenteredCard
          icon={<EyeOff className="size-6" />}
          title="Access was not approved."
          message="The owner did not approve this request. Contact them directly if you still need help."
        />
      );
    }
    if (status === "revoked" || status === "expired") {
      return (
        <CenteredCard
          icon={<EyeOff className="size-6" />}
          title="Emergency access was closed by the owner."
          message="This request is no longer active. Ask the owner for a new link if you still need access."
        />
      );
    }
  }

  // No active request yet — show the request form.
  return (
    <RequestForm
      token={token}
      pack={pack}
      accessCode={accessCode}
      setAccessCode={setAccessCode}
      onRequestCreated={onRequestCreated}
    />
  );
}

function RequestForm({
  token,
  pack,
  accessCode,
  setAccessCode,
  onRequestCreated,
}: {
  token: string;
  pack: PublicEmergencyPack;
  accessCode: string;
  setAccessCode: (v: string) => void;
  onRequestCreated: (token: string) => void;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [reason, setReason] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter your name.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await createUnlockRequest(token, {
        requester_name: name.trim(),
        relationship: relationship.trim(),
        reason: reason.trim(),
        contact_info: contactInfo.trim(),
        ...(pack.access_code_required ? { access_code: accessCode.trim() } : {}),
      });
      if (result.request_token) {
        onRequestCreated(result.request_token);
      }
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.data as Record<string, unknown>)?.state === "wrong_code"
      ) {
        setFormError("Code does not match. Check the card or contact the owner.");
      } else {
        setFormError(
          err instanceof ApiError ? err.message : "Could not send the request.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-floating sm:p-8">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <LockKeyhole className="size-6" />
      </span>
      <h1 className="mt-5 text-center font-heading text-2xl font-semibold">
        Emergency Access Request
      </h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
        This page can request access to selected emergency documents only. It
        does not open the full vault.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-name">Your name</Label>
          <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-rel">Relationship</Label>
          <Input
            id="r-rel"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="e.g. Sister, friend"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-reason">Reason for request</Label>
          <Textarea
            id="r-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly, why you need access"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-contact">Contact info (optional)</Label>
          <Input
            id="r-contact"
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder="Phone or email"
          />
        </div>
        {pack.access_code_required && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-code">Access code</Label>
            <Input
              id="r-code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="From the emergency card"
            />
          </div>
        )}

        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

        <p className="rounded-lg bg-accent/40 px-3 py-2 text-xs text-accent-foreground">
          {pack.unlock_mode === "delayed"
            ? "Access will unlock after a delay unless the owner denies the request."
            : "Access opens only if the owner approves your request."}
        </p>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Request emergency access
        </Button>
      </form>
    </div>
  );
}

function PackView({
  pack,
  token,
  accessCode,
  requestToken,
}: {
  pack: PublicEmergencyPack;
  token: string;
  accessCode?: string;
  requestToken?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {pack.title || "Emergency access"}
        </h1>
        {pack.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {pack.description}
          </p>
        )}
        {pack.expires_at && (
          <p className="text-xs text-muted-foreground">
            Access expires {formatDate(pack.expires_at)}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-accent/40 px-4 py-3 text-sm text-accent-foreground">
        Only the items selected by the owner are visible here. Their full DueNest
        vault remains private.
      </div>

      {pack.location && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="size-4 text-muted-foreground" />
            Last known location
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pack.location.label || "Shared by the owner"}
            {pack.location.precision === "approximate" && " (approximate)"}
          </p>
          {pack.location.updated_at && (
            <p className="text-xs text-muted-foreground">
              Updated {formatDate(pack.location.updated_at)}
            </p>
          )}
        </div>
      )}

      {pack.items.length === 0 ? (
        <CenteredCard
          icon={<FileText className="size-6" />}
          title="No emergency items are currently available."
          message="The owner has not shared any items through this link, or they are no longer available."
        />
      ) : (
        <ul className="space-y-3">
          {pack.items.map((item) => (
            <EmergencyItemCard
              key={item.id}
              item={item}
              token={token}
              accessCode={accessCode}
              requestToken={requestToken}
              allowDownloads={pack.allow_downloads}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmergencyItemCard({
  item,
  token,
  accessCode,
  requestToken,
  allowDownloads,
}: {
  item: PublicEmergencyItem;
  token: string;
  accessCode?: string;
  requestToken?: string;
  allowDownloads: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  async function handleDownload() {
    setDownloading(true);
    setActionError(null);
    try {
      await downloadEmergencyItem(
        token,
        item.id,
        item.file_name ?? item.title,
        accessCode,
        requestToken,
      );
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not download this item.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleTogglePreview() {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    if (previewUrl) return;
    setPreviewLoading(true);
    setActionError(null);
    try {
      const blob = await getEmergencyItemPreviewBlob(
        token,
        item.id,
        accessCode,
        requestToken,
      );
      const url = URL.createObjectURL(blob);
      previewRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not preview this item.",
      );
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDocType(item.document_type)}
              {item.file_name ? ` · ${item.file_name}` : " · No file attached"}
            </p>
            {item.notes && (
              <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
            )}
          </div>
        </div>

        {item.has_file && (
          <div className="flex shrink-0 gap-2">
            {item.is_previewable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTogglePreview}
                disabled={previewLoading}
              >
                {previewLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : previewOpen ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                {previewOpen ? "Hide" : "Preview"}
              </Button>
            )}
            {allowDownloads && (
              <Button type="button" size="sm" onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download
              </Button>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <p className="px-4 pb-3 text-xs text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {previewOpen && previewUrl && (
        <div className="border-t border-border p-3">
          <iframe
            src={previewUrl}
            title={item.file_name ?? item.title}
            className="h-[60vh] min-h-[360px] w-full rounded-lg border border-border bg-muted/30"
          />
        </div>
      )}
    </li>
  );
}

function CenteredCard({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-floating sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <h1 className="mt-5 font-heading text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

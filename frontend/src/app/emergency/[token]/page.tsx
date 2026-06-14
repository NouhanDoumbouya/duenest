"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  downloadEmergencyItem,
  getEmergencyItemPreviewBlob,
  getPublicEmergencyPack,
  verifyEmergencyAccessCode,
} from "@/lib/emergency";
import type {
  PublicEmergencyItem,
  PublicEmergencyPack,
} from "@/types/emergency";

interface ViewerError {
  title: string;
  message: string;
}

/** Map a backend error into a calm, recipient-friendly message. */
function errorFromApi(err: unknown): ViewerError {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const data = err.data as Record<string, unknown>;
    const state = typeof data.state === "string" ? data.state : undefined;
    if (state === "invalid") {
      return {
        title: "This emergency link is invalid or no longer available.",
        message:
          "Check the link, or ask the person who shared it to send a new one.",
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

function isRequiresCode(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    !!err.data &&
    typeof err.data === "object" &&
    (err.data as Record<string, unknown>).state === "requires_code"
  );
}

function formatDocType(value: string): string {
  if (!value) return "Document";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function EmergencyViewerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [pack, setPack] = useState<PublicEmergencyPack | null>(null);
  const [requiresCode, setRequiresCode] = useState(false);
  const [error, setError] = useState<ViewerError | null>(null);
  // The access code is kept in memory only (never persisted) and re-sent as a
  // header for preview/download. The backend remains the source of truth.
  const [accessCode, setAccessCode] = useState<string>("");
  const [loadKey, setLoadKey] = useState("");

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Derive loading from a key comparison instead of toggling a boolean inside
  // the effect (which would trigger cascading renders).
  const key = `${token}:${accessCode}`;
  const loading = loadKey !== key;

  useEffect(() => {
    let active = true;
    const code = accessCode || undefined;
    getPublicEmergencyPack(token, code)
      .then((result) => {
        if (!active) return;
        setPack(result);
        setRequiresCode(false);
        setError(null);
        setLoadKey(`${token}:${accessCode}`);
      })
      .catch((err) => {
        if (!active) return;
        if (isRequiresCode(err)) {
          setPack(null);
          setRequiresCode(true);
          setError(null);
        } else {
          setPack(null);
          setRequiresCode(false);
          setError(errorFromApi(err));
        }
        setLoadKey(`${token}:${accessCode}`);
      });
    return () => {
      active = false;
    };
  }, [token, accessCode]);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = codeInput.trim();
    if (!code) {
      setCodeError("Enter the emergency access code shared by the owner.");
      return;
    }
    setVerifying(true);
    setCodeError(null);
    try {
      await verifyEmergencyAccessCode(token, code);
      // Applying the code retriggers the load effect with the X-Access-Code header.
      setAccessCode(code);
    } catch (err) {
      setCodeError(
        err instanceof ApiError
          ? err.message
          : "That code does not match. Check it and try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Logo href="/" size="md" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Emergency access
          </span>
        </header>

        <section className="flex flex-1 flex-col py-8">
          {loading ? (
            <CenteredCard
              icon={<Loader2 className="size-6 animate-spin" />}
              title="Opening emergency access"
              message="Checking the link and what was shared with you…"
            />
          ) : requiresCode ? (
            <CodeGate
              codeInput={codeInput}
              setCodeInput={setCodeInput}
              codeError={codeError}
              verifying={verifying}
              onSubmit={handleVerify}
            />
          ) : error ? (
            <CenteredCard
              icon={<EyeOff className="size-6" />}
              title={error.title}
              message={error.message}
            />
          ) : pack ? (
            <PackView pack={pack} token={token} accessCode={accessCode} />
          ) : null}
        </section>

        <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Powered by DueNest — only the items the owner selected are shared
            here.
          </p>
        </footer>
      </div>
    </main>
  );
}

function PackView({
  pack,
  token,
  accessCode,
}: {
  pack: PublicEmergencyPack;
  token: string;
  accessCode?: string;
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
}: {
  item: PublicEmergencyItem;
  token: string;
  accessCode?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Clean up object URLs when the preview closes or the component unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleDownload() {
    setDownloading(true);
    setActionError(null);
    try {
      await downloadEmergencyItem(
        token,
        item.id,
        item.file_name ?? `${item.title}`,
        accessCode,
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
      const blob = await getEmergencyItemPreviewBlob(token, item.id, accessCode);
      setPreviewUrl(URL.createObjectURL(blob));
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
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download
            </Button>
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

function CodeGate({
  codeInput,
  setCodeInput,
  codeError,
  verifying,
  onSubmit,
}: {
  codeInput: string;
  setCodeInput: (value: string) => void;
  codeError: string | null;
  verifying: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-floating sm:p-8">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <LockKeyhole className="size-6" />
      </span>
      <h1 className="mt-5 font-heading text-2xl font-semibold">
        This emergency access is protected
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Enter the emergency access code shared by the owner to view the selected
        emergency information. The code is not saved in your browser.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 text-left">
        <Input
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value)}
          placeholder="Access code"
          aria-label="Emergency access code"
          autoFocus
        />
        {codeError && (
          <p className="text-sm text-destructive" role="alert">
            {codeError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={verifying}>
          {verifying ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LockKeyhole className="size-4" />
          )}
          {verifying ? "Checking access code…" : "Unlock emergency access"}
        </Button>
      </form>
    </div>
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
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

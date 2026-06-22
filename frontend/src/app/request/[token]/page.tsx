"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, FileText, Inbox, Loader2, LogIn } from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getDocuments } from "@/lib/documents";
import { getFileInbox } from "@/lib/document-files";
import {
  getPublicShareRequest,
  submitShareRequestResponse,
} from "@/lib/share-requests";
import { cn } from "@/lib/utils";
import type { PublicShareRequest } from "@/types/share-requests";

interface FileOption {
  value: string; // "doc:<id>" | "file:<id>"
  label: string;
}

export default function RespondToRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [meta, setMeta] = useState<PublicShareRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [options, setOptions] = useState<FileOption[]>([]);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const loadVault = useCallback(async () => {
    const [docs, inbox] = await Promise.all([
      getDocuments({ has_file: true }),
      getFileInbox(),
    ]);
    const opts: FileOption[] = [
      ...docs.results.map((d) => ({ value: `doc:${d.id}`, label: d.title })),
      ...inbox.results.map((f) => ({
        value: `file:${f.id}`,
        label: f.original_filename,
      })),
    ];
    setOptions(opts);
  }, []);

  useEffect(() => {
    let active = true;
    const authed = Boolean(getAccessToken());
    getPublicShareRequest(token)
      .then(async (data) => {
        if (!active) return;
        setLoggedIn(authed);
        setMeta(data);
        if (authed && data.is_open) {
          try {
            await loadVault();
          } catch {
            /* vault load failure is non-fatal; selectors just stay empty */
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "We couldn't load this request.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, loadVault]);

  const requiredMissing =
    meta?.items.some((i) => i.is_required && !selections[i.id]) ?? false;

  async function handleSubmit() {
    if (!meta) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = meta.items
        .filter((i) => selections[i.id])
        .map((i) => {
          const [kind, id] = selections[i.id].split(":");
          return kind === "doc"
            ? { item_id: i.id, document_ids: [Number(id)] }
            : { item_id: i.id, file_ids: [Number(id)] };
        });
      await submitShareRequestResponse(token, items);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send your response.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <LogoMark size="sm" />
        <span className="font-heading text-lg font-semibold">CertaNest</span>
      </div>

      <div className="w-full max-w-lg">
        {loading ? (
          <Card>
            <Spinner label="Loading request…" />
          </Card>
        ) : error && !meta ? (
          <Card>
            <p className="py-6 text-center text-sm text-muted-foreground">
              {error}
            </p>
          </Card>
        ) : done ? (
          <Card>
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="size-12 text-brand-success" />
              <h1 className="mt-4 font-heading text-xl font-semibold">
                Sent
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your documents were sent to {meta?.requester_name}. They&apos;ll
                find them in their CertaNest account.
              </p>
            </div>
          </Card>
        ) : meta ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {meta.requester_name}
              </span>{" "}
              is requesting documents from you.
            </p>
            <h1 className="mt-1 font-heading text-xl font-semibold">
              {meta.title}
            </h1>
            {meta.message && (
              <p className="mt-2 text-sm text-muted-foreground">{meta.message}</p>
            )}

            {!meta.is_open ? (
              <p className="mt-5 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                This request is no longer accepting responses.
              </p>
            ) : !loggedIn ? (
              <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Sign in to fulfil this from your CertaNest vault — pick documents
                  you already have, no re-uploading.
                </p>
                <Link
                  href={`/login?next=/request/${token}`}
                  className="mt-3 inline-flex"
                >
                  <Button>
                    <LogIn className="size-4" />
                    Sign in to respond
                  </Button>
                </Link>
                <p className="mt-3 text-xs text-muted-foreground">
                  New to CertaNest?{" "}
                  <Link
                    href={`/register?next=/request/${token}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Create a free account
                  </Link>
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {meta.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-medium",
                          item.is_required
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {item.is_required ? "Required" : "Optional"}
                      </span>
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <select
                      value={selections[item.id] ?? ""}
                      onChange={(e) =>
                        setSelections((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      className="mt-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Choose from your vault…</option>
                      {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                {options.length === 0 && (
                  <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <Inbox className="size-4" />
                    You have no documents yet. Add some to your vault, then come
                    back to respond.
                  </p>
                )}

                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={submitting || requiredMissing}
                  className="w-full"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                  Send documents
                </Button>
                <p className="text-center text-[0.7rem] text-muted-foreground">
                  Only the documents you pick are shared. Your wider vault stays
                  private.
                </p>
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-floating">
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  FileSearch,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import {
  getIndexStatus,
  indexDocument,
  type AiIndexStatus,
  type IndexResult,
} from "@/lib/ai";
import { cn } from "@/lib/utils";

/**
 * Shows whether a document is prepared for AI content Q&A, and lets the owner
 * index it. Indexing never calls the AI model — it only prepares already
 * extracted text — so this is safe, cheap, and explicit.
 *
 * Reusable in two places:
 *  - the document workspace side panel (default card), and
 *  - the Ask page scope bar (`compact`), so a selected document can be indexed
 *    inline before asking about its content.
 */
export function AiIndexStatusCard({
  documentId,
  compact = false,
  className,
}: {
  documentId: number;
  compact?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<AiIndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hidden, setHidden] = useState(false); // feature not available (503)
  const [indexing, setIndexing] = useState(false);
  const [noText, setNoText] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Promise-chain (not async/await) so state updates live in deferred callbacks,
  // never synchronously in the effect body. Returns the promise for callers that
  // want to refresh after an action.
  function load(signal?: { cancelled: boolean }) {
    return getIndexStatus(documentId)
      .then((next) => {
        if (signal?.cancelled) return;
        setStatus(next);
        setLoadError(false);
      })
      .catch((err: unknown) => {
        if (signal?.cancelled) return;
        if (err instanceof ApiError && err.status === 503) {
          setHidden(true); // AI feature isn't available for this account
          return;
        }
        setLoadError(true);
      })
      .finally(() => {
        if (!signal?.cancelled) setLoading(false);
      });
  }

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function handleIndex(force = false) {
    if (indexing) return;
    setIndexing(true);
    setNoText(false);
    setNeedsConsent(false);
    try {
      const result: IndexResult = await indexDocument(documentId, force);
      if (result.available === false || result.reason === "consent_required") {
        setNeedsConsent(true);
        return;
      }
      if (result.status === "no_text") {
        setNoText(true);
        setToast({
          kind: "error",
          message: "No readable text was found in this document yet.",
        });
        return;
      }
      if (result.status === "forbidden") {
        setToast({ kind: "error", message: "Could not index this document." });
        return;
      }
      // indexed / unchanged → refresh the status badge from the server
      await load();
      setToast({ kind: "success", message: "Document is ready for AI." });
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setHidden(true);
        return;
      }
      setToast({
        kind: "error",
        message: "Could not index this document. Please try again.",
      });
    } finally {
      setIndexing(false);
    }
  }

  if (hidden) return null;

  const body = (() => {
    if (loading) {
      return (
        <Row icon={<Loader2 className="size-4 animate-spin" />} tone="muted">
          Checking AI status…
        </Row>
      );
    }
    if (loadError) {
      return (
        <div className="space-y-2">
          <Row icon={<TriangleAlert className="size-4" />} tone="muted">
            We couldn&apos;t check AI index status.
          </Row>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            <RefreshCw className="size-4" /> Try again
          </Button>
        </div>
      );
    }
    if (needsConsent) {
      return (
        <div className="space-y-2">
          <Row icon={<Sparkles className="size-4" />} tone="muted">
            Turn on AI in settings to prepare this document.
          </Row>
          <Link
            href="/dashboard/settings/ai"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Go to AI settings
          </Link>
        </div>
      );
    }
    if (indexing) {
      return (
        <Row icon={<Loader2 className="size-4 animate-spin" />} tone="muted">
          Preparing this document for AI…
        </Row>
      );
    }
    if (noText) {
      return (
        <div className="space-y-1.5">
          <Row icon={<FileSearch className="size-4" />} tone="muted">
            No readable text was found in this document yet.
          </Row>
          <p className="text-xs text-muted-foreground">
            Try scanning the document again or uploading a clearer file.
          </p>
        </div>
      );
    }
    if (status?.indexed) {
      const sections = status.chunk_count;
      return (
        <div className="space-y-2.5">
          <Row icon={<Check className="size-4 text-brand-success" />}>
            <span className="font-medium text-foreground">
              Ready for document Q&amp;A
            </span>
          </Row>
          <p className="text-xs text-muted-foreground">
            {sections > 0
              ? `${sections} text section${sections === 1 ? "" : "s"} indexed · `
              : ""}
            {status.embedded
              ? "answers can use this document's content"
              : "using document content search"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleIndex(true)}
          >
            <RefreshCw className="size-4" /> Re-index
          </Button>
        </div>
      );
    }
    // not indexed
    return (
      <div className="space-y-2.5">
        <Row icon={<Sparkles className="size-4 text-primary" />} tone="muted">
          This document isn&apos;t prepared for AI yet. Index it to ask questions
          about its content.
        </Row>
        <Button type="button" size="sm" onClick={() => void handleIndex(false)}>
          <Sparkles className="size-4" /> Index for AI
        </Button>
      </div>
    );
  })();

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-card px-3 py-2.5",
          className,
        )}
      >
        {body}
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    );
  }

  return (
    <Card size="sm" className={className}>
      <CardContent className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Sparkles className="size-3.5" /> Document AI
        </p>
        {body}
      </CardContent>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Card>
  );
}

/** A compact icon + text status row. */
function Row({
  icon,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  tone?: "default" | "muted";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm leading-relaxed",
        tone === "muted" ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

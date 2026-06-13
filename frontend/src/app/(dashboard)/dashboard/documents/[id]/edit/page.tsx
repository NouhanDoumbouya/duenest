"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { DocumentForm } from "@/components/documents/document-form";
import { LifecycleBadge } from "@/components/documents/lifecycle-badge";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import { getDocument, updateDocument } from "@/lib/documents";
import type { CreateDocumentRequest, DocumentRecord } from "@/types/documents";

export default function EditDocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);
  const workspaceHref = validId ? `/dashboard/documents/${id}` : "/dashboard/documents";

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid document.",
  );

  useEffect(() => {
    if (!validId) return;
    let active = true;

    getDocument(id)
      .then((result) => {
        if (!active) return;
        setDoc(result);
        setLoadError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This document could not be found.");
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Unable to load document.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [id, validId]);

  async function handleUpdate(payload: CreateDocumentRequest) {
    await updateDocument(id, payload);
    router.push(workspaceHref);
    router.refresh();
  }

  return (
    <PageContainer width="narrow">
      <div>
        <Link
          href={workspaceHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to workspace
        </Link>
      </div>

      {loadError ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ArrowLeft}
              title="Document unavailable"
              description={loadError}
              action={
                <Link
                  href="/dashboard/documents"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"
                >
                  Back to documents
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Metadata
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {doc?.title ?? "Edit document"}
              </h1>
              {doc && <DocumentStatusBadge status={doc.computed_status} />}
              {doc && <LifecycleBadge status={doc.lifecycle_status} />}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Edit the document details, dates, tags, custom fields, physical
              location, and notes. Files, proof, renewal tools, sharing, and
              activity live in the workspace.
            </p>
          </div>

          <SectionCard
            title="Document metadata"
            description="Keep the facts and dates current so DueNest can calculate status accurately."
          >
            {doc === null ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span>Loading document...</span>
              </div>
            ) : (
              <DocumentForm
                initial={doc}
                submitLabel="Save changes"
                cancelHref={workspaceHref}
                onSubmit={handleUpdate}
              />
            )}
          </SectionCard>
        </>
      )}
    </PageContainer>
  );
}

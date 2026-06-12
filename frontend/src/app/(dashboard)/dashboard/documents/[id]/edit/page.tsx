"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { DocumentForm } from "@/components/documents/document-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getDocument, updateDocument } from "@/lib/documents";
import type { CreateDocumentRequest, DocumentRecord } from "@/types/documents";

export default function EditDocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid document.",
  );

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getDocument(id)
      .then((result) => {
        if (active) setDoc(result);
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
    router.push("/dashboard/documents");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to documents
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Edit document</CardTitle>
          <CardDescription>Update the details and key dates.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {loadError}
            </p>
          ) : doc === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading document…</span>
            </div>
          ) : (
            <DocumentForm
              initial={doc}
              submitLabel="Save changes"
              onSubmit={handleUpdate}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

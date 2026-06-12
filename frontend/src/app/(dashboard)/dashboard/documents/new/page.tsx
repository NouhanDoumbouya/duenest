"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DocumentForm } from "@/components/documents/document-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { uploadDocumentFile } from "@/lib/document-files";
import { createDocument } from "@/lib/documents";
import type { CreateDocumentRequest } from "@/types/documents";

export default function NewDocumentPage() {
  const router = useRouter();

  async function handleCreate(
    payload: CreateDocumentRequest,
    file?: File | null,
  ) {
    // Create the document, then attach the optional file in the same step.
    const created = await createDocument(payload);
    if (file) {
      try {
        await uploadDocumentFile(created.id, file);
      } catch {
        // The document was created; the file can be re-uploaded on the
        // workspace if this attachment failed (e.g. a transient network error).
      }
    }
    // Land on the document workspace (metadata + files) for any follow-up.
    router.push(`/dashboard/documents/${created.id}/edit`);
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
          <CardTitle className="text-xl">Add a document</CardTitle>
          <CardDescription>
            Store the details and key dates so DueNest can track renewals for
            you — and attach the file now if you have it. Only the title is
            required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentForm
            submitLabel="Create document"
            attachFile
            onSubmit={handleCreate}
          />
        </CardContent>
      </Card>
    </div>
  );
}

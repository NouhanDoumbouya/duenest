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
import { createDocument } from "@/lib/documents";
import type { CreateDocumentRequest } from "@/types/documents";

export default function NewDocumentPage() {
  const router = useRouter();

  async function handleCreate(payload: CreateDocumentRequest) {
    await createDocument(payload);
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
          <CardTitle className="text-xl">Add a document</CardTitle>
          <CardDescription>
            Store the details and key dates so DueNest can track renewals for
            you. Only the title is required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentForm submitLabel="Create document" onSubmit={handleCreate} />
        </CardContent>
      </Card>
    </div>
  );
}

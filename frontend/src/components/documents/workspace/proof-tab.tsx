"use client";

import { DocumentProofRecords } from "@/components/documents/document-proof-records";
import { SectionCard } from "@/components/ui/section-card";

export function ProofTab({ documentId }: { documentId: number }) {
  return (
    <SectionCard
      title="Proof and submission records"
      description="Receipts, confirmations, tracking numbers, and submission notes tied to this document."
    >
      <DocumentProofRecords documentId={documentId} />
    </SectionCard>
  );
}

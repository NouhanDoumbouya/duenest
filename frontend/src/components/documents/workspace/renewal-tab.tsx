"use client";

import { useEffect, useState } from "react";

import { DocumentAppointments } from "@/components/documents/document-appointments";
import { DocumentChecklists } from "@/components/documents/document-checklists";
import { DocumentFileExtraction } from "@/components/documents/document-file-extraction";
import { DocumentPayments } from "@/components/documents/document-payments";
import { DocumentReminderRules } from "@/components/documents/document-reminder-rules";
import { DocumentRenewalHistory } from "@/components/documents/document-renewal-history";
import { SectionCard } from "@/components/ui/section-card";
import { getDocumentFiles } from "@/lib/document-files";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";

export function RenewalTab({
  doc,
  onDocumentUpdated,
}: {
  doc: DocumentRecord;
  onDocumentUpdated?: (doc: DocumentRecord) => void;
}) {
  const [files, setFiles] = useState<DocumentFile[]>([]);

  useEffect(() => {
    let active = true;
    getDocumentFiles(doc.id)
      .then((page) => active && setFiles(page.results))
      .catch(() => active && setFiles([]));
    return () => {
      active = false;
    };
  }, [doc.id]);

  // When opened via a calendar "Open appointment" deep-link
  // (?tab=renewal#appointments), scroll the Appointments section into view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#appointments") return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("appointments")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Reminders"
        description="Calculate renewal and expiry reminders for this document."
      >
        <DocumentReminderRules document={doc} />
      </SectionCard>

      <SectionCard
        title="Renewal checklists"
        description="Prepare everything you need before the renewal or application deadline."
      >
        <DocumentChecklists documentId={doc.id} />
      </SectionCard>

      <SectionCard
        title="Renewal history"
        description="A timeline of past renewals for this document."
      >
        <DocumentRenewalHistory documentId={doc.id} />
      </SectionCard>

      <div id="appointments" className="scroll-mt-24">
        <SectionCard
          title="Appointments"
          description="Appointments connected to this document."
        >
          <DocumentAppointments documentId={doc.id} />
        </SectionCard>
      </div>

      <SectionCard
        title="Renewal & application costs"
        description="Track what renewing or applying for this document costs."
      >
        <DocumentPayments documentId={doc.id} />
      </SectionCard>

      <SectionCard
        title="Extracted details"
        description="Read details from an attached file and review them before applying."
      >
        <DocumentFileExtraction
          documentId={doc.id}
          files={files}
          onApplied={(updated) => onDocumentUpdated?.(updated)}
        />
      </SectionCard>
    </div>
  );
}

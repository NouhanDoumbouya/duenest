import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { daysUntil, formatDate } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

function DateCell({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string | null;
  emphasise?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-medium",
          emphasise && "text-destructive",
        )}
      >
        {formatDate(value)}
      </p>
    </div>
  );
}

export function DocumentCard({
  doc,
  onRequestDelete,
}: {
  doc: DocumentRecord;
  onRequestDelete: (doc: DocumentRecord) => void;
}) {
  const meta = [doc.document_type, doc.issuer, doc.country]
    .filter(Boolean)
    .join(" · ");
  const expiryDays = daysUntil(doc.expiry_date);
  const expiryPast = expiryDays !== null && expiryDays < 0;

  return (
    <Card className="transition-shadow hover:shadow-md hover:shadow-foreground/5">
      <CardContent className="flex flex-col gap-4 py-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/documents/${doc.id}/edit`}
              className="truncate font-heading text-base font-semibold hover:underline"
            >
              {doc.title}
            </Link>
            <DocumentStatusBadge status={doc.status} />
          </div>
          {meta && (
            <p className="mt-1 truncate text-sm text-muted-foreground">{meta}</p>
          )}
          {doc.category_name && (
            <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {doc.category_name}
            </span>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <DateCell label="Issued" value={doc.issue_date} />
            <DateCell
              label="Expires"
              value={doc.expiry_date}
              emphasise={expiryPast}
            />
            <DateCell label="Renewal" value={doc.renewal_date} />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          <Link
            href={`/dashboard/documents/${doc.id}/edit`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Pencil className="size-3.5" />
            Edit
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onRequestDelete(doc)}
            aria-label={`Delete ${doc.title}`}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

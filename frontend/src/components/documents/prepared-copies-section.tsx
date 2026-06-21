"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSignature } from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api";
import { listPreparedDocuments } from "@/lib/fill-sign";
import { formatDate } from "@/lib/documents";
import type { PreparedDocument, SignatureRecord } from "@/types/fill-sign";

const METHOD_LABEL: Record<SignatureRecord["signature_method"], string> = {
  drawn: "Drawn signature",
  typed: "Typed signature",
  uploaded: "Uploaded signature",
  none: "Fill only (no signature)",
};

function shortHash(hash: string): string {
  return hash ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : "—";
}

/**
 * Signature audit trail for a document: lists its prepared (filled/signed) copies
 * and the audit record for each (signer, method, when, original/prepared hashes).
 *
 * Renders nothing while loading or when there are no prepared copies, so it never
 * clutters documents that have none. Not a legal certification — audit only.
 */
export function PreparedCopiesSection({
  documentId,
  reloadKey,
}: {
  documentId: number;
  reloadKey?: number;
}) {
  const [items, setItems] = useState<PreparedDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listPreparedDocuments({ document: documentId })
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Could not load signed copies.",
        ),
      );
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Stay silent while loading and when there are none.
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load signed copies.{" "}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setItems(null);
            load();
          }}
          className="font-medium underline underline-offset-2"
        >
          Try again
        </button>
      </p>
    );
  }
  if (items === null || items.length === 0) return null;

  return (
    <SectionCard
      title="Signed copies"
      description="Prepared (filled/signed) copies of this document and their audit trail."
    >
      <ul className="divide-y divide-border">
        {items.map((prepared) => {
          const record = prepared.signature_records[0];
          return (
            <li key={prepared.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileSignature className="size-4 shrink-0 text-brand-teal" aria-hidden />
                <span className="min-w-0 truncate text-sm font-medium">
                  {prepared.prepared_file.original_filename}
                </span>
                <StatusBadge tone="trust">Signed copy</StatusBadge>
                <span className="text-metadata">
                  {formatDate(prepared.created_at)}
                </span>
              </div>
              {record && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pl-6 text-xs">
                  {record.signer_name && (
                    <>
                      <dt className="text-muted-foreground">Signer</dt>
                      <dd className="font-medium">{record.signer_name}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Method</dt>
                  <dd>{METHOD_LABEL[record.signature_method]}</dd>
                  <dt className="text-muted-foreground">Prepared</dt>
                  <dd>{formatDate(record.signed_at)}</dd>
                  <dt className="text-muted-foreground">Original hash</dt>
                  <dd className="font-mono break-all">
                    {shortHash(record.original_file_hash)}
                  </dd>
                  <dt className="text-muted-foreground">Prepared hash</dt>
                  <dd className="font-mono break-all">
                    {shortHash(record.prepared_file_hash)}
                  </dd>
                </dl>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-metadata">
        This record shows when each signed copy was created and the SHA-256 hashes of
        the original and prepared files. It is not a legal certification of signature
        validity.
      </p>
    </SectionCard>
  );
}

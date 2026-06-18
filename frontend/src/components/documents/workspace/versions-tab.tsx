"use client";

import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import {
  getDocumentVersions,
  restoreDocumentVersionMetadata,
  type DocumentVersion,
  type DocumentVersionType,
} from "@/lib/documents";
import { formatDate } from "@/lib/documents";

const TYPE_LABEL: Record<DocumentVersionType, string> = {
  file_upload: "File added",
  file_replacement: "File replaced",
  metadata_snapshot: "Details snapshot",
  extraction_applied: "Extraction applied",
  manual_update: "Details updated",
};

export function VersionsTab({
  documentId,
  onChanged,
}: {
  documentId: number;
  onChanged?: () => void;
}) {
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    let active = true;
    getDocumentVersions(documentId)
      .then((res) => {
        if (!active) return;
        // Newest first; the highest version number is the current state.
        setVersions([...res].sort((a, b) => b.version_number - a.version_number));
      })
      .catch((err) => {
        if (!active) return;
        setVersions([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load versions.",
        );
      });
    return () => {
      active = false;
    };
  }

  useEffect(load, [documentId]);

  async function restore(versionId: number) {
    setBusyId(versionId);
    setError(null);
    try {
      await restoreDocumentVersionMetadata(documentId, versionId);
      setConfirmingId(null);
      load();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't restore that version. The document is unchanged.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const currentNumber =
    versions && versions.length > 0 ? versions[0].version_number : null;

  return (
    <SectionCard
      title="Version history"
      description="Each change records a snapshot. Restoring brings back a version's details — your files are never rolled back, and your older copies stay safe."
    >
      {error && (
        <p
          className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {versions === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading versions…</span>
        </div>
      ) : versions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No versions yet"
          description="As you update this document's details or replace its file, each change is recorded here."
        />
      ) : (
        <ul className="space-y-3">
          {versions.map((version) => {
            const isCurrent = version.version_number === currentNumber;
            return (
              <li
                key={version.id}
                className="rounded-xl border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    Version {version.version_number}
                  </span>
                  {isCurrent ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Current
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Previous
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {TYPE_LABEL[version.version_type] ?? "Update"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(version.created_at)}
                  </span>
                </div>
                {version.change_summary && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {version.change_summary}
                  </p>
                )}
                {!isCurrent &&
                  (confirmingId === version.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Restore this version&apos;s details?
                      </span>
                      <Button
                        size="sm"
                        onClick={() => restore(version.id)}
                        disabled={busyId === version.id}
                      >
                        {busyId === version.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingId(null)}
                        disabled={busyId === version.id}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(version.id)}
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                    >
                      Restore this version
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

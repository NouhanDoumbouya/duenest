"use client";

import { useState } from "react";
import { PenLine, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFeature } from "@/components/features/feature-flags-provider";
import { FileToolsDialog } from "@/components/documents/file-tools-dialog";
import { FillSignDialog } from "@/components/documents/fill-sign-dialog";
import { toolsForFile } from "@/lib/files/tools";
import type { DocumentFile } from "@/types/document-files";

function isPdf(file: DocumentFile): boolean {
  return (
    file.content_type === "application/pdf" ||
    file.original_filename.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Card-level entry point for the unified file tools. Opens FileToolsDialog.
 * Renders nothing when no tool applies to this file type or all are paused, so
 * surfaces never show an empty "Tools" button.
 */
export function FileToolsButton({
  file,
  loadBlob,
  onSave,
  saveLabel,
  onNotify,
  onShare,
  variant = "outline",
  size = "sm",
  className,
}: {
  file: DocumentFile;
  loadBlob: () => Promise<Blob>;
  onSave: (blob: Blob, name: string) => Promise<void>;
  saveLabel: string;
  onNotify?: (message: string, kind: "success" | "error") => void;
  onShare?: (blob: Blob, name: string) => Promise<void>;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fillSignOpen, setFillSignOpen] = useState(false);

  const compressOn = useFeature("document_compress");
  const extractOn = useFeature("document_page_extract");
  const redactOn = useFeature("document_redaction");
  const fillSignOn = useFeature("fill_sign");
  const flagEnabled: Record<string, boolean> = {
    document_compress: compressOn,
    document_page_extract: extractOn,
    document_redaction: redactOn,
  };
  const hasTools = toolsForFile(file).some((t) => flagEnabled[t.flag]);
  const showFillSign = fillSignOn && isPdf(file);
  if (!hasTools && !showFillSign) return null;

  return (
    <>
      {hasTools && (
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          onClick={() => setOpen(true)}
          aria-label={`Tools for ${file.original_filename}`}
        >
          <Wrench className="size-4" />
          <span>Tools</span>
        </Button>
      )}
      {showFillSign && (
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          onClick={() => setFillSignOpen(true)}
          aria-label={`Fill & Sign ${file.original_filename}`}
        >
          <PenLine className="size-4" />
          <span>Fill &amp; Sign</span>
        </Button>
      )}
      {open && (
        <FileToolsDialog
          file={file}
          loadBlob={loadBlob}
          onSave={onSave}
          saveLabel={saveLabel}
          onNotify={onNotify}
          onShare={onShare}
          onClose={() => setOpen(false)}
        />
      )}
      {fillSignOpen && (
        <FillSignDialog
          key={file.id}
          fileId={file.id}
          documentId={file.document}
          fileName={file.original_filename}
          onClose={() => setFillSignOpen(false)}
          onPrepared={() =>
            onNotify?.("Signed copy prepared. Your original is preserved.", "success")
          }
        />
      )}
    </>
  );
}

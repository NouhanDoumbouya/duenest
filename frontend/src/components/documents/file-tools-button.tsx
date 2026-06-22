"use client";

import { useState, type ReactNode } from "react";
import { Wrench } from "lucide-react";

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

export interface FileToolsOptions {
  file: DocumentFile;
  loadBlob: () => Promise<Blob>;
  onSave: (blob: Blob, name: string) => Promise<void>;
  saveLabel: string;
  onNotify?: (message: string, kind: "success" | "error") => void;
  onShare?: (blob: Blob, name: string) => Promise<void>;
  /** Called after a Fill & Sign prepared copy is created (a server-side file). */
  onPrepared?: () => void;
}

export interface FileToolsApi {
  /** Whether any (flag-enabled) transform tool applies to this file. */
  hasTools: boolean;
  /** Whether Fill & Sign is available (enabled + a PDF). */
  showFillSign: boolean;
  /** Whether to surface a "Tools" entry at all (transforms or Fill & Sign).
   *  Fill & Sign lives inside the Tools dialog, so there's one entry point. */
  hasAnyTool: boolean;
  openTools: () => void;
  /** The tool/Fill&Sign dialogs — mount once, OUTSIDE any popover/menu so they
   *  survive that menu closing when a tool is opened from it. */
  dialogs: ReactNode;
}

/**
 * Single source of truth for a file's unified tools: availability flags, open
 * handlers, and the dialog elements to mount. Lets a surface drive the same
 * tools from inline buttons (FileToolsButton) or from an overflow menu.
 */
export function useFileTools({
  file,
  loadBlob,
  onSave,
  saveLabel,
  onNotify,
  onShare,
  onPrepared,
}: FileToolsOptions): FileToolsApi {
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

  const dialogs = (
    <>
      {open && (
        <FileToolsDialog
          file={file}
          loadBlob={loadBlob}
          onSave={onSave}
          saveLabel={saveLabel}
          onNotify={onNotify}
          onShare={onShare}
          showFillSign={showFillSign}
          onFillSign={() => {
            setOpen(false);
            setFillSignOpen(true);
          }}
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
          onPrepared={() => {
            onNotify?.(
              "Signed copy prepared. Your original is preserved.",
              "success",
            );
            onPrepared?.();
          }}
        />
      )}
    </>
  );

  return {
    hasTools,
    showFillSign,
    hasAnyTool: hasTools || showFillSign,
    openTools: () => setOpen(true),
    dialogs,
  };
}

/**
 * Card-level entry point for the unified file tools: inline "Tools" and
 * "Fill & Sign" buttons. Renders nothing when no tool applies to this file type
 * or all are paused, so surfaces never show an empty "Tools" button.
 */
export function FileToolsButton({
  variant = "outline",
  size = "sm",
  className,
  ...options
}: FileToolsOptions & {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { file } = options;
  const { hasAnyTool, openTools, dialogs } = useFileTools(options);

  if (!hasAnyTool) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={openTools}
        aria-label={`Tools for ${file.original_filename}`}
      >
        <Wrench className="size-4" />
        <span>Tools</span>
      </Button>
      {dialogs}
    </>
  );
}

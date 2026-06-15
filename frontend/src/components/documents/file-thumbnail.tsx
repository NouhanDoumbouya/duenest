"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import { getInboxFilePreviewBlob } from "@/lib/document-files";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";

/**
 * A small thumbnail for an inbox file. For image files it lazily fetches the
 * preview through the existing authenticated, ownership-checked endpoint and
 * shows it; everything else falls back to a file icon. No new backend, no direct
 * URLs — it reuses the secure preview blob flow and revokes the object URL on
 * unmount.
 */
export function FileThumbnail({
  file,
  className,
}: {
  file: DocumentFile;
  className?: string;
}) {
  const isImage =
    file.is_previewable && file.content_type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let active = true;
    let objectUrl: string | null = null;
    getInboxFilePreviewBlob(file.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // Fall back to the icon; a failed thumbnail must never break the row.
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, isImage]);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={cn("size-10 shrink-0 rounded-lg object-cover", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground",
        className,
      )}
    >
      <FileText className="size-5" aria-hidden />
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  createDocumentFileVersion,
  getDocumentFileDownloadBlob,
} from "@/lib/document-files";
import { insertImagePage, replacePageWithImage } from "@/lib/pdf/pages";
import { rasterizePdf } from "@/lib/pdf/rasterize";
import type { DocumentFile } from "@/types/document-files";

/**
 * Replace a bad page or add a page in a saved PDF. Existing pages are preserved
 * exactly (pdf-lib, lossless) — only the new page is the imported image. The
 * result is saved as a NEW version; the original file is never modified.
 */
export function PageEditorDialog({
  documentId,
  file,
  onClose,
  onSaved,
}: {
  documentId: number;
  file: DocumentFile;
  onClose: () => void;
  onSaved: (created: DocumentFile) => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<HTMLCanvasElement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<{ kind: "replace" | "add"; index: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getDocumentFileDownloadBlob(documentId, file.id)
      .then(async (blob) => {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const canvases = await rasterizePdf(buf, { maxWidth: 360 });
        if (!active) return;
        setBytes(buf);
        setPages(canvases);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Couldn't open that PDF.",
        );
      });
    return () => {
      active = false;
    };
  }, [documentId, file.id]);

  function pick(kind: "replace" | "add", index: number) {
    pendingRef.current = { kind, index };
    inputRef.current?.click();
  }

  async function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const image = e.target.files?.[0];
    e.target.value = "";
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!image || !pending || !bytes) return;
    setBusy(true);
    setError(null);
    try {
      const imgBytes = new Uint8Array(await image.arrayBuffer());
      const next =
        pending.kind === "replace"
          ? await replacePageWithImage(bytes, pending.index, imgBytes, image.type)
          : await insertImagePage(bytes, pending.index, imgBytes, image.type);
      const canvases = await rasterizePdf(next, { maxWidth: 360 });
      setBytes(next);
      setPages(canvases);
      setDirty(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't update that page. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!bytes) return;
    setBusy(true);
    setError(null);
    try {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const base = file.original_filename.replace(/\.[^/.]+$/, "");
      const created = await createDocumentFileVersion(
        documentId,
        file.id,
        new File([buffer], `${base}-edited.pdf`, { type: "application/pdf" }),
      );
      onSaved(created);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save the new version. Your original is unchanged.",
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit pages of ${file.original_filename}`}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-semibold">
              Edit pages
            </p>
            <p className="text-xs text-muted-foreground">
              Replace a bad page or add one. Other pages stay unchanged; saved as
              a new version.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
          {error && (
            <p
              className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          {pages === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading pages…</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {pages.map((canvas, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={canvas.toDataURL("image/jpeg", 0.7)}
                    alt={`Page ${i + 1}`}
                    className="h-40 w-full rounded-md border border-border object-contain"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Page {i + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => pick("replace", i)}
                      disabled={busy}
                    >
                      <FileUp className="size-3.5" /> Replace
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {pages !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => pick("add", pages.length)}
              disabled={busy}
            >
              <Plus className="size-4" /> Add a page (image)
            </Button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save as new version
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={onImageSelected}
      />
    </div>
  );
}

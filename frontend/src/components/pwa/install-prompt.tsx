"use client";

import { Share, Plus, X, Download } from "lucide-react";

/**
 * Polite, dismissible install prompt. Shown only after the user has reached
 * value (dashboard), never aggressively, and never alongside a push-permission
 * request. Android/Chrome uses the captured beforeinstallprompt; iOS shows
 * Share → Add to Home Screen guidance.
 */
export function InstallPrompt({
  mode,
  onInstall,
  onDismiss,
}: {
  mode: "android" | "ios";
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Install DueNest"
      className="fixed inset-x-0 bottom-0 z-[65] mx-auto w-full max-w-md p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Install DueNest</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Open DueNest faster from your home screen and keep your life-admin
              dashboard one tap away.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss install prompt"
            className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        {mode === "ios" ? (
          <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Add to Home Screen</p>
            <ol className="mt-1.5 space-y-1">
              <li className="flex items-center gap-2">
                <Share className="size-3.5 shrink-0" aria-hidden /> Tap the Share
                button in Safari
              </li>
              <li className="flex items-center gap-2">
                <Plus className="size-3.5 shrink-0" aria-hidden /> Choose “Add to
                Home Screen”
              </li>
            </ol>
          </div>
        ) : null}

        <p className="mt-3 text-[11px] text-muted-foreground">
          Private documents are not stored offline on this device.
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted"
          >
            Maybe later
          </button>
          {mode === "android" ? (
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Download className="size-3.5" aria-hidden />
              Install
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

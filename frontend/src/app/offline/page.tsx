"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Calm offline fallback served by the service worker when a navigation fails.
 * Intentionally contains NO private data — no document names, metadata, or
 * cached vault content. CertaNest does not keep private documents offline.
 */
export default function OfflinePage() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center"
      style={{
        paddingTop: "max(4rem, env(safe-area-inset-top))",
        paddingBottom: "max(4rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt="CertaNest"
          width={72}
          height={72}
          className="mx-auto mb-6 rounded-2xl shadow-sm"
        />
        <h1 className="text-2xl font-semibold tracking-tight">You are offline</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          For your privacy, CertaNest does not store private documents offline on
          this device. Reconnect to access your vault.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              online
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                online ? "bg-emerald-500" : "bg-amber-500"
              }`}
              aria-hidden
            />
            {online ? "Back online" : "No connection"}
          </span>

          {online ? (
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Go to dashboard
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-medium transition hover:bg-muted"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

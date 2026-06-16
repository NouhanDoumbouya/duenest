"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { ToastProvider } from "@/components/scanner/Toasts";

// The scanner experience pulls in camera capture, the crop editor, and (lazily)
// jsPDF. Load it only on this route, client-side, with a calm skeleton so the
// rest of the app's bundle never carries it. ssr:false is valid here because
// this is a Client Component (see Next 16 lazy-loading guide).
const ScannerExperience = dynamic(
  () =>
    import("@/components/scanner/ScannerExperience").then(
      (m) => m.ScannerExperience,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        role="status"
        aria-label="Loading the document scanner"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          <p className="text-sm">Preparing the scanner…</p>
        </div>
      </div>
    ),
  },
);

export default function ScannerPage() {
  const router = useRouter();
  return (
    <ToastProvider>
      <ScannerExperience onClose={() => router.push("/dashboard/files")} />
    </ToastProvider>
  );
}

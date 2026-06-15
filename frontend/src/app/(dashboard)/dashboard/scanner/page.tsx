"use client";

import { useRouter } from "next/navigation";

import { ScannerExperience } from "@/components/scanner/ScannerExperience";
import { ToastProvider } from "@/components/scanner/Toasts";

export default function ScannerPage() {
  const router = useRouter();
  return (
    <ToastProvider>
      <ScannerExperience onClose={() => router.push("/dashboard/files")} />
    </ToastProvider>
  );
}

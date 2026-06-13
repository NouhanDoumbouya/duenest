"use client";

import type { ReactNode } from "react";

import { FounderShell } from "@/components/founder/founder-shell";

export default function FounderLayout({ children }: { children: ReactNode }) {
  return <FounderShell>{children}</FounderShell>;
}

"use client";

import Link from "next/link";
import { CheckCircle2, Download, FileText, Share2, ShieldCheck } from "lucide-react";

import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { BUNDLE_TYPE_LABELS } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type { Bundle } from "@/types/renewal-workspace";

/**
 * Calm pre-export/share summary of a pack: readiness, required vs optional
 * coverage, what's still missing, and the next actions. Read-only and honest —
 * it never claims official completeness and never blocks export/share; it only
 * surfaces what the user might want to resolve first.
 */
export function BundleReviewTab({
  bundle,
  bundleId,
  safeSendEnabled,
  onExport,
}: {
  bundle: Bundle;
  bundleId: number;
  safeSendEnabled: boolean;
  onExport: () => void;
}) {
  const r = bundle.readiness;
  const requiredReady = r.required_missing === 0;

  return (
    <div className="space-y-4 content-fade-in">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-lg">Review pack</CardTitle>
              <CardDescription>
                {BUNDLE_TYPE_LABELS[bundle.bundle_type]} · a quick look before
                you export or share.
              </CardDescription>
            </div>
            <ReadinessRing score={bundle.readiness_score} size={64} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {requiredReady ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-brand-success/25 bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
              <CheckCircle2 className="size-4" />
              {r.required_total > 0
                ? "All required items are ready to export."
                : "No required items yet — add what this pack needs."}
            </p>
          ) : (
            <InlineAlert tone="warn">
              {r.required_missing} required item
              {r.required_missing === 1 ? "" : "s"} still missing. You can add
              them in Requirements, or export anyway.
            </InlineAlert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Required
              </p>
              <p className="mt-1 text-sm font-medium">
                {r.required_satisfied}/{r.required_total} ready
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Optional
              </p>
              <p className="mt-1 text-sm font-medium">
                {r.optional_satisfied}/{r.optional_total} added
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Optional items don&apos;t block readiness.
              </p>
            </div>
          </div>

          {r.missing_required_titles.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/25 p-3">
              <p className="text-sm font-medium">Still missing</p>
              <ul className="mt-1.5 space-y-1">
                {r.missing_required_titles.map((title) => (
                  <li
                    key={title}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-brand-amber" />
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onExport} className="sm:flex-1">
              <Download className="size-4" />
              Export pack
            </Button>
            {safeSendEnabled && (
              <Link
                href={`/dashboard/quick-share/new?bundle=${bundleId}`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "sm:flex-1",
                )}
              >
                <Share2 className="size-4" />
                Share pack safely
              </Link>
            )}
          </div>
          {safeSendEnabled && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3.5" />
              No public link is created until you confirm access in SafeSend.
            </p>
          )}

          <TrustNotice icon={ShieldCheck} title="A preparation helper">
            This helps you organize and check your documents. It does not replace
            official requirements — always verify with the official institution
            or source. Exports are copies; your original documents are unchanged.
          </TrustNotice>
        </CardContent>
      </Card>
    </div>
  );
}

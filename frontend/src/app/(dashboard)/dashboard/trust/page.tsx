"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getSecuritySummary, markTrustReviewed } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { SecuritySummary } from "@/types/onboarding";

function formatValue(value: string | boolean) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value.replaceAll("_", " ");
}

export default function TrustCenterPage() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSecuritySummary()
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setError(null);
        void markTrustReviewed();
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load the Trust Center.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Trust Center
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Security and privacy posture
          </h1>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">
            A clear view of the protections currently implemented for document
            records, files, sharing, exports, and account controls.
          </p>
        </div>
        <Badge variant="outline" className="h-7 self-start sm:self-auto">
          Private beta
        </Badge>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {!summary ? (
        <Card className="h-[360px] animate-pulse">
          <CardContent className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <Lock className="size-5 text-primary" />
                <CardTitle>Default privacy</CardTitle>
                <CardDescription>
                  Records stay account-scoped unless the owner creates a
                  controlled share.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <ShieldCheck className="size-5 text-brand-success" />
                <CardTitle>Protected access</CardTitle>
                <CardDescription>
                  Files and exports are served through owner-only API endpoints.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <FileText className="size-5 text-brand-amber" />
                <CardTitle>Beta transparency</CardTitle>
                <CardDescription>
                  Known limitations are listed before wider public launch.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Implemented controls</CardTitle>
              <CardDescription>
                These are capability flags from the backend, not marketing copy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {summary.capabilities.map((capability) => (
                  <div
                    key={capability.key}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-success" />
                      <div>
                        <p className="font-medium">{capability.label}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {capability.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Data handling</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {Object.entries(summary.data_handling).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0"
                    >
                      <dt className="text-sm text-muted-foreground">
                        {key.replaceAll("_", " ")}
                      </dt>
                      <dd className="text-right text-sm font-medium">
                        {formatValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Known beta limitations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {summary.limitations.map((limitation) => (
                    <li
                      key={limitation}
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {limitation}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Public reference pages live outside the dashboard shell, so open
                them in a new tab to keep the user in their workspace. */}
            <a
              href="/security"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Security page
              <ExternalLink className="size-4" />
            </a>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Privacy draft
              <ExternalLink className="size-4" />
            </a>
            <Link
              href="/dashboard/settings/data"
              className={cn(buttonVariants())}
            >
              Data controls
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

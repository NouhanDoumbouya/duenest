"use client";

import { FormEvent, use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, Loader2, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Logo } from "@/components/layout/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  getPublicDocumentRequest,
  uploadPublicDocumentRequest,
} from "@/lib/organizations";
import { cn } from "@/lib/utils";
import type { PublicDocumentRequest } from "@/types/organizations";

export default function OrganizationRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const decodedToken = decodeURIComponent(token);
  const [request, setRequest] = useState<PublicDocumentRequest | null>(null);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPublicDocumentRequest(decodedToken)
      .then((result) => {
        if (!active) return;
        setRequest(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load this document request.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [decodedToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      await uploadPublicDocumentRequest(decodedToken, { file, email, notes });
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to submit this file.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="min-h-dvh bg-background">
        <section className="border-b border-border bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                Secure request
              </span>
              <h1 className="mt-5 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Submit a requested file
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                This upload link submits only to the document request shown here.
              </p>
            </div>

            <Card className="shadow-elevated">
              <CardContent className="min-h-[460px] p-6 sm:p-8">
                {loading ? (
                  <div className="flex h-[340px] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    Loading request...
                  </div>
                ) : submitted ? (
                  <div className="flex h-[340px] flex-col items-center justify-center gap-5 text-center">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-brand-success/10 text-brand-success">
                      <CheckCircle2 className="size-7" />
                    </span>
                    <div>
                      <h2 className="font-heading text-2xl font-semibold">
                        File submitted
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        The organization can now review this upload.
                      </p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex h-[340px] flex-col items-center justify-center gap-5 text-center">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                      <ShieldCheck className="size-6" />
                    </span>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Link href="/" className={cn(buttonVariants())}>
                      Return home
                    </Link>
                  </div>
                ) : request ? (
                  <form className="space-y-5" onSubmit={handleSubmit}>
                    <div>
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {request.organization_name}
                      </p>
                      <h2 className="mt-2 font-heading text-2xl font-semibold">
                        {request.title}
                      </h2>
                      {request.description && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {request.description}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="file">File</Label>
                      <Input
                        id="file"
                        type="file"
                        required
                        onChange={(event) =>
                          setFile(event.target.files?.[0] ?? null)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={4}
                      />
                    </div>

                    <Button type="submit" size="lg" disabled={submitting || !file}>
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileUp className="size-4" />
                      )}
                      Submit file
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-8 sm:px-6">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Shared securely through DueNest.
          </p>
        </div>
      </footer>
    </>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { DoorClosed, FileText, Loader2, TriangleAlert } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Logo } from "@/components/layout/logo";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getPublicOrganizationSecureRoom } from "@/lib/organizations";
import { cn } from "@/lib/utils";
import type { PublicOrganizationSecureRoom } from "@/types/organizations";

export default function OrganizationRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const decodedToken = decodeURIComponent(token);
  const [room, setRoom] = useState<PublicOrganizationSecureRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPublicOrganizationSecureRoom(decodedToken)
      .then((result) => {
        if (!active) return;
        setRoom(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load this room.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [decodedToken]);

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="min-h-dvh bg-background">
        <section className="border-b border-border bg-card/50">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
            <Card className="shadow-elevated">
              <CardContent className="min-h-[480px] p-6 sm:p-8">
                {loading ? (
                  <div className="flex h-[360px] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    Loading room...
                  </div>
                ) : error ? (
                  <div className="flex h-[360px] flex-col items-center justify-center gap-5 text-center">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                      <TriangleAlert className="size-6" />
                    </span>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Link href="/" className={cn(buttonVariants())}>
                      Return home
                    </Link>
                  </div>
                ) : room ? (
                  <div className="space-y-8">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                          <DoorClosed className="size-3.5 text-primary" />
                          Shared securely by {room.organization_name}
                        </span>
                        <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight">
                          {room.title}
                        </h1>
                        {room.description && (
                          <p className="mt-3 max-w-2xl text-muted-foreground">
                            {room.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <p className="text-xs text-muted-foreground">
                        Only the files {room.organization_name} chose to share
                        appear here. Nothing else from their account is visible.
                      </p>
                      {room.items.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                          No shared items are available in this room.
                        </p>
                      ) : (
                        room.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <FileText className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {item.document_title || item.file_name || "Shared item"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.file_name || item.document_type || "Document"}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
            Shared securely through CertaNest.
          </p>
        </div>
      </footer>
    </>
  );
}

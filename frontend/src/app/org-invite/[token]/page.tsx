"use client";

import { use, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, UsersRound } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  ORGANIZATION_TYPE_LABELS,
  ROLE_LABELS,
  acceptOrganizationInvite,
  getOrganizationInvite,
} from "@/lib/organizations";
import { cn } from "@/lib/utils";
import type { OrganizationInviteDetail } from "@/types/organizations";

export default function OrganizationInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const decodedToken = decodeURIComponent(token);
  const [invite, setInvite] = useState<OrganizationInviteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptedOrgId, setAcceptedOrgId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrganizationInvite(decodedToken)
      .then((result) => {
        if (!active) return;
        setInvite(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load this organization invite.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [decodedToken]);

  async function acceptInvite() {
    setAccepting(true);
    setError(null);
    try {
      const membership = await acceptOrganizationInvite(decodedToken);
      setAcceptedOrgId(membership.organization);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to accept this organization invite.",
      );
    } finally {
      setAccepting(false);
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
                <UsersRound className="size-3.5 text-primary" />
                Organization invite
              </span>
              <h1 className="mt-5 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Join a DueNest team workspace
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Accept the invite with the account that matches the invited
                email address.
              </p>
            </div>

            <Card className="shadow-elevated">
              <CardContent className="flex min-h-[420px] flex-col justify-center p-6 text-center sm:p-8">
                {loading ? (
                  <StateBlock
                    icon={<Loader2 className="size-6 animate-spin" />}
                    title="Checking invite"
                    description="Loading the organization invitation."
                  />
                ) : acceptedOrgId ? (
                  <StateBlock
                    icon={<CheckCircle2 className="size-7" />}
                    tone="success"
                    title="Invite accepted"
                    description="Your account now has access to the organization workspace."
                    action={
                      <Link
                        href={`/dashboard/organizations/${acceptedOrgId}`}
                        className={cn(buttonVariants({ size: "lg" }), "h-12 px-6")}
                      >
                        Open workspace
                        <ArrowRight className="size-4" />
                      </Link>
                    }
                  />
                ) : error ? (
                  <StateBlock
                    icon={<ShieldCheck className="size-6" />}
                    tone="danger"
                    title="Invite unavailable"
                    description={error}
                    action={
                      <Link href="/login" className={cn(buttonVariants())}>
                        Sign in
                      </Link>
                    }
                  />
                ) : invite ? (
                  <div className="flex flex-col items-center gap-5">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UsersRound className="size-7" />
                    </span>
                    <div>
                      <h2 className="font-heading text-2xl font-semibold">
                        {invite.organization_name}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {ORGANIZATION_TYPE_LABELS[invite.organization_type]}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Badge variant="outline">{ROLE_LABELS[invite.role]}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {invite.status}
                      </Badge>
                    </div>
                    <Button
                      size="lg"
                      className="h-12 px-6"
                      onClick={acceptInvite}
                      disabled={accepting || invite.status !== "pending"}
                    >
                      {accepting && <Loader2 className="size-4 animate-spin" />}
                      Accept invite
                    </Button>
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
            Organization access is controlled by active membership.
          </p>
        </div>
      </footer>
    </>
  );
}

function StateBlock({
  icon,
  title,
  description,
  action,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-xl",
          tone === "success" && "bg-brand-success/10 text-brand-success",
          tone === "danger" && "bg-destructive/10 text-destructive",
          tone === "default" && "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </span>
      <div>
        <h2 className="font-heading text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

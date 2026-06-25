"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  accountStatusLabel,
  checkIntegrationHealth,
  disconnectIntegration,
  getIntegrationProviders,
  providerStatusLabel,
  startGoogleIntegration,
} from "@/lib/integrations";
import type { IntegrationProvider } from "@/types/integrations";

const PRIVACY_POINTS = [
  "CertaNest will only access what you choose to connect.",
  "Imports will be review-before-save — nothing is added to your vault automatically.",
  "No automatic deletion and no write-back to your connected account.",
  "Gmail is privacy-sensitive and is requested only if you explicitly choose it.",
];

// Sensible non-sensitive defaults. Gmail is never pre-selected.
const DEFAULT_GROUPS = ["drive", "calendar"];

export default function IntegrationsSettingsPage() {
  const [providers, setProviders] = useState<IntegrationProvider[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_GROUPS));

  async function load() {
    setError(null);
    try {
      const data = await getIntegrationProviders();
      setProviders(data.providers);
      setUnavailable(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setUnavailable(true);
      else setError("Couldn't load integrations. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // All setState happens inside async callbacks (never synchronously in the
  // effect body) so we don't trigger cascading renders. The banner is read from
  // the post-OAuth redirect query (?status=connected|error).
  useEffect(() => {
    let active = true;
    getIntegrationProviders()
      .then((data) => {
        if (!active) return;
        setProviders(data.providers);
        setUnavailable(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else setError("Couldn't load integrations. Please try again.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        const status = new URLSearchParams(window.location.search).get("status");
        if (status === "connected")
          setBanner({ kind: "success", text: "Account connected." });
        else if (status === "error")
          setBanner({
            kind: "error",
            text: "We couldn't complete that connection. Please try again.",
          });
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleGroup(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function connectGoogle() {
    setBusy("connect");
    setError(null);
    try {
      const groups = selected.size ? [...selected] : DEFAULT_GROUPS;
      const { authorization_url } = await startGoogleIntegration(groups);
      window.location.assign(authorization_url);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't start the connection. Please try again.",
      );
      setBusy(null);
    }
  }

  async function disconnect(id: number) {
    setBusy(`disc-${id}`);
    setError(null);
    try {
      await disconnectIntegration(id);
      await load();
    } catch {
      setError("Couldn't disconnect. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function check(id: number) {
    setBusy(`check-${id}`);
    setError(null);
    try {
      await checkIntegrationHealth(id);
      await load();
    } catch {
      setError("Couldn't check the connection. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        description="Connect an external account to import documents and deadlines later. Connecting is import-only — CertaNest never edits or deletes anything in your connected account."
      />

      {banner && (
        <Card>
          <CardContent
            className={`flex items-center gap-3 text-sm ${
              banner.kind === "success" ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {banner.kind === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <TriangleAlert className="size-4 shrink-0" />
            )}
            {banner.text}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" /> {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : unavailable ? (
        <Card>
          <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
            <Plug className="mt-0.5 size-4 shrink-0" />
            Integrations aren&apos;t available on your account yet. They&apos;re
            coming soon.
          </CardContent>
        </Card>
      ) : (
        providers?.map((provider) => (
          <Card key={provider.key}>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Plug className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {provider.description}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {providerStatusLabel(provider.status)}
                </Badge>
              </div>

              {!provider.configured ? (
                <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  This integration isn&apos;t configured on the server yet. An
                  administrator needs to add the provider credentials before it can
                  be connected.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Choose what to connect
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {provider.scope_groups.map((group) => {
                        const isOn = selected.has(group.key);
                        return (
                          <Button
                            key={group.key}
                            type="button"
                            size="sm"
                            variant={isOn ? "default" : "outline"}
                            onClick={() => toggleGroup(group.key)}
                            title={group.description}
                          >
                            {isOn ? (
                              <CheckCircle2 className="mr-1 size-3.5" />
                            ) : null}
                            {group.label}
                            {group.privacy_sensitive ? (
                              <Lock className="ml-1 size-3" />
                            ) : null}
                          </Button>
                        );
                      })}
                    </div>
                    {selected.has("gmail") && (
                      <p className="text-xs text-amber-600">
                        Gmail is privacy-sensitive. Only attachments you choose would
                        ever be imported (in a future release).
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={connectGoogle}
                    disabled={busy === "connect"}
                  >
                    {busy === "connect" ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Connect {provider.name}
                  </Button>
                </>
              )}

              {provider.accounts.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    {provider.accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">
                            {account.provider_email || account.display_name || "Connected account"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {account.scope_groups.join(", ") || "Account"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={account.needs_attention ? "destructive" : "secondary"}
                          >
                            {accountStatusLabel(account.status)}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => check(account.id)}
                            disabled={busy === `check-${account.id}`}
                            aria-label="Check connection"
                          >
                            <RefreshCw className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => disconnect(account.id)}
                            disabled={busy === `disc-${account.id}`}
                          >
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {provider.key === "google" && (
                    <Link
                      href="/dashboard/settings/integrations/google-drive"
                      className="inline-block"
                    >
                      <Button type="button" variant="outline" size="sm">
                        Import from Google Drive
                      </Button>
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Google Calendar import shortcut — shown once a Google account is
          connected. The dedicated page enforces calendar scope + flags. */}
      {providers?.some((p) => p.key === "google" && p.accounts.length > 0) && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Import from Google Calendar</p>
                <p className="text-sm text-muted-foreground">
                  Turn selected calendar events into CertaNest deadlines. Read-only —
                  nothing in Google Calendar is changed.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/settings/integrations/google-calendar"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
            >
              Open
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" /> Your privacy
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {PRIVACY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

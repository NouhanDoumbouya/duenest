"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getFounderUserSummary, getFounderUsers } from "@/lib/founder";
import type {
  FounderUserListItem,
  FounderUserSummary,
} from "@/types/founder";

const nf = new Intl.NumberFormat();

export default function FounderUsersPage() {
  const [users, setUsers] = useState<FounderUserListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<FounderUserSummary | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderUsers({ search })
      .then((page) => {
        if (!active) return;
        const nextSelectedId = selectedId ?? page.results[0]?.id ?? null;
        setUsers(page.results);
        setSelectedId(nextSelectedId);
        if (!nextSelectedId) setSummary(null);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setUsers([]);
        setError(err instanceof ApiError ? err.message : "Unable to load users.");
      });
    return () => {
      active = false;
    };
  }, [search, selectedId]);

  const selected = useMemo(
    () => (users ?? []).find((user) => user.id === selectedId) ?? null,
    [selectedId, users],
  );

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    getFounderUserSummary(selectedId)
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((err) => {
        if (!active) return;
        setSummary(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load user summary.",
        );
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const counts = summary?.counts;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          User support metadata
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Privacy-safe account metadata for support and product operations.
          This view intentionally excludes private document contents and
          sensitive vault data.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="size-5 text-primary" />
              Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="relative block">
              <span className="sr-only">Search users</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Search by email"
              />
            </label>

            {users === null ? (
              <div className="h-[320px] animate-pulse rounded-lg bg-muted" />
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : (
              <ul className="space-y-2">
                {users.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(user.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        selectedId === user.id
                          ? "border-primary/30 bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {user.email}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Joined {new Date(user.date_joined).toLocaleDateString()}
                          </p>
                        </div>
                        {user.is_staff && <Badge variant="outline">staff</Badge>}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>{nf.format(user.document_count)} docs</span>
                        <span>{nf.format(user.file_count)} files</span>
                        <span>{nf.format(user.feedback_count)} feedback</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Safe summary</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select a user to view safe account metadata.
              </p>
            ) : !summary ? (
              <div className="h-[360px] animate-pulse rounded-lg bg-muted" />
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-semibold">
                      {summary.user.email}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      User #{summary.user.id} · plan {summary.plan}
                    </p>
                  </div>
                  <Badge
                    variant={
                      summary.onboarding.has_completed_document_onboarding
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {summary.onboarding.has_completed_document_onboarding
                      ? "onboarded"
                      : "setup pending"}
                  </Badge>
                </div>

                {counts && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {Object.entries(counts).map(([key, value]) => (
                      <div
                        key={key}
                        className="rounded-lg border border-border p-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          {key.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                          {nf.format(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
                      <ShieldCheck className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Privacy boundary</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {summary.privacy_note}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium">Safe recent activity</p>
                  {summary.safe_recent_activity_summary.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No product events recorded for this account yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {summary.safe_recent_activity_summary.map((item) => (
                        <li
                          key={item.event_type}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                        >
                          <span>{item.label}</span>
                          <span className="font-medium">
                            {nf.format(item.count)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

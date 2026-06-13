"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFounderErrors, updateFounderError } from "@/lib/founder";
import type { AppErrorLog } from "@/types/founder";

function severityVariant(severity: string) {
  return severity === "critical" || severity === "error"
    ? "destructive"
    : "outline";
}

export default function FounderErrorsPage() {
  const [items, setItems] = useState<AppErrorLog[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [resolvedFilter, setResolvedFilter] = useState<boolean | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderErrors({ resolved: resolvedFilter })
      .then((page) => {
        if (!active) return;
        setItems(page.results);
        setSelectedId((current) => current ?? page.results[0]?.id ?? null);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(err instanceof ApiError ? err.message : "Unable to load errors.");
      });
    return () => {
      active = false;
    };
  }, [resolvedFilter]);

  const selected = useMemo(
    () => (items ?? []).find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function markResolved() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateFounderError(selected.id, { resolved: true });
      setItems((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to update error state.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Error monitoring
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lightweight frontend/backend error intake for private beta triage.
          Stack traces are not exposed in production responses.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={resolvedFilter === "" ? "default" : "outline"}
            onClick={() => setResolvedFilter("")}
          >
            All
          </Button>
          <Button
            variant={resolvedFilter === false ? "default" : "outline"}
            onClick={() => setResolvedFilter(false)}
          >
            Unresolved
          </Button>
          <Button
            variant={resolvedFilter === true ? "default" : "outline"}
            onClick={() => setResolvedFilter(true)}
          >
            Resolved
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="size-5 text-primary" />
              Error list
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items === null ? (
              <div className="h-[320px] animate-pulse rounded-lg bg-muted" />
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No errors match this filter.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        selectedId === item.id
                          ? "border-primary/30 bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{item.error_type}</p>
                        <Badge variant={severityVariant(item.severity)}>
                          {item.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.message}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{item.source}</Badge>
                        <Badge variant={item.resolved ? "secondary" : "outline"}>
                          {item.resolved ? "resolved" : "open"}
                        </Badge>
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
            <CardTitle className="text-lg">Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select an error to inspect it.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={severityVariant(selected.severity)}>
                      {selected.severity}
                    </Badge>
                    <Badge variant="outline">{selected.source}</Badge>
                    <Badge variant={selected.resolved ? "secondary" : "outline"}>
                      {selected.resolved ? "resolved" : "open"}
                    </Badge>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold">
                    {selected.error_type}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {selected.message}
                  </p>
                </div>

                <div className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Path</p>
                    <p className="mt-1 break-all">{selected.path || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="mt-1">{selected.status_code ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">User</p>
                    <p className="mt-1">{selected.user_email || "anonymous"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="mt-1">
                      {new Date(selected.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {!selected.resolved && (
                  <Button onClick={markResolved} disabled={saving}>
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Mark resolved
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

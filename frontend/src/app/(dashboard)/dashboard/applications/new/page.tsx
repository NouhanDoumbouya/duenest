"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  APPLICATION_TYPE_LABELS,
  createApplication,
} from "@/lib/applications";
import type {
  ApplicationPriority,
  ApplicationStatus,
  ApplicationType,
  CreateApplicationRequest,
} from "@/types/applications";

const APPLICATION_TYPES = Object.keys(
  APPLICATION_TYPE_LABELS,
) as ApplicationType[];

const PRIORITIES: { value: ApplicationPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "planning",
  "checklist_created",
  "documents_missing",
  "ready_to_submit",
  "submitted",
  "under_review",
  "interview",
  "accepted",
  "rejected",
  "withdrawn",
  "renewal_needed",
]);

/** Read the create-form defaults from the "Track this application" CTA query. */
function initialForm(): CreateApplicationRequest {
  const base: CreateApplicationRequest = {
    title: "",
    application_type: "other",
    priority: "medium",
    deadline_date: "",
    organization_name: "",
    source_url: "",
    notes: "",
  };
  if (typeof window === "undefined") return base;

  const params = new URLSearchParams(window.location.search);
  const bundle = params.get("bundle");
  const title = params.get("title");
  const deadline = params.get("deadline");
  const status = params.get("status");

  if (bundle && Number.isFinite(Number(bundle))) {
    base.linked_bundle = Number(bundle);
  }
  if (title) base.title = title;
  if (deadline) base.deadline_date = deadline;
  if (status && APPLICATION_STATUSES.has(status as ApplicationStatus)) {
    base.status = status as ApplicationStatus;
  }
  return base;
}

export default function NewApplicationPage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateApplicationRequest>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CreateApplicationRequest>(
    key: K,
    value: CreateApplicationRequest[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Give your application a title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createApplication({
        ...form,
        title: form.title.trim(),
        deadline_date: form.deadline_date || null,
      });
      router.push(`/dashboard/applications/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create the application.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link
          href="/dashboard/applications"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to applications
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New application</CardTitle>
          <CardDescription>
            Track a scholarship, visa, job, university application, or renewal.
            You can link a pack and update its status next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Chevening Scholarship 2026"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="application_type">Type</Label>
                <select
                  id="application_type"
                  value={form.application_type}
                  onChange={(e) =>
                    update(
                      "application_type",
                      e.target.value as ApplicationType,
                    )
                  }
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {APPLICATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {APPLICATION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  value={form.priority}
                  onChange={(e) =>
                    update("priority", e.target.value as ApplicationPriority)
                  }
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="deadline_date">Deadline</Label>
                <Input
                  id="deadline_date"
                  type="date"
                  value={form.deadline_date ?? ""}
                  onChange={(e) => update("deadline_date", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="organization_name">Organization</Label>
                <Input
                  id="organization_name"
                  value={form.organization_name ?? ""}
                  onChange={(e) => update("organization_name", e.target.value)}
                  placeholder="e.g. UK Home Office"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="source_url">Source link</Label>
              <Input
                id="source_url"
                type="url"
                value={form.source_url ?? ""}
                onChange={(e) => update("source_url", e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes ?? ""}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="What is this application for?"
                rows={3}
              />
            </div>

            {error && (
              <p
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/dashboard/applications"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                disabled={submitting || !form.title.trim()}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Creating…" : "Create application"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

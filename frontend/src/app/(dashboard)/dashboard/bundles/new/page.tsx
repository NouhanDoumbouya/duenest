"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, FileText, Loader2 } from "lucide-react";

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
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import {
  BUNDLE_TYPE_LABELS,
  createBundle,
  getPackTemplates,
} from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type {
  BundleType,
  CreateBundleRequest,
  PackTemplate,
} from "@/types/renewal-workspace";

const BUNDLE_TYPES: BundleType[] = [
  "renewal",
  "application",
  "travel",
  "emergency",
  "scholarship",
  "insurance",
  "custom",
];

/** Preselect a bundle type from `?type=` (e.g. from the onboarding goal card). */
function initialBundleType(): BundleType {
  if (typeof window === "undefined") return "renewal";
  const type = new URLSearchParams(window.location.search).get("type");
  return (BUNDLE_TYPES as string[]).includes(type ?? "")
    ? (type as BundleType)
    : "renewal";
}

export default function NewBundlePage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateBundleRequest>(() => ({
    title: "",
    bundle_type: initialBundleType(),
    target_date: "",
    authority_or_provider: "",
    description: "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional "Start from a template" picker. Hidden entirely unless the feature
  // is available, so there is never a dead control. Selecting a template seeds
  // an editable starter checklist server-side; "blank" seeds nothing.
  const templatesEnabled = useFeature("application_pack_templates");
  const [templates, setTemplates] = useState<PackTemplate[] | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (!templatesEnabled) return;
    let active = true;
    getPackTemplates()
      .then((res) => active && setTemplates(res.templates))
      .catch(() => active && setTemplates([]));
    return () => {
      active = false;
    };
  }, [templatesEnabled]);

  function update<K extends keyof CreateBundleRequest>(
    key: K,
    value: CreateBundleRequest[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function chooseTemplate(template: PackTemplate) {
    setSelectedTemplate(template.key);
    setForm((prev) => ({
      ...prev,
      template: template.key,
      bundle_type: template.bundle_type,
    }));
  }

  function chooseBlank() {
    setSelectedTemplate(null);
    setForm((prev) => ({ ...prev, template: undefined }));
  }

  const activeTemplate =
    templates?.find((t) => t.key === selectedTemplate) ?? null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Give your bundle a title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createBundle({
        ...form,
        title: form.title.trim(),
        target_date: form.target_date || null,
      });
      router.push(`/dashboard/bundles/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the bundle.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link
          href="/dashboard/bundles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to bundles
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New bundle</CardTitle>
          <CardDescription>
            Create a bundle for a renewal, application, or trip. You can add the
            documents and requirements it needs next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templatesEnabled && templates && templates.length > 0 && (
            <div className="mb-6 space-y-3">
              <div>
                <p className="text-sm font-medium">Start from a template</p>
                <p className="text-xs text-muted-foreground">
                  A starter checklist you can fully customize. Requirements vary
                  — always verify with the official source.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={chooseBlank}
                  aria-pressed={selectedTemplate === null}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    selectedTemplate === null
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-muted/50",
                  )}
                >
                  <span>Blank pack</span>
                  {selectedTemplate === null && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </button>
                {templates
                  .filter((t) => t.key !== "custom")
                  .map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => chooseTemplate(template)}
                      aria-pressed={selectedTemplate === template.key}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        selectedTemplate === template.key
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted/50",
                      )}
                    >
                      <span className="min-w-0 truncate">{template.label}</span>
                      {selectedTemplate === template.key && (
                        <Check className="size-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
              </div>
              {activeTemplate && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="size-3.5" />
                    {activeTemplate.items.length} suggested items — edit any of
                    them after creating
                  </p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {activeTemplate.items.map((item) => (
                      <li
                        key={item.title}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate">{item.title}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium",
                            item.is_required
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.is_required ? "Required" : "Optional"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[0.7rem] text-muted-foreground">
                    {activeTemplate.disclaimer}
                  </p>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. UK visa renewal 2026"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bundle_type">Type</Label>
                <select
                  id="bundle_type"
                  value={form.bundle_type}
                  onChange={(e) =>
                    update("bundle_type", e.target.value as BundleType)
                  }
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {BUNDLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {BUNDLE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="target_date">Target date</Label>
                <Input
                  id="target_date"
                  type="date"
                  value={form.target_date ?? ""}
                  onChange={(e) => update("target_date", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="authority">Authority or provider</Label>
              <Input
                id="authority"
                value={form.authority_or_provider ?? ""}
                onChange={(e) =>
                  update("authority_or_provider", e.target.value)
                }
                placeholder="e.g. UK Home Office"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description ?? ""}
                onChange={(e) => update("description", e.target.value)}
                placeholder="What is this bundle for?"
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

            <div className="flex justify-end gap-2">
              <Link
                href="/dashboard/bundles"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Create bundle
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

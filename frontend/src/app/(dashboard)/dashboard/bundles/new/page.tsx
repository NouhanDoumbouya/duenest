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
import { BUNDLE_TYPE_LABELS, createBundle } from "@/lib/renewal-workspace";
import type { BundleType, CreateBundleRequest } from "@/types/renewal-workspace";

const BUNDLE_TYPES: BundleType[] = [
  "renewal",
  "application",
  "travel",
  "emergency",
  "scholarship",
  "insurance",
  "custom",
];

export default function NewBundlePage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateBundleRequest>({
    title: "",
    bundle_type: "renewal",
    target_date: "",
    authority_or_provider: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CreateBundleRequest>(
    key: K,
    value: CreateBundleRequest[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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

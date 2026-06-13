"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { submitFeedback } from "@/lib/founder";
import type { FeedbackCategory } from "@/types/founder";

const categories: { value: FeedbackCategory; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature request" },
  { value: "confusion", label: "Confusion" },
  { value: "complaint", label: "Complaint" },
  { value: "praise", label: "Praise" },
  { value: "security_concern", label: "Security concern" },
  { value: "pricing", label: "Pricing" },
  { value: "other", label: "Other" },
];

export default function FeedbackPage() {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [relatedFeature, setRelatedFeature] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await submitFeedback({
        category,
        title,
        message,
        related_feature: relatedFeature,
        related_path: typeof window === "undefined" ? "" : window.location.pathname,
      });
      setSubmitted(true);
      setTitle("");
      setMessage("");
      setRelatedFeature("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to submit feedback.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Product feedback
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Share feedback
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Report a bug, flag confusion, suggest an improvement, or raise a
          security concern. You do not need to include private document details.
        </p>
      </div>

      {submitted && (
        <div className="flex items-start gap-3 rounded-lg border border-brand-success/30 bg-brand-success/10 p-4 text-brand-success">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Feedback submitted</p>
            <p className="mt-1 text-sm text-foreground/80">
              Thanks. It is now available in the founder feedback board.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Private beta feedback</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Please avoid access codes, passwords, raw OCR text, or private
                  document contents. Counts and context are usually enough.
                </p>
              </div>
            </div>

            <label className="space-y-1">
              <Label>Category</Label>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as FeedbackCategory)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <Label>Related feature</Label>
              <Input
                value={relatedFeature}
                onChange={(event) => setRelatedFeature(event.target.value)}
                placeholder="Documents, sharing, onboarding, reminders..."
              />
            </label>

            <label className="space-y-1">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short summary"
                required
              />
            </label>

            <label className="space-y-1">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened, what you expected, or what would make this easier?"
                rows={7}
                required
              />
            </label>

            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageSquare className="size-4" />
              )}
              Submit feedback
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

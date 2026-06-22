"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GrowthPageHeader } from "@/components/founder/growth/growth-ui";
import { ApiError } from "@/lib/api";
import {
  buildUtmLink,
  UTM_MEDIUM_SUGGESTIONS,
  UTM_SOURCE_SUGGESTIONS,
} from "@/lib/founder-growth";

export default function UtmBuilderPage() {
  const [form, setForm] = useState({
    base_url: "https://certanest.com/",
    source: "",
    medium: "",
    campaign: "",
    content: "",
    term: "",
  });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const { url } = await buildUtmLink(form);
      setResult(url);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Could not build the link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-6">
      <GrowthPageHeader
        title="UTM Link Builder"
        subtitle="Build a trackable link so every signup is attributed to a channel."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Build a link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="base_url" label="Base URL" value={form.base_url} onChange={set("base_url")} placeholder="https://certanest.com/" />
            <Field id="source" label="Source" value={form.source} onChange={set("source")} placeholder="facebook" list="utm-sources" required />
            <datalist id="utm-sources">
              {UTM_SOURCE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
            <Field id="medium" label="Medium" value={form.medium} onChange={set("medium")} placeholder="community" list="utm-mediums" required />
            <datalist id="utm-mediums">
              {UTM_MEDIUM_SUGGESTIONS.map((m) => <option key={m} value={m} />)}
            </datalist>
            <Field id="campaign" label="Campaign" value={form.campaign} onChange={set("campaign")} placeholder="international_students_july" required />
            <Field id="content" label="Content (optional)" value={form.content} onChange={set("content")} placeholder="visa_deadline_post" />
            <Field id="term" label="Term (optional)" value={form.term} onChange={set("term")} placeholder="" />

            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}

            <Button onClick={generate} disabled={busy} className="w-full">
              {busy ? "Generating…" : "Generate link"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generated link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result ? (
              <>
                <p className="break-all rounded-lg border border-border bg-muted/40 p-3 text-sm" aria-live="polite">
                  {result}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={copy} className="flex-1">
                    {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <a
                    href={result}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted/50"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" /> Open
                  </a>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Fill in source, medium, and campaign, then generate a trackable link. Existing
                query params on the base URL are preserved.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  list,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  list?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input id={id} value={value} onChange={onChange} placeholder={placeholder} list={list} />
    </div>
  );
}

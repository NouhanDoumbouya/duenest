"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  FileText,
  Info,
  Loader2,
  PenLine,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { draftDocument, type DraftResult, type DraftTone } from "@/lib/ai";
import { getDocuments } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

const TONES: { value: DraftTone; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
  { value: "concise", label: "Concise" },
];

export default function DraftPage() {
  const [instructions, setInstructions] = useState("");
  const [tone, setTone] = useState<DraftTone>("formal");
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    getDocuments()
      .then((res) => active && setDocs(res.results))
      .catch(() => {
        /* the picker is optional; ignore load failures */
      });
    return () => {
      active = false;
    };
  }, []);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = instructions.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await draftDocument({
        instructions: trimmed,
        documentIds: [...selected],
        tone,
      });
      setResult(res);
      setSubject(res.subject);
      setBody(res.body);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotEnabled(true);
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (notEnabled) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="Assistant"
          title="Draft a letter or email"
          description="Turn a few notes into a clear draft."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Not enabled yet"
              description="The drafting assistant isn't switched on for your account yet."
            />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Assistant"
        title="Draft a letter or email"
        description="Describe what you need and the assistant writes a draft — optionally using details from your own documents. You review and edit before sending; nothing is saved or sent automatically."
      />

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="instructions">What should it say?</Label>
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="e.g. Write a letter to request a replacement for my expired passport."
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    aria-pressed={tone === t.value}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      tone === t.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {docs.length > 0 && (
              <div className="space-y-2">
                <Label>
                  Use details from documents{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {docs.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggle(doc.id)}
                        className="size-4 accent-primary"
                      />
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{doc.title}</span>
                    </label>
                  ))}
                </div>
                {selected.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selected.size} document{selected.size === 1 ? "" : "s"}{" "}
                    selected
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={!instructions.trim() || loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" /> Drafting…
                  </>
                ) : (
                  <>
                    <PenLine /> Write draft
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {result && !loading && (
        <DraftResultCard
          result={result}
          subject={subject}
          body={body}
          onSubjectChange={setSubject}
          onBodyChange={setBody}
        />
      )}
    </PageContainer>
  );
}

function DraftResultCard({
  result,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
}: {
  result: DraftResult;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!result.available) {
    if (result.reason === "not_configured") {
      return (
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Assistant isn't set up yet"
              description="The drafting assistant isn't fully configured on this account yet. Please try again later."
            />
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="flex items-start gap-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            The assistant couldn&apos;t write that just now. Please try again.
          </span>
        </CardContent>
      </Card>
    );
  }

  async function copyAll() {
    const text = subject ? `Subject: ${subject}\n\n${body}` : body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; the text is still editable on screen */
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Your draft
          </p>
          <Button type="button" variant="outline" size="sm" onClick={copyAll}>
            {copied ? (
              <>
                <Check /> Copied
              </>
            ) : (
              <>
                <Copy /> Copy
              </>
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="draft-subject">Subject</Label>
          <Input
            id="draft-subject"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="draft-body">Body</Label>
          <Textarea
            id="draft-body"
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={14}
          />
        </div>

        {result.used_document_ids.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Used details from {result.used_document_ids.length} of your
            document
            {result.used_document_ids.length === 1 ? "" : "s"}.
          </p>
        )}

        <p className="flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          This is an editable draft — review it carefully and replace any{" "}
          <code className="rounded bg-muted px-1">[placeholders]</code> before
          sending. Nothing here is saved or sent for you.
        </p>

        <div>
          <Link
            href="/dashboard/ask"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Ask your documents instead
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

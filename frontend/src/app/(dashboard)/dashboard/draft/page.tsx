"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Copy,
  FileDown,
  FilePen,
  FileText,
  Info,
  Loader2,
  PenLine,
  Save,
  Sparkles,
  Trash2,
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
import { getDocuments, formatDate } from "@/lib/documents";
import { uploadInboxFileWithProgress } from "@/lib/document-files";
import { textToPdfBlob } from "@/lib/pdf/text-to-pdf";
import {
  deleteGeneratedDocument,
  listGeneratedDocuments,
  saveGeneratedDocument,
  updateGeneratedDocument,
} from "@/lib/generated-documents";
import { getBundles } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";
import type { GeneratedDocument } from "@/types/generated-documents";
import type { Bundle } from "@/types/renewal-workspace";

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
  const [savedDrafts, setSavedDrafts] = useState<GeneratedDocument[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [packs, setPacks] = useState<Bundle[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportToVault() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await textToPdfBlob(subject, body);
      const name = `${(subject.trim() || "Draft").slice(0, 80)}.pdf`;
      const file = new File([blob], name, { type: "application/pdf" });
      await uploadInboxFileWithProgress(file);
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Could not save to your Vault. Try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  // Load the user's saved drafts (the drafts library) and packs for this page.
  useEffect(() => {
    let active = true;
    listGeneratedDocuments()
      .then((data) => active && setSavedDrafts(data))
      .catch(() => active && setSavedDrafts([]));
    getBundles()
      .then((page) => active && setPacks(page.results))
      .catch(() => {
        /* the pack picker is optional */
      });
    return () => {
      active = false;
    };
  }, []);

  async function attachToPack(id: number, packId: number | null) {
    try {
      const updated = await updateGeneratedDocument(id, { related_pack: packId });
      setSavedDrafts((prev) =>
        (prev ?? []).map((d) => (d.id === id ? updated : d)),
      );
    } catch {
      /* keep the prior value on failure */
    }
  }

  async function saveDraft() {
    setSavingDraft(true);
    try {
      const saved = await saveGeneratedDocument({
        title: subject.trim() || "Untitled draft",
        document_type: "other",
        output_text: subject ? `${subject}\n\n${body}` : body,
        input_payload: { instructions, tone, document_ids: [...selected] },
        status: "saved",
      });
      setSavedDrafts((prev) => [saved, ...(prev ?? [])]);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch {
      /* the editor stays intact; the user can retry */
    } finally {
      setSavingDraft(false);
    }
  }

  async function removeDraft(id: number) {
    try {
      await deleteGeneratedDocument(id);
      setSavedDrafts((prev) => (prev ?? []).filter((d) => d.id !== id));
    } catch {
      /* keep it in the list on failure */
    }
  }

  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);
  const [copiedDraft, setCopiedDraft] = useState<number | null>(null);

  async function copyDraftText(draft: GeneratedDocument) {
    try {
      await navigator.clipboard.writeText(draft.output_text);
      setCopiedDraft(draft.id);
      setTimeout(() => setCopiedDraft(null), 1500);
    } catch {
      /* clipboard unavailable; the text is visible to copy manually */
    }
  }

  // Re-open a saved draft in the editor (loads its content for edit / re-export).
  function openDraftInEditor(draft: GeneratedDocument) {
    setSubject(draft.title);
    setBody(draft.output_text);
    setResult({
      available: true,
      reason: "ok",
      subject: draft.title,
      body: draft.output_text,
      used_document_ids: [],
    });
    setExpandedDraft(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Seed from a `?goal=` handoff (e.g. from the Pack Copilot). Read from the
  // URL directly to avoid needing a useSearchParams Suspense boundary.
  useEffect(() => {
    const goal = new URLSearchParams(window.location.search)
      .get("goal")
      ?.trim();
    if (goal) {
      // Intentional one-time seed from a browser-only source after mount; a
      // useState initializer would run during SSR (no window) and cause a
      // hydration mismatch, so the effect is the correct place for it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstructions(`Write a cover letter for my ${goal} application.`);
    }
  }, []);

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
          onSaveDraft={saveDraft}
          saving={savingDraft}
          saved={draftSaved}
          onExportToVault={exportToVault}
          exporting={exporting}
          exported={exported}
          exportError={exportError}
        />
      )}

      {savedDrafts && savedDrafts.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Saved drafts
            </p>
            <ul className="divide-y divide-border">
              {savedDrafts.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDraft((id) => (id === d.id ? null : d.id))
                      }
                      aria-expanded={expandedDraft === d.id}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ChevronRight
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          expandedDraft === d.id && "rotate-90",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {d.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(d.updated_at)}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {packs.length > 0 && (
                        <select
                          value={d.related_pack ?? ""}
                          onChange={(e) =>
                            attachToPack(
                              d.id,
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                          aria-label={`Attach ${d.title} to a pack`}
                          className="max-w-40 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <option value="">Not in a pack</option>
                          {packs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${d.title}`}
                        onClick={() => removeDraft(d.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedDraft === d.id && (
                    <div className="mt-2 space-y-2 pl-6">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openDraftInEditor(d)}
                        >
                          <FilePen /> Open in editor
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyDraftText(d)}
                        >
                          {copiedDraft === d.id ? <Check /> : <Copy />}
                          {copiedDraft === d.id ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-sans text-xs whitespace-pre-wrap text-foreground">
                        {d.output_text}
                      </pre>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
  onSaveDraft,
  saving,
  saved,
  onExportToVault,
  exporting,
  exported,
  exportError,
}: {
  result: DraftResult;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSaveDraft: () => void;
  saving: boolean;
  saved: boolean;
  onExportToVault: () => void;
  exporting: boolean;
  exported: boolean;
  exportError: string | null;
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
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportToVault}
              disabled={exporting || (!subject.trim() && !body.trim())}
            >
              {exporting ? (
                <Loader2 className="animate-spin" />
              ) : exported ? (
                <Check />
              ) : (
                <FileDown />
              )}
              {exported ? "Saved" : "Save as document"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSaveDraft}
              disabled={saving || (!subject.trim() && !body.trim())}
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : saved ? (
                <Check />
              ) : (
                <Save />
              )}
              {saved ? "Saved" : "Save draft"}
            </Button>
          </div>
        </div>

        {exportError && (
          <p className="text-sm text-destructive" role="alert">
            {exportError}
          </p>
        )}

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
          sending. Nothing is sent for you; saving keeps a private copy in your
          drafts.
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

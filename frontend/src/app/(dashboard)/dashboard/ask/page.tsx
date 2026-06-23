"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Info,
  Loader2,
  PauseCircle,
  Quote,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { AiActivationCard } from "@/components/ai/ai-activation-card";
import { AiIndexStatusCard } from "@/components/ai/ai-index-status-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  askDocuments,
  retrievalModeLabel,
  type AnswerSource,
  type AskResult,
} from "@/lib/ai";

const EXAMPLES = [
  "When does my passport expire?",
  "What's my car insurance policy number?",
  "Which of my documents are expiring soon?",
  "Where is my birth certificate stored?",
];

/** One exchange in the thread: the question, plus its answer (or error) once it
 *  resolves. `result === null && error === null` means still in flight. */
interface Turn {
  id: number;
  question: string;
  result: AskResult | null;
  error: string | null;
}

export default function AskDocumentsPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [notEnabled, setNotEnabled] = useState(false);
  const [scope, setScope] = useState<{ id: number; title: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  // A contextual "Ask AI about this" deep-link (e.g. from a document) can
  // pre-seed the question via ?q= and scope answers to one document via
  // ?document=<id>&scope=<title>. We pre-fill and focus, but never auto-submit —
  // the user stays in control of what they actually ask.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seeded = params.get("q");
    if (seeded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuestion(seeded);
      textareaRef.current?.focus();
    }
    const docId = Number(params.get("document"));
    const docTitle = params.get("scope");
    if (Number.isFinite(docId) && docId > 0 && docTitle) {
      setScope({ id: docId, title: docTitle });
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    const id = nextId.current++;
    setTurns((prev) => [
      ...prev,
      { id, question: trimmed, result: null, error: null },
    ]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await askDocuments(trimmed, scope?.id);
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, result: res } : t)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotEnabled(true);
      } else {
        const message =
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.";
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, error: message } : t)),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void ask(question);
    }
  }

  if (notEnabled) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="Assistant"
          title="Ask your documents"
          description="Get answers from your own documents."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Not enabled yet"
              description="The AI assistant isn't switched on for your account yet. Once it's enabled you'll be able to ask questions across your documents here."
            />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] min-h-[24rem] w-full max-w-3xl flex-col md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-9rem)]">
      {/* Slim header — a conversation with your documents, not a titled page. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-brand-teal-bright">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold">
            Ask your documents
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Plain-language answers, with links to the documents they came from
          </p>
        </div>
      </div>

      <div className="shrink-0 [&:empty]:hidden [&>*]:mt-3">
        <AiActivationCard />
      </div>

      {/* Scrolling conversation */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {turns.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Ask anything about your documents
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Get answers drawn from your own records — every answer links to
                the documents it used.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void ask(example)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => (
            <Fragment key={turn.id}>
              {/* User question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                  {turn.question}
                </div>
              </div>

              {/* Assistant answer / pending / error */}
              {turn.result ? (
                <AnswerBubble result={turn.result} />
              ) : turn.error ? (
                <AssistantRow>
                  <div className="inline-flex items-start gap-2 rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{turn.error}</span>
                  </div>
                </AssistantRow>
              ) : (
                <AssistantRow>
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Searching your
                    documents…
                  </div>
                </AssistantRow>
              )}
            </Fragment>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Docked composer */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 space-y-2 border-t border-border pt-3"
      >
        {scope && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate text-muted-foreground">
                  Answering based on{" "}
                  <span className="font-medium text-foreground">
                    {scope.title}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => setScope(null)}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
                Ask all documents
              </button>
            </div>
            {/* Let the user prepare this document for content Q&A inline. */}
            <AiIndexStatusCard documentId={scope.id} compact />
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask about your documents…"
            aria-label="Your question"
            disabled={loading}
            className="min-h-9 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Ask"
            disabled={!question.trim() || loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
        <p className="px-1 text-[0.7rem] text-muted-foreground">
          Answers are AI-generated from your own documents and may be imperfect —
          double-check anything important.
        </p>
      </form>
    </div>
  );
}

/** Assistant message row: avatar + content, matching the Chat surface. */
function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-brand-teal-bright">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

function AnswerBubble({ result }: { result: AskResult }) {
  // Unavailable answers read as a calm assistant message, never a raw error.
  if (!result.available) {
    if (result.reason === "no_documents") {
      return (
        <AssistantRow>
          <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm">
            <p>Add a few documents to your vault, then ask again — answers come
              from your own records.</p>
            <Link
              href="/dashboard/documents"
              className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
            >
              <FileText className="size-4" /> Go to documents
            </Link>
          </div>
        </AssistantRow>
      );
    }
    if (result.reason === "budget") {
      return (
        <AssistantRow>
          <div className="inline-flex items-start gap-2 rounded-2xl rounded-tl-sm border border-brand-amber/30 bg-brand-amber/10 px-4 py-2.5 text-sm text-foreground">
            <PauseCircle className="mt-0.5 size-4 shrink-0 text-brand-amber" />
            <span>
              AI is paused for today to protect usage limits. Please try again
              later.
            </span>
          </div>
        </AssistantRow>
      );
    }
    if (result.reason === "consent_required") {
      return (
        <AssistantRow>
          <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm">
            <p>Turn on AI in settings to use document intelligence.</p>
            <Link
              href="/dashboard/settings/ai"
              className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
            >
              <Sparkles className="size-4" /> AI settings
            </Link>
          </div>
        </AssistantRow>
      );
    }
    const message =
      result.reason === "not_configured"
        ? "AI is not available right now."
        : "The assistant couldn't answer that just now. Please try again.";
    return (
      <AssistantRow>
        <div className="inline-block rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          {message}
        </div>
      </AssistantRow>
    );
  }

  const modeLabel = retrievalModeLabel(result.retrieval_mode);
  const sources = result.sources ?? [];

  return (
    <AssistantRow>
      <div className="inline-block max-w-full rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        {result.answer || "No answer was returned."}
      </div>

      {/* Subtle, non-technical note on where the answer came from. */}
      {result.answered && modeLabel && result.retrieval_mode !== "no_context" && (
        <p className="flex items-center gap-1.5 px-1 text-[0.7rem] text-muted-foreground">
          <BookOpen className="size-3" aria-hidden />
          {modeLabel}
        </p>
      )}

      {!result.answered && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          I couldn&apos;t find enough information in
          {result.document_count === 1 ? " the" : " your"} selected document
          {result.document_count === 1 ? "" : "s"} — try rephrasing, or index the
          document this should come from.
        </p>
      )}

      {/* Source excerpts that support the answer (chunk-level RAG). */}
      {sources.length > 0 ? (
        <SourcesSection sources={sources} />
      ) : (
        result.citations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Based on
            </span>
            {result.citations.map((c) => (
              <Link
                key={c.document_id}
                href={`/dashboard/documents/${c.document_id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
              >
                <FileText className="size-3.5" />
                {c.title}
              </Link>
            ))}
          </div>
        )
      )}

      {result.document_count > 0 && (
        <p className="px-1 text-[0.7rem] text-muted-foreground">
          Searched {result.document_count} document
          {result.document_count === 1 ? "" : "s"}.
        </p>
      )}
    </AssistantRow>
  );
}

/** Collapsible "Sources" list of supporting excerpts. Lightweight; the first two
 *  show immediately, the rest expand on demand so long answers stay calm. */
function SourcesSection({ sources }: { sources: AnswerSource[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sources : sources.slice(0, 2);
  const hiddenCount = sources.length - visible.length;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Quote className="size-3.5" aria-hidden />
        {sources.length === 1 ? "Source" : "Sources"}
      </p>
      <div className="space-y-2">
        {visible.map((s, i) => (
          <div
            key={`${s.document_id}-${s.chunk_index}-${i}`}
            className="rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/dashboard/documents/${s.document_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
              >
                <FileText className="size-3.5 text-primary" />
                {s.document_title}
              </Link>
              <span className="text-[0.7rem] text-muted-foreground">
                {s.page_number != null
                  ? `Page ${s.page_number}`
                  : `Section ${s.chunk_index + 1}`}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {s.excerpt}
            </p>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ChevronDown className="size-3.5" />
          Show {hiddenCount} more source{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

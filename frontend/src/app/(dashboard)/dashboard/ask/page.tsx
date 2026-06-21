"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  FileText,
  Info,
  Loader2,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { AiActivationCard } from "@/components/ai/ai-activation-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { askDocuments, type AskResult } from "@/lib/ai";

const EXAMPLES = [
  "When does my passport expire?",
  "What's my car insurance policy number?",
  "Which of my documents are expiring soon?",
  "Where is my birth certificate stored?",
];

export default function AskDocumentsPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [asked, setAsked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A contextual "Ask AI about this" deep-link (e.g. from a document) can
  // pre-seed the question via ?q=. We pre-fill and focus, but never auto-submit
  // — the user stays in control of what they actually ask.
  useEffect(() => {
    const seeded = new URLSearchParams(window.location.search).get("q");
    if (seeded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuestion(seeded);
      textareaRef.current?.focus();
    }
  }, []);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAsked(trimmed);
    try {
      const res = await askDocuments(trimmed);
      setResult(res);
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter submits, matching common chat affordances.
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
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Assistant"
        title="Ask your documents"
        description="Ask a question in plain language and get an answer drawn from your own documents — with links to the ones it used."
      />

      <AiActivationCard />

      <Card>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="e.g. When does my passport expire?"
              aria-label="Your question"
              disabled={loading}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Press{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.7rem]">
                  ⌘/Ctrl
                </kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.7rem]">
                  Enter
                </kbd>{" "}
                to ask
              </p>
              <Button type="submit" disabled={!question.trim() || loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" /> Asking…
                  </>
                ) : (
                  <>
                    <Search /> Ask
                  </>
                )}
              </Button>
            </div>
          </form>

          {!result && !loading && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setQuestion(example);
                      void ask(example);
                    }}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching your documents…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {result && !loading && (
        <AnswerCard result={result} question={asked} />
      )}

      {result?.available && (
        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Answers are AI-generated from your own documents. Double-check anything
          important before relying on it.
        </p>
      )}
    </PageContainer>
  );
}

function AnswerCard({
  result,
  question,
}: {
  result: AskResult;
  question: string;
}) {
  if (!result.available) {
    if (result.reason === "no_documents") {
      return (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="No documents to search yet"
              description="Add a few documents to your vault and then ask again — answers come from your own records."
              action={
                <Link
                  href="/dashboard/documents"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Go to documents
                </Link>
              }
            />
          </CardContent>
        </Card>
      );
    }
    if (result.reason === "not_configured") {
      return (
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Assistant isn't set up yet"
              description="The AI assistant isn't fully configured on this account yet. Please try again later."
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
            The assistant couldn&apos;t answer that just now. Please try again.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">You asked</p>
          <p className="text-sm font-medium text-foreground">{question}</p>
        </div>

        {result.answer ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No answer was returned.
          </p>
        )}

        {!result.answered && (
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            This wasn&apos;t found in your documents — try rephrasing, or add the
            document it should come from.
          </p>
        )}

        {result.citations.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">
              Based on
            </p>
            <div className="flex flex-wrap gap-2">
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
          </div>
        )}

        {result.document_count > 0 && (
          <p className="text-xs text-muted-foreground">
            Searched {result.document_count} document
            {result.document_count === 1 ? "" : "s"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

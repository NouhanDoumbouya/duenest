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
  Loader2,
  PenLine,
  Send,
  Sparkles,
  Target,
  TriangleAlert,
  Zap,
} from "lucide-react";

import { AiActivationCard } from "@/components/ai/ai-activation-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  chatWithAssistant,
  type ChatAction,
  type ChatTurn,
} from "@/lib/ai";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
}

const SUGGESTIONS = [
  "What's expiring soon?",
  "Help me renew my passport",
  "What do I need for a visa application?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const history: ChatTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await chatWithAssistant(trimmed, history);
      if (!res.available) {
        setError(
          res.reason === "not_configured"
            ? "The assistant isn't set up yet. Please try again later."
            : "The assistant couldn't respond just now. Please try again.",
        );
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.reply, actions: res.actions },
        ]);
      }
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
    void send(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send(input);
    }
  }

  if (notEnabled) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="Assistant"
          title="Chat"
          description="Ask anything about your documents and life admin."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Not enabled yet"
              description="The assistant chat isn't switched on for your account yet."
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
        title="Chat"
        description="Ask about your documents and what to do next. The assistant answers from your own records and offers quick actions you confirm."
      />

      <AiActivationCard />

      <div className="space-y-3">
        {messages.length === 0 && !loading && (
          <Card>
            <CardContent className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-primary" /> Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="w-full max-w-[90%] space-y-2">
                <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
                {m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.actions.map((a, j) => (
                      <ActionButton key={j} action={a} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin" /> Thinking…
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-1 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="sticky bottom-4 space-y-2">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-card">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask about your documents…"
            aria-label="Message"
            disabled={loading}
            className="min-h-9 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Answers come from your own documents and may be imperfect — confirm
          anything important. The assistant never sends or shares on its own.
        </p>
      </form>
    </PageContainer>
  );
}

function ActionButton({ action }: { action: ChatAction }) {
  const cls = buttonVariants({ variant: "outline", size: "sm" });
  if (action.type === "draft") {
    const href = action.goal
      ? `/dashboard/draft?goal=${encodeURIComponent(action.goal)}`
      : "/dashboard/draft";
    return (
      <Link href={href} className={cls}>
        <PenLine /> {action.label}
      </Link>
    );
  }
  if (action.type === "pack") {
    return (
      <Link href="/dashboard/pack-copilot" className={cls}>
        <Target /> {action.label}
      </Link>
    );
  }
  if (action.type === "briefing") {
    return (
      <Link href="/dashboard/briefing" className={cls}>
        <Zap /> {action.label}
      </Link>
    );
  }
  if (action.type === "open_document" && action.document_id) {
    return (
      <Link href={`/dashboard/documents/${action.document_id}`} className={cls}>
        <FileText /> {action.label}
      </Link>
    );
  }
  return null;
}

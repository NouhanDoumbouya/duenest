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
import { useFeatures } from "@/components/features/feature-flags-provider";
import { ASSISTANT_TOOLS } from "@/lib/navigation";
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

  // Specialized tools to offer as "modes" on the hub — only the enabled ones.
  const features = useFeatures();
  const tools = ASSISTANT_TOOLS.filter((tool) => {
    if (!tool.featureKey) return true;
    const state = features[tool.featureKey];
    return state ? state.enabled : true;
  });

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
          title="Assistant"
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
    <div className="mx-auto flex h-[calc(100dvh-11rem)] min-h-[24rem] w-full max-w-3xl flex-col md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-9rem)]">
      {/* Slim chat header — a conversation, not a titled page. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-brand-teal">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold">DueNest Assistant</p>
          <p className="truncate text-xs text-muted-foreground">
            Answers from your own documents · you confirm every action
          </p>
        </div>
      </div>

      <div className="shrink-0 [&:empty]:hidden [&>*]:mt-3">
        <AiActivationCard />
      </div>

      {/* Scrolling message history */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Ask about your documents
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Get answers from your own records and quick actions you confirm.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
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

            {/* Specialized modes — chat is the default, but you can jump
                straight to a focused tool. */}
            {tools.length > 0 && (
              <div className="w-full max-w-md pt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Or open a tool
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {tools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        className="group flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand-teal/40 hover:bg-muted/50"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          {Icon && <Icon className="size-4" />}
                        </span>
                        <span className="text-sm font-medium">{tool.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-brand-teal">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="inline-block rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm whitespace-pre-wrap">
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
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-brand-teal">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
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
          </>
        )}

        <div ref={endRef} />
      </div>

      {/* Docked composer */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 space-y-2 border-t border-border pt-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
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
        <p className="px-1 text-[0.7rem] text-muted-foreground">
          Answers come from your own documents and may be imperfect — confirm
          anything important. The assistant never sends or shares on its own.
        </p>
      </form>
    </div>
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

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  FileText,
  FolderPlus,
  Info,
  Loader2,
  PenLine,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ApiError } from "@/lib/api";
import {
  analyzePack,
  createPackBundle,
  type PackRequirement,
  type PackResult,
  type PackStatus,
} from "@/lib/ai";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "UK Skilled Worker visa",
  "Chevening scholarship",
  "US F-1 student visa",
  "Mortgage application",
];

const STATUS_META: Record<
  PackStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  have: {
    label: "Have",
    icon: CheckCircle2,
    className: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
  },
  missing: {
    label: "Missing",
    icon: CircleDashed,
    className: "text-amber-700 bg-amber-500/10 border-amber-500/20",
  },
  unclear: {
    label: "Unclear",
    icon: CircleHelp,
    className: "text-muted-foreground bg-muted border-border",
  },
};

export default function PackCopilotPage() {
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  async function analyze(g: string) {
    const trimmed = g.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyzePack(trimmed, deadline || undefined);
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
    void analyze(goal);
  }

  if (notEnabled) {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Assistant"
          title="Application Pack Copilot"
          description="See exactly what you need for any application."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Not enabled yet"
              description="The Application Pack Copilot isn't switched on for your account yet."
            />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Assistant"
        title="Application Pack Copilot"
        description="Name what you're applying for. The copilot lists what's typically needed, checks it against your vault, and flags anything that expires before your deadline."
      />

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="goal">What are you applying for?</Label>
                <Input
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. UK Skilled Worker visa"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">
                  Deadline{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!goal.trim() || loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" /> Analyzing…
                  </>
                ) : (
                  <>
                    <Target /> Analyze
                  </>
                )}
              </Button>
            </div>
          </form>

          {!result && !loading && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Try a goal
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setGoal(example);
                      void analyze(example);
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
            Building your checklist and checking it against your vault…
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

      {result && !loading && <ResultView result={result} />}
    </PageContainer>
  );
}

function ResultView({ result }: { result: PackResult }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function createPack() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createPackBundle({
        goal: result.goal,
        deadline: result.deadline,
        requirements: result.requirements.map((r) => ({
          name: r.name,
          description: r.description,
          document_ids: r.documents.map((d) => d.document_id),
        })),
      });
      router.push(`/dashboard/bundles/${res.bundle_id}`);
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? err.message
          : "Couldn't create the pack. Please try again.",
      );
      setCreating(false);
    }
  }

  if (!result.available) {
    if (result.reason === "not_configured") {
      return (
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Copilot isn't set up yet"
              description="The Application Pack Copilot isn't fully configured on this account yet. Please try again later."
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
            The copilot couldn&apos;t analyze that just now. Please try again.
          </span>
        </CardContent>
      </Card>
    );
  }

  const total = result.requirements.length;
  const draftHref = `/dashboard/draft?goal=${encodeURIComponent(result.goal)}`;

  return (
    <>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {result.goal}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-emerald-700">
                  {result.have_count}
                </span>{" "}
                of {total} ready
                {result.missing_count > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {result.missing_count} still needed
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={createPack}
                disabled={creating || total === 0}
              >
                {creating ? (
                  <>
                    <Loader2 className="animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <FolderPlus /> Create this pack
                  </>
                )}
              </Button>
              <Link
                href={draftHref}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <PenLine /> Draft a cover letter
              </Link>
            </div>
          </div>

          {total > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.round((result.have_count / total) * 100)}%`,
                }}
              />
            </div>
          )}

          {result.summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {result.summary}
            </p>
          )}

          {createError && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {createError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {result.requirements.map((req, i) => (
          <RequirementRow key={`${req.name}-${i}`} req={req} />
        ))}
      </div>

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        This checklist is AI-generated guidance, not an official list —
        requirements vary by country, institution, and case. Always confirm with
        the official source before you apply.
      </p>
    </>
  );
}

function RequirementRow({ req }: { req: PackRequirement }) {
  const meta = STATUS_META[req.status];
  const StatusIcon = meta.icon;
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{req.name}</p>
            {req.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {req.description}
              </p>
            )}
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              meta.className,
            )}
          >
            <StatusIcon className="size-3.5" />
            {meta.label}
          </span>
        </div>

        {req.documents.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {req.documents.map((doc) => (
              <Link
                key={doc.document_id}
                href={`/dashboard/documents/${doc.document_id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted",
                  doc.expires_before_deadline
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                    : "border-border bg-card text-foreground",
                )}
              >
                {doc.expires_before_deadline ? (
                  <TriangleAlert className="size-3.5" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                {doc.title}
                {doc.expires_before_deadline && doc.expiry_date && (
                  <span className="text-amber-700/80">
                    · expires {doc.expiry_date}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

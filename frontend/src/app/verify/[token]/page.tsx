"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { ApiError } from "@/lib/api";
import { getShareVerification } from "@/lib/quick-share";
import { cn } from "@/lib/utils";
import type { ShareVerification } from "@/types/quick-share";

export default function VerifySharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [result, setResult] = useState<ShareVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getShareVerification(token)
      .then((data) => {
        if (active) {
          setResult(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "We couldn't check this link.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <LogoMark size="sm" />
        <span className="font-heading text-lg font-semibold">CertaNest</span>
      </div>

      <div className="w-full max-w-lg">
        {loading ? (
          <Card>
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Checking this share…</span>
            </div>
          </Card>
        ) : error ? (
          <StatusCard
            tone="neutral"
            icon={<ShieldQuestion className="size-6" />}
            title="We couldn't verify this link"
            message={error}
          />
        ) : result ? (
          <ResultView result={result} />
        ) : null}

        <p className="mt-6 px-2 text-center text-xs leading-relaxed text-muted-foreground">
          CertaNest verification confirms a file is an unaltered copy shared from a
          CertaNest account. It does <strong>not</strong> certify the document&apos;s
          real-world authenticity (for example, whether an ID is genuine).
        </p>
      </div>
    </main>
  );
}

function ResultView({ result }: { result: ShareVerification }) {
  if (result.verified) {
    return (
      <StatusCard
        tone="success"
        icon={<BadgeCheck className="size-6" />}
        title="Authentic & unaltered"
        message={
          result.sender
            ? `CertaNest confirms these files were shared by ${result.sender}${
                result.issued_at
                  ? ` on ${new Date(result.issued_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}`
                  : ""
              } and have not been altered since.`
            : "CertaNest confirms these files have not been altered since they were shared."
        }
        files={result.files}
      />
    );
  }

  if (result.status === "not_verified") {
    return (
      <StatusCard
        tone="neutral"
        icon={<ShieldQuestion className="size-6" />}
        title="Not a verified share"
        message="This share wasn't created as a verified share, so there's nothing to check. The files may still be perfectly genuine — they just weren't signed."
      />
    );
  }

  // status === "altered" (signature ok but a file no longer matches) or other.
  return (
    <StatusCard
      tone="danger"
      icon={<ShieldAlert className="size-6" />}
      title="This share has changed"
      message="One or more files no longer match what CertaNest originally signed. Treat the contents with caution and ask the sender to re-share."
      files={result.files}
    />
  );
}

const TONES = {
  success: "border-brand-success/30 bg-brand-success/10 text-brand-success",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

function StatusCard({
  tone,
  icon,
  title,
  message,
  files,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  message: string;
  files?: ShareVerification["files"];
}) {
  return (
    <Card>
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full border",
            TONES[tone],
          )}
        >
          {icon}
        </span>
        <h1 className="mt-4 font-heading text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>

      {files && files.length > 0 && (
        <ul className="mt-5 space-y-2">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.sha256}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                  {file.sha256}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                  file.matches
                    ? "bg-brand-success/10 text-brand-success"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {file.matches ? "Match" : "Changed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-floating">
      {children}
    </div>
  );
}

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { confirmEmailVerification, sendEmailVerification } from "@/lib/auth";

type Status = "verifying" | "success" | "error" | "no-token";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>(token ? "verifying" : "no-token");
  const [message, setMessage] = useState<string>("");
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  // Guard against double-verify in React Strict Mode (effect runs twice in dev).
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    confirmEmailVerification(token)
      .then((res) => {
        setStatus("success");
        setMessage(res.detail);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "We couldn't verify your email. The link may have expired.",
        );
      });
  }, [token]);

  async function handleResend() {
    setResendNote(null);
    setResending(true);
    try {
      const res = await sendEmailVerification();
      setResendNote(
        res.verified
          ? "Your email is already verified."
          : "A new verification email is on its way.",
      );
    } catch (err) {
      // 401 → not signed in; surface a helpful message instead of a raw error.
      setResendNote(
        err instanceof ApiError && err.status === 401
          ? "Please sign in first, then resend the verification email from your account."
          : err instanceof ApiError
            ? err.message
            : "Couldn't resend right now. Please try again.",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-2 shadow-elevated">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-2xl">
          {status === "success" ? "Email verified" : "Verify your email"}
        </CardTitle>
        <CardDescription className="text-[0.95rem]">
          {status === "verifying" && "Confirming your email…"}
          {status === "success" && "Thanks — your account is confirmed."}
          {status === "error" && "We couldn't confirm this link."}
          {status === "no-token" && "Confirm your CertaNest email address."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {status === "verifying" && (
          <p
            className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" />
            Verifying…
          </p>
        )}

        {status === "success" && (
          <>
            <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
              <CheckCircle2 className="size-4 shrink-0" />
              {message || "Your email is verified."}
            </p>
            <Link
              href="/dashboard"
              className={buttonVariants({ className: "h-11 w-full text-sm" })}
            >
              Continue to CertaNest
            </Link>
          </>
        )}

        {(status === "error" || status === "no-token") && (
          <>
            {status === "error" && (
              <p
                className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                <XCircle className="size-4 shrink-0" />
                {message}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              If you&apos;re signed in, you can send a fresh verification link.
            </p>
            <Button
              className="h-11 w-full text-sm"
              variant="outline"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
            {resendNote && (
              <p className="text-center text-sm text-muted-foreground" role="status">
                {resendNote}
              </p>
            )}
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense>
        <VerifyEmailInner />
      </Suspense>
    </AuthShell>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { requestPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      // The backend never reveals whether the email exists, so we always show
      // the same neutral confirmation regardless of the result.
      setSent(true);
    } catch (err) {
      // A failure here is a network/server issue, not "no such account".
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md p-2 shadow-elevated">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription className="text-[0.95rem]">
            {sent
              ? "Check your inbox for the next step"
              : "Enter your email and we'll send a reset link"}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {sent ? (
            <>
              <p className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
                <MailCheck className="mt-0.5 size-4 shrink-0" />
                <span>
                  If an account exists for <strong>{email}</strong>, a password
                  reset link is on its way. The link expires for your security,
                  so use it soon.
                </span>
              </p>
              <Link
                href="/login"
                className={buttonVariants({ className: "h-11 w-full text-sm" })}
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <p
                  className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="h-11 w-full text-sm"
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

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
import { confirmPasswordReset } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";
  const linkValid = Boolean(uid && token);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset({ uid, token, new_password: password });
      setDone(true);
    } catch (err) {
      // ApiError surfaces either the invalid/expired-link message or the
      // backend's password-strength validation message.
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't reset your password. Please try again.",
      );
      setSubmitting(false);
    }
  }

  if (!linkValid) {
    return (
      <Card className="w-full max-w-md p-2 shadow-elevated">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl">Link not valid</CardTitle>
          <CardDescription className="text-[0.95rem]">
            This reset link is missing information or has expired.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Link
            href="/forgot-password"
            className={buttonVariants({ className: "h-11 w-full text-sm" })}
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-md p-2 shadow-elevated">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl">Password updated</CardTitle>
          <CardDescription className="text-[0.95rem]">
            You can now sign in with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
            <CheckCircle2 className="size-4 shrink-0" />
            Your password has been reset.
          </p>
          <Button
            className="h-11 w-full text-sm"
            onClick={() => router.push("/login")}
          >
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-2 shadow-elevated">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription className="text-[0.95rem]">
          Pick a strong password you don&apos;t use elsewhere
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
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
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>

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

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { login } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { postAuthDestination } from "@/lib/readiness";
import { ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  // Preserve a post-login destination (e.g. a SafeSend claim page). Only
  // same-origin relative paths are honoured.
  const nextParam = searchParams.get("next");
  // A safe, same-origin deep link / returnTo. When present it always wins, so
  // invite / SafeSend / emergency / preserved destinations are never hijacked.
  const explicitNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ username, password });
      // A preserved deep link always wins; otherwise genuinely new users start
      // in the readiness flow. Onboarding state is only fetched when there's no
      // explicit destination, and any failure falls back to the dashboard.
      let onboarding = null;
      if (!explicitNext) {
        try {
          onboarding = await getOnboardingState();
        } catch {
          onboarding = null;
        }
      }
      // `replace` so the login page isn't left in the back-history stack.
      router.replace(postAuthDestination({ explicitNext, onboarding }));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to sign in. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-2 shadow-elevated">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription className="text-[0.95rem]">
          Sign in to your CertaNest workspace
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {justRegistered && (
          <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
            <CheckCircle2 className="size-4 shrink-0" />
            Account created. Please sign in to continue.
          </p>
        )}

        <GoogleButton />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">
            or continue with email
          </span>
          <Separator className="flex-1" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="h-11"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourname"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          New to CertaNest?{" "}
          <Link
            href="/waitlist"
            className="font-medium text-primary hover:underline"
          >
            Join the waitlist
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TicketCheck } from "lucide-react";

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
import { register } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { captureUtmToSession, readStoredAttribution } from "@/lib/attribution";
import { getPrivateBetaStatus } from "@/lib/private-beta";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? "");
  const [privateBetaEnabled, setPrivateBetaEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    captureUtmToSession();
    let active = true;
    getPrivateBetaStatus()
      .then((result) => {
        if (active) setPrivateBetaEnabled(result.private_beta_enabled);
      })
      .catch(() => {
        if (active) setPrivateBetaEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await register({
        username,
        email,
        password,
        invite_code: inviteCode.trim() || undefined,
        ...readStoredAttribution(),
      });
      // The current backend register endpoint does not return tokens, so we
      // send the user to /login with a friendly confirmation message.
      router.push("/login?registered=1");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create your account. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md p-2 shadow-elevated">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription className="text-[0.95rem]">
            {privateBetaEnabled
              ? "Use your private beta invite to start organizing your documents and deadlines."
              : "Start organizing your documents and deadlines — free to begin."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {privateBetaEnabled && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TicketCheck className="size-4" />
              </span>
              <div>
                <p className="font-medium">Private beta access</p>
                <p className="mt-1 text-muted-foreground">
                  DueNest is currently invite-only so early access stays
                  focused and supportable.
                </p>
              </div>
            </div>
          )}

          <GoogleButton />

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">
              or sign up with email
            </span>
            <Separator className="flex-1" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <p className="text-xs text-muted-foreground">
                Use 8+ characters with a mix of letters and numbers.
              </p>
            </div>

            {(privateBetaEnabled || inviteCode) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite_code">Invite code</Label>
                <Input
                  id="invite_code"
                  name="invite_code"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  required={privateBetaEnabled}
                  className="h-11 uppercase"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="DN-ABCDE-12345"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the code from your DueNest private beta invite.
                </p>
              </div>
            )}

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
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

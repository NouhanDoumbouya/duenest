"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { googleLogin } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { postAuthDestination } from "@/lib/readiness";
import {
  type GoogleCredentialResponse,
  getGoogleClientId,
  loadGoogleIdentity,
} from "@/lib/google-identity";

/** Official Google "G" mark (used only for the graceful fallback button). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/** Only same-origin relative paths are honoured as a post-login destination. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

type Phase = "unavailable" | "loading" | "ready" | "authenticating";

/**
 * "Continue with Google" — real Google Identity Services sign-in.
 *
 * Flow: GIS renders Google's button → the user authenticates → GIS hands us a
 * Google **ID token** → we send it to the backend `/auth/google/` (which verifies
 * it server-side) via `googleLogin` → tokens are set by the backend → we redirect
 * with the same safe logic as password login.
 *
 * The ID token is held only in memory for the single backend call — never stored,
 * never logged. Without `NEXT_PUBLIC_GOOGLE_CLIENT_ID` the button shows a graceful
 * unavailable state (we never fake a Google login).
 */
export function GoogleButton({ inviteCode }: { inviteCode?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const clientId = getGoogleClientId();
  const [phase, setPhase] = useState<Phase>(clientId ? "loading" : "unavailable");
  const [error, setError] = useState<string | null>(null);

  // The GIS callback is registered once; route through a ref so it always sees
  // the latest invite code / query params / router without re-initializing GIS.
  // The ref is refreshed in an effect (never during render).
  const handlerRef = useRef<(resp: GoogleCredentialResponse) => void>(() => {});
  useEffect(() => {
    handlerRef.current = async (response: GoogleCredentialResponse) => {
      const credential = response?.credential;
      if (!credential) {
        setError("Google sign-in was cancelled or did not complete.");
        return;
      }
      setError(null);
      setPhase("authenticating");
      try {
        // The ID token is sent ONLY to our backend, which verifies it. We never
        // store or log it.
        await googleLogin({
          id_token: credential,
          invite_code: inviteCode?.trim() || undefined,
        });
        const explicitNext = safeNext(searchParams.get("next"));
        let onboarding = null;
        if (!explicitNext) {
          try {
            onboarding = await getOnboardingState();
          } catch {
            onboarding = null;
          }
        }
        router.replace(postAuthDestination({ explicitNext, onboarding }));
      } catch (err) {
        setPhase("ready");
        setError(
          err instanceof ApiError
            ? err.message
            : "We couldn't complete Google sign-in. Please try again.",
        );
      }
    };
  });

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadGoogleIdentity()
      .then((idClient) => {
        if (!active || !containerRef.current) return;
        idClient.initialize({
          client_id: clientId,
          callback: (resp) => handlerRef.current(resp),
          cancel_on_tap_outside: true,
        });
        idClient.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: Math.min(Math.max(containerRef.current.clientWidth || 320, 220), 400),
        });
        setPhase("ready");
      })
      .catch(() => {
        if (active) {
          setPhase("unavailable");
          setError("Google sign-in is unavailable right now. Use email instead.");
        }
      });
    return () => {
      active = false;
    };
    // clientId is build-time-stable; intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Graceful unavailable state — config missing or GIS failed to load.
  if (phase === "unavailable") {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-center gap-2 text-sm font-medium"
          disabled
          title="Google sign-in is unavailable"
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        {error && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <TriangleAlert className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {phase === "authenticating" ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-center gap-2 text-sm font-medium"
          disabled
        >
          <Loader2 className="size-4 animate-spin" />
          Signing in with Google…
        </Button>
      ) : (
        <>
          {phase === "loading" && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-center gap-2 text-sm font-medium"
              disabled
            >
              <Loader2 className="size-4 animate-spin" />
              Loading Google…
            </Button>
          )}
          {/* GIS renders Google's official button into this container. */}
          <div
            ref={containerRef}
            className={`flex min-h-11 w-full justify-center ${
              phase === "ready" ? "" : "hidden"
            }`}
            data-testid="google-button-container"
          />
        </>
      )}

      {error && phase !== "authenticating" && (
        <p
          className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

import { Button } from "@/components/ui/button";

/** Official Google "G" mark. */
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

/**
 * Google sign-in entry point.
 *
 * Honest by design: until the Google Identity flow is wired to
 * POST /api/v1/auth/google/, this stays disabled and clearly labelled — we
 * never fake a Google login.
 */
export function GoogleButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full justify-center gap-2 text-sm font-medium"
      disabled
      title="Google sign-in coming soon"
    >
      <GoogleIcon />
      Continue with Google
      <span className="text-xs font-normal text-muted-foreground">
        (coming soon)
      </span>
    </Button>
  );
}

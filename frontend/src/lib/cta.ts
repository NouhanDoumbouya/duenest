// Single source of truth for the marketing primary call-to-action.
//
// Private-beta vs public-launch is a BUILD-TIME flag (NEXT_PUBLIC_*), so the
// hero, navbar, footer, and final CTA all resolve to the same destination:
// the waitlist during the private beta, registration at launch. Centralizing
// it here keeps the navbar/footer from drifting out of sync with the page.
export const PRIVATE_BETA =
  (process.env.NEXT_PUBLIC_PRIVATE_BETA_ENABLED ?? "true").toLowerCase() !==
  "false";

export const PRIMARY_CTA = {
  href: PRIVATE_BETA ? "/waitlist" : "/register",
  label: "Start organizing",
} as const;

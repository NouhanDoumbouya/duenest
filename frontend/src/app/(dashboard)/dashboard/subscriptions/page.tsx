import { redirect } from "next/navigation";

// Subscription Radar is deprecated. CertaNest is a life-document readiness
// platform, not a subscription/finance tracker. The feature is removed from
// navigation and the API is gated off by default; recurring renewals now live
// in Deadlines & Renewals. Keep any old bookmarks working by sending them there.
export default function SubscriptionsPage() {
  redirect("/dashboard/reminders");
}

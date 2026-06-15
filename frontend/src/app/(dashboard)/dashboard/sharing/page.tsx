import { redirect } from "next/navigation";

// The Sharing area is now flat in the sidebar (Quick Share, Shared with me,
// Secure rooms, Emergency access), so this overview is no longer linked. Keep
// the URL working by sending it to the primary sharing entry point.
export default function SharingPage() {
  redirect("/dashboard/quick-share");
}

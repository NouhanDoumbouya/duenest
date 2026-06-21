// Surfaces the Transactional emails admin inside the main founder console.
//
// The page itself lives at `(dashboard)/dashboard/founder/emails` (the older,
// effectively orphaned founder area). Re-exporting its default here makes the
// same working tool reachable from the canonical `/founder` console nav with
// consistent chrome, without duplicating ~400 lines or breaking the legacy
// route.
export { default } from "@/app/(dashboard)/dashboard/founder/emails/page";

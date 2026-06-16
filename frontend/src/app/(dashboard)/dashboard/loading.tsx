import { Skeleton } from "@/components/ui/skeleton";

// Instant skeleton shown while the dashboard route's JS loads/hydrates, so the
// user sees structure immediately instead of a blank screen (these pages fetch
// their data client-side after hydration).
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-1" aria-label="Loading dashboard" role="status">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-6 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

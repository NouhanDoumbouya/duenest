import { Skeleton } from "@/components/ui/skeleton";

// Skeleton for the vault "control center" while its client bundle + data load.
export default function VaultLoading() {
  return (
    <div className="space-y-6 p-1" aria-label="Loading your vault" role="status">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

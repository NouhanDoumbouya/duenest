import { Skeleton } from "@/components/ui/skeleton";

// Skeleton for the documents list route while its client bundle + data load.
export default function DocumentsLoading() {
  return (
    <div className="space-y-6 p-1" aria-label="Loading documents" role="status">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

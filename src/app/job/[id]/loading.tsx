import { Skeleton } from "@/components/ui/skeleton";
import { TimelineSkeleton } from "@/components/timeline";

// Next.js App Router route-level loading UI for /job/[id] — automatically
// wraps page.tsx's render in a Suspense boundary while the async Server
// Component's params/domain reads resolve. Row-shaped Skeleton
// placeholders, no spinner (UI-SPEC loading/timeline backstop). Mirrors the
// pattern established for the board route (src/app/loading.tsx, 02-03).
export default function Loading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <TimelineSkeleton />
    </main>
  );
}

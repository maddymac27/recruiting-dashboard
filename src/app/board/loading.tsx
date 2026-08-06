import { PipelineBoardSkeleton } from "@/components/pipeline-board";
import { Skeleton } from "@/components/ui/skeleton";

// Next.js App Router route-level loading UI — automatically wraps
// page.tsx's render in a Suspense boundary. Card-shaped Skeleton
// placeholders, no spinner (UI-SPEC loading/board backstop).
//
// Moved verbatim from src/app/loading.tsx alongside the D5-04 board route
// move (RESEARCH Pitfall 6) — the Today view gets its own new loading.tsx
// at src/app/loading.tsx.
export default function Loading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-lg" />
        ))}
      </div>
      <PipelineBoardSkeleton />
    </main>
  );
}

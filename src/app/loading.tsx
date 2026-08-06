import { Skeleton } from "@/components/ui/skeleton";

// Next.js App Router route-level loading UI — automatically wraps
// page.tsx's render in a Suspense boundary. Row-shaped Skeleton
// placeholders, no spinner (UI-SPEC E1 Today-view loading backstop),
// matching the Phase 2/3 board/queue loading pattern
// (src/app/board/loading.tsx, src/app/review/loading.tsx).
export default function Loading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <Skeleton className="h-8 w-24" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}

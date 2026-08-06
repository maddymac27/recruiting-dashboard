import { Skeleton } from "@/components/ui/skeleton";

// Next.js App Router route-level loading UI — automatically wraps
// page.tsx's render in a Suspense boundary. Row-shaped Skeleton
// placeholders, no spinner (UI-SPEC loading/queue backstop), consistent
// with Phase 2's board/timeline loading pattern (src/app/loading.tsx).
export default function Loading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-64 rounded-lg" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}

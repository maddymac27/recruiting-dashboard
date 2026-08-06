import { Skeleton } from "@/components/ui/skeleton";

// Next.js App Router route-level loading UI — automatically wraps
// page.tsx's render in a Suspense boundary (mirrors src/app/board/loading.tsx).
// No *TableSkeleton component exists in-repo, so the table-shaped skeleton
// is written inline here (06-PATTERNS.md).
export default function Loading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <Skeleton className="h-8 w-32" />
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    </main>
  );
}

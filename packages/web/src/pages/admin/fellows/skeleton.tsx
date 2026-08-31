import { SkeletonBlock } from '@/components/shared/LoadingSpinner';

export function FellowsManagementSkeleton() {
  return (
    <div className="space-y-6 px-2 sm:px-4 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-64 rounded-full" />
        <SkeletonBlock className="h-5 w-[28rem] max-w-full rounded-full" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 border-b pb-0.5 overflow-x-auto">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-10 w-28 flex-shrink-0 rounded-t-lg" />
        ))}
      </div>

      {/* Status pills skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      {/* Search skeleton */}
      <SkeletonBlock className="h-11 w-full rounded-md" />

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/50 px-3 py-3">
          <div className="grid grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3.5 rounded-full" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-8 items-center gap-3 px-3 py-3">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-16 w-16 rounded-full bg-muted/80" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-28 rounded-full" />
                  <SkeletonBlock className="h-3 w-36 rounded-full" />
                </div>
              </div>
              {Array.from({ length: 6 }).map((__, column) => (
                <SkeletonBlock key={column} className="h-4 w-20 rounded-full" />
              ))}
              <SkeletonBlock className="h-4 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

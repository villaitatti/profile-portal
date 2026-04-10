interface LoadingSpinnerProps {
  variant?: 'page' | 'panel';
  rows?: number;
}

export function SkeletonBlock({
  className,
}: {
  className: string;
}) {
  return <div className={`bg-muted/70 ${className}`} />;
}

export function LoadingSpinner({
  variant = 'page',
  rows = 4,
}: LoadingSpinnerProps) {
  if (variant === 'panel') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading content"
        className="rounded-2xl border bg-card p-6"
      >
        <span className="sr-only">Loading content</span>
        <div className="space-y-4 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-4">
            <SkeletonBlock className="h-5 w-40 rounded-full" />
            <SkeletonBlock className="h-4 w-20 rounded-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={index} className="rounded-xl border border-border/80 bg-background/70 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-4 w-4 rounded-full bg-muted/80" />
                    <SkeletonBlock className="h-4 w-28 rounded-full" />
                  </div>
                  <SkeletonBlock className="h-3.5 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <span className="sr-only">Loading page</span>
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 motion-safe:animate-pulse">
        <div className="space-y-5">
          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-44 rounded-full" />
            <SkeletonBlock className="h-4.5 w-full rounded-full" />
            <SkeletonBlock className="h-4.5 w-4/5 rounded-full" />
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 p-4">
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-28 rounded-full" />
              <SkeletonBlock className="h-10 w-full rounded-md" />
            </div>
          </div>
          <div className="flex gap-3">
            <SkeletonBlock className="h-10 flex-1 rounded-full" />
            <SkeletonBlock className="h-10 w-24 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

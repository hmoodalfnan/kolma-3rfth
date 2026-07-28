export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} aria-hidden="true" />;
}

export function SkeletonList({ rows = 5, className = 'h-14' }) {
  return (
    <div className="space-y-2" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
      <span className="sr-only">جارٍ التحميل</span>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3 p-4" role="status" aria-label="جارٍ التحميل">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );
}

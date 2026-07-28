export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
          {title && <h2 className="text-sm font-bold text-navy-700">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
      {children}
    </p>
  );
}

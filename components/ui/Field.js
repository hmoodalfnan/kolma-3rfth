export function Field({ label, error, hint, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-ink outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-500/25 disabled:opacity-60';

export function Input({ className = '', ...rest }) {
  return <input {...rest} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select {...rest} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }) {
  return <textarea {...rest} className={`${CONTROL} min-h-24 ${className}`} />;
}

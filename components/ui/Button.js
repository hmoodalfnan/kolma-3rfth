'use client';

const TONES = {
  primary: 'bg-navy-700 text-white hover:bg-navy-600 disabled:bg-navy-300',
  gold: 'bg-gold-500 text-navy-900 hover:bg-gold-300 disabled:opacity-50',
  ghost: 'bg-transparent text-navy-700 hover:bg-navy-50 disabled:opacity-50',
  outline: 'border border-line bg-panel text-ink hover:bg-navy-50 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50',
};

export function Button({ tone = 'primary', loading = false, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 font-semibold transition disabled:cursor-not-allowed ${TONES[tone]} ${className}`}
    >
      {loading && (
        <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      )}
      {children}
    </button>
  );
}

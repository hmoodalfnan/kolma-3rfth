import { toWesternDigits } from '@/lib/auth/digits';

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

/**
 * A number field that accepts ٠١٢٣٤٥٦٧٨٩ as readily as 0123456789.
 *
 * Deliberately not `type="number"`. That field is validated by the browser
 * against its own idea of a number, and an Arabic-Indic digit is not one: the
 * keystroke is rejected before any handler can see it, so on an Arabic keyboard
 * the field simply refuses everything typed into it. A text field accepts the
 * characters and they are normalised on the way through, which is the same
 * thing the PIN boxes have always done.
 *
 * `onChange` receives the event with `target.value` already in Western digits,
 * so callers keep reading it exactly as they did from a number field.
 */
export function NumberInput({ onChange, signed = false, decimal = true, ...rest }) {
  const allowed = `0-9${decimal ? '.' : ''}${signed ? '-' : ''}`;

  return (
    <Input
      {...rest}
      type="text"
      // A numeric keypad has no minus key, so a field that accepts one has to
      // ask for the full keyboard.
      inputMode={signed ? 'text' : decimal ? 'decimal' : 'numeric'}
      dir="ltr"
      onChange={(event) => {
        const cleaned = toWesternDigits(event.target.value).replace(
          new RegExp(`[^${allowed}]`, 'g'),
          '',
        );
        if (cleaned !== event.target.value) event.target.value = cleaned;
        onChange(event);
      }}
    />
  );
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

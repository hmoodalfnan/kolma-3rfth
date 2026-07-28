'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
};

/**
 * A dialog that owns focus while it is open.
 *
 * Built on the native <dialog> element via showModal(), which gives us the
 * top layer, the inert backdrop, and browser-level focus containment for free —
 * a hand-rolled focus trap cannot stop focus escaping into browser chrome, and
 * this one can. On phones it fills the screen, because a centred card with a
 * software keyboard open leaves almost nothing visible.
 */
export function Modal({ open, onClose, title, description, size = 'md', children }) {
  const ref = useRef(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (open && !node.open) node.showModal();
    else if (!open && node.open) node.close();
  }, [open]);

  // The document keeps scrolling behind an open <dialog>, which on iOS drags the
  // dialog itself out of view. Lock the body for as long as one is open.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Esc fires `cancel`, not `close`, and would otherwise dismiss the dialog
  // without telling React — leaving `open` true and the modal unreopenable.
  const handleCancel = useCallback(
    (event) => {
      event.preventDefault();
      onClose();
    },
    [onClose],
  );

  return (
    <dialog
      ref={ref}
      onCancel={handleCancel}
      onClose={onClose}
      aria-labelledby={title ? headingId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a backdrop click:
        // the panel inside stops its own clicks from reaching here.
        if (event.target === ref.current) onClose();
      }}
      className="m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:m-auto"
    >
      <div
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        className={`flex h-dvh w-screen flex-col bg-panel text-ink sm:h-auto sm:max-h-[85dvh] sm:w-[92vw] sm:rounded-2xl sm:border sm:border-line ${SIZES[size] ?? SIZES.md}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 id={headingId} className="text-base font-bold text-brand">
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-1 shrink-0 rounded-lg px-3 text-xl leading-none text-muted hover:bg-chip"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </dialog>
  );
}

/**
 * Footer for a modal's actions. Sticks to the bottom of the scroll area so the
 * save button stays reachable on a phone with a long form above it.
 */
export function ModalActions({ children }) {
  return (
    <div className="sticky -bottom-4 -mx-4 mt-4 flex flex-wrap gap-2 border-t border-line bg-panel px-4 py-3">
      {children}
    </div>
  );
}

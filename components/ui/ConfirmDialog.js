'use client';

import { useState } from 'react';
import { Button } from './Button';
import { Modal, ModalActions } from './Modal';

/**
 * Ask before something irreversible happens.
 *
 * Several delete buttons went straight through — a group, a grant — because
 * each was one line of code and a confirm felt like ceremony. On a phone those
 * buttons sit a thumb's width from «تعديل», and none of them can be undone.
 *
 * A dialog rather than window.confirm: the native one cannot be read in Arabic
 * layout, cannot say what is about to be lost in more than a line, and on iOS
 * appears with the site's hostname above it, which reads as a browser warning
 * rather than a question from the app.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  note,
  confirmLabel = 'حذف',
  tone = 'danger',
  error,
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={open} onClose={onCancel} title={title} error={error} size="sm">
      <div className="grid gap-3">
        <p
          className={
            tone === 'danger'
              ? 'rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-ink'
              : 'text-sm'
          }
        >
          {message}
        </p>
        {note && <p className="text-xs text-muted">{note}</p>}

        <ModalActions>
          <Button
            tone={tone}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {confirmLabel}
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}

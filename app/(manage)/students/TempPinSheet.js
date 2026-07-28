'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

export function TempPinSheet({ entries, scheduleName, slug, onClose }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  if (!entries?.length) return null;

  return (
    <div className="card border-gold-500 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h2 className="text-sm font-bold text-navy-700">الأرقام السرية المؤقتة</h2>
          <p className="mt-1 text-xs text-rose-600">
            اطبع هذه الصفحة الآن — لن تظهر هذه الأرقام مرة أخرى. يمكنك فقط إعادة التعيين لاحقاً.
          </p>
        </div>
        <div className="flex gap-2">
          <Button tone="gold" onClick={() => window.print()}>
            طباعة
          </Button>
          <Button tone="ghost" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <div key={e.id} className="rounded-xl border border-line p-3">
            <p className="text-xs text-muted">{scheduleName}</p>
            <p className="mt-0.5 font-bold">{e.full_name}</p>
            <p className="mt-2 text-xs text-muted">الرمز المؤقت</p>
            <p className="text-2xl font-bold tracking-widest tabular-nums" dir="ltr">
              {e.tempPin}
            </p>
            {slug && (
              <p className="mt-2 break-all text-[10px] text-muted" dir="ltr">
                {origin}/j/{slug}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { getBrowserClient } from '@/lib/supabase/browser';
import {
  fetchAuditLog,
  fetchActorNames,
  describeEntry,
  describeChanges,
  relativeTime,
  absoluteTime,
  ACTION_LABELS,
  ENTITY_LABELS,
} from '@/lib/audit/query';
import { ROLE_LABELS } from '@/lib/auth/guard';

export function AuditView({ scheduleId, title, showScheduleColumn = false }) {
  const [filters, setFilters] = useState({ entityType: '', action: '', from: '', to: '' });
  const [rows, setRows] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [actorNames, setActorNames] = useState({});
  const [error, setError] = useState('');

  // Best effort: RLS only lets a super admin read the whole staff table, so a
  // manager silently keeps the stored usernames.
  useEffect(() => {
    fetchActorNames(getBrowserClient())
      .then(setActorNames)
      .catch(() => setActorNames({}));
  }, []);

  const load = useCallback(
    async (append = false) => {
      if (!append) setRows(null);
      try {
        const result = await fetchAuditLog(getBrowserClient(), {
          scheduleId: scheduleId ?? null,
          entityType: filters.entityType || undefined,
          action: filters.action || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          cursor: append ? cursor : undefined,
        });
        setRows((prev) => (append ? [...(prev ?? []), ...result.rows] : result.rows));
        setCursor(result.nextCursor);
      } catch (err) {
        setError(err.message);
        setRows([]);
      }
    },
    [scheduleId, filters, cursor],
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId, filters]);

  return (
    <Panel title={title}>
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="نوع العنصر" htmlFor="fentity">
          <Select
            id="fentity"
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
          >
            <option value="">الكل</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="الإجراء" htmlFor="faction">
          <Select
            id="faction"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="">الكل</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="من تاريخ" htmlFor="ffrom">
          <Input
            id="ffrom"
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </Field>

        <Field label="إلى تاريخ" htmlFor="fto">
          <Input
            id="fto"
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4">
        {rows === null ? (
          <SkeletonList rows={10} />
        ) : rows.length === 0 ? (
          <EmptyState>لا توجد عمليات مطابقة.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((entry) => {
              const changes = describeChanges(entry);
              return (
                <li key={entry.id} className="rounded-xl border border-line">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    aria-expanded={expanded === entry.id}
                    className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-right text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">{describeEntry(entry, actorNames)}</span>
                      <span className="mt-0.5 block text-xs text-muted" title={absoluteTime(entry.created_at)}>
                        {relativeTime(entry.created_at)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[10px] font-bold text-brand">
                      {ROLE_LABELS[entry.actor_role] ?? entry.actor_role}
                    </span>
                  </button>

                  {expanded === entry.id && (
                    <div className="border-t border-line px-3 py-2.5 text-xs">
                      <p className="text-muted">{absoluteTime(entry.created_at)}</p>

                      {changes.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {changes.map((change) => (
                            <li key={change.key} className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold">{change.label}:</span>
                              {change.from !== null && (
                                <>
                                  <span className="text-muted line-through">{change.from}</span>
                                  <span aria-hidden="true" className="text-muted">
                                    ←
                                  </span>
                                </>
                              )}
                              <span className="font-semibold text-brand">{change.to ?? '—'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-muted">لا توجد تفاصيل إضافية لهذه العملية.</p>
                      )}

                      {/* Kept, but out of the way: useful when investigating a
                          specific incident, noise the rest of the time. */}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-muted">تفاصيل تقنية</summary>
                        <div className="mt-1 space-y-1 text-muted">
                          <p>عنوان الجهاز: {entry.ip ?? '—'}</p>
                          <p className="break-all">المتصفح: {entry.user_agent ?? '—'}</p>
                          {showScheduleColumn && entry.schedule_id && (
                            <p dir="ltr">schedule_id: {entry.schedule_id}</p>
                          )}
                          {(entry.before || entry.after) && (
                            <pre className="overflow-x-auto rounded bg-surface p-2" dir="ltr">
                              {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                            </pre>
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {cursor && rows && rows.length > 0 && (
          <div className="mt-3 flex justify-center">
            <Button
              tone="outline"
              loading={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await load(true);
                setLoadingMore(false);
              }}
            >
              تحميل المزيد
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

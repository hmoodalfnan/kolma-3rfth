'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/Field';

/**
 * Pick who belongs in a group.
 *
 * Unassigned students come first, because a new group is nearly always being
 * filled from people who are not in one yet. Everyone else stays visible and
 * selectable, labelled with the group they would be moved out of — a student
 * belongs to exactly one group, so choosing them here is a move, not a copy,
 * and that should not be a surprise.
 */
export function GroupMembersPicker({
  students,
  groups,
  currentGroupId,
  selected,
  onChange,
}) {
  const [search, setSearch] = useState('');

  useEffect(() => setSearch(''), [currentGroupId]);

  const groupName = (id) => groups.find((g) => g.id === id)?.name;

  const ordered = useMemo(() => {
    const term = search.trim();
    const rank = (s) => {
      if (s.group_id === currentGroupId && currentGroupId) return 0; // already here
      if (!s.group_id) return 1; // unassigned
      return 2; // in another group
    };

    return students
      .filter((s) => s.is_active !== false)
      .filter((s) => !term || s.full_name.includes(term))
      .sort((a, b) => rank(a) - rank(b) || a.full_name.localeCompare(b.full_name, 'ar'));
  }, [students, search, currentGroupId]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  if (students.length === 0) {
    return <p className="text-sm text-muted">لا يوجد طلاب في هذه الرحلة بعد.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">الطلاب ({selected.size} مختار)</p>
        <button
          type="button"
          onClick={() => onChange(new Set(ordered.filter((s) => !s.group_id).map((s) => s.id)))}
          className="rounded-lg chip px-2.5 py-1 text-xs font-semibold"
        >
          اختيار كل من بلا مجموعة
        </button>
      </div>

      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ابحث بالاسم…"
        aria-label="ابحث عن طالب"
      />

      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {ordered.map((s) => {
          const otherGroup = s.group_id && s.group_id !== currentGroupId;
          return (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-chip">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="accent-[color:var(--color-accent)]"
                />
                <span className="min-w-0 flex-1 truncate font-semibold">{s.full_name}</span>

                {!s.group_id && (
                  <span className="shrink-0 rounded-full bg-ok px-2 py-0.5 text-[10px] font-bold text-ok-ink">
                    بلا مجموعة
                  </span>
                )}
                {otherGroup && (
                  <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-700">
                    مجموعة: {groupName(s.group_id) ?? '—'}
                  </span>
                )}
              </label>
            </li>
          );
        })}

        {ordered.length === 0 && (
          <li className="py-4 text-center text-sm text-muted">لا يوجد اسم مطابق.</li>
        )}
      </ul>

      <p className="mt-2 text-xs text-muted">
        الطالب ينتمي لمجموعة واحدة فقط — اختياره هنا ينقله من مجموعته الحالية.
      </p>
    </div>
  );
}

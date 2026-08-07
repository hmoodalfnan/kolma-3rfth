import { describe, it, expect } from 'vitest';
import { summarizeGrants } from '@/lib/grants/batch';

describe('summarizeGrants', () => {
  it('collects successful ids and failures separately', () => {
    const { ids, failed } = summarizeGrants([
      { studentId: 'a', id: 'e1', error: null },
      { studentId: 'b', id: null, error: 'boom' },
      { studentId: 'c', id: 'e2', error: null },
    ]);
    expect(ids).toEqual(['e1', 'e2']);
    expect(failed).toEqual([{ studentId: 'b', error: 'boom' }]);
  });

  it('supplies a fallback message when an error string is missing', () => {
    const { failed } = summarizeGrants([{ studentId: 'b', id: null, error: null }]);
    expect(failed[0].error).toBeTruthy();
  });

  it('handles an all-success batch', () => {
    const { ids, failed } = summarizeGrants([{ studentId: 'a', id: 'e1', error: null }]);
    expect(ids).toEqual(['e1']);
    expect(failed).toEqual([]);
  });
});

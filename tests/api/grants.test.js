import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/http/guard', () => ({
  requireStaff: async () => ({
    db: { from },
    scoped: { rpc },
    profile: { username: 'admin', role: 'manager' },
  }),
  staffsSchedule: async () => true,
}));
vi.mock('@/lib/audit/write', () => ({ writeAudit: async () => {} }));

const { POST } = await import('@/app/api/grants/route');

const u = (c) =>
  `${c}`.repeat(8) + '-' + `${c}`.repeat(4) + '-' + `${c}`.repeat(4) + '-' + `${c}`.repeat(4) + '-' + `${c}`.repeat(12);

const post = (body) =>
  POST(
    new Request('https://tracker.app/api/grants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://tracker.app' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  // criterion lookup: allow_negative true, belongs to schedule
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: u('2'), name: 'التعاون', allow_negative: true, schedule_id: u('1') },
        }),
      }),
    }),
  });
});

describe('POST /api/grants (students)', () => {
  it('grants to every selected student and reports failures', async () => {
    let n = 0;
    rpc.mockImplementation(async () => {
      n += 1;
      if (n === 2) return { data: null, error: { message: 'nope' } };
      return { data: `event-${n}`, error: null };
    });

    const res = await post({
      scheduleId: u('1'),
      criterionId: u('2'),
      points: 5,
      target: { kind: 'students', studentIds: [u('a'), u('b'), u('c')] },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ids).toEqual(['event-1', 'event-3']);
    expect(body.failed).toEqual([{ studentId: u('b'), error: 'nope' }]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

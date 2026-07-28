'use client';

/** Ranked student totals. Ties break on name so ranks are stable between renders. */
export async function fetchStudentTotals(client, { scheduleId, groupId, limit = 500 } = {}) {
  let query = client.from('v_student_totals').select('*');
  if (scheduleId) query = query.eq('schedule_id', scheduleId);
  if (groupId) query = query.eq('group_id', groupId);

  const { data, error } = await query
    .order('total_points', { ascending: false })
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function fetchGroupTotals(client, { scheduleId } = {}) {
  let query = client.from('v_group_totals').select('*');
  if (scheduleId) query = query.eq('schedule_id', scheduleId);

  const { data, error } = await query.order('total_points', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchQuestionLeaders(client, { scheduleId, questionId, limit = 20 } = {}) {
  let query = client.from('v_question_totals').select('*');
  if (scheduleId) query = query.eq('schedule_id', scheduleId);
  if (questionId) query = query.eq('question_id', questionId);

  const { data, error } = await query
    .order('times_completed', { ascending: false })
    .order('points', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export function rankRows(rows, key = 'total_points') {
  let lastValue = null;
  let lastRank = 0;
  return rows.map((row, index) => {
    const value = Number(row[key]);
    if (value !== lastValue) {
      lastRank = index + 1;
      lastValue = value;
    }
    return { ...row, rank: lastRank };
  });
}

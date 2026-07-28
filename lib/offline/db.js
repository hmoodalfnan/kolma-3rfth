import Dexie from 'dexie';

export const db = new Dexie('tracker');

db.version(1).stores({
  meta: 'key',
  questions: 'id, schedule_id',
  answers: '[student_id+question_id+entry_date], entry_date, student_id',
  outbox: '++seq, &key',
});

export const outboxKey = (studentId, questionId, entryDate) =>
  `${studentId}|${questionId}|${entryDate}`;

export async function clearMirror() {
  await db.transaction('rw', db.meta, db.questions, db.answers, db.outbox, async () => {
    await Promise.all([db.meta.clear(), db.questions.clear(), db.answers.clear(), db.outbox.clear()]);
  });
}

/** Stable per-browser identifier, used for last-write-wins conflict attribution. */
export async function deviceId() {
  const existing = await db.meta.get('device_id');
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID();
  await db.meta.put({ key: 'device_id', value });
  return value;
}

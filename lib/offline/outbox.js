import { db, outboxKey } from './db';

/**
 * Queue a change and reflect it in the local mirror at once.
 * Re-tapping the same item overwrites its queued op instead of adding another,
 * so a student toggling a checkbox ten times offline still syncs one write.
 */
export async function enqueue({
  studentId,
  questionId,
  entryDate,
  value,
  clientUpdatedAt,
  deviceId,
}) {
  const key = outboxKey(studentId, questionId, entryDate);

  await db.transaction('rw', db.outbox, db.answers, async () => {
    const existing = await db.outbox.where('key').equals(key).first();
    const record = { key, studentId, questionId, entryDate, value, clientUpdatedAt, deviceId };

    if (existing) {
      await db.outbox.update(existing.seq, record);
    } else {
      await db.outbox.add(record);
    }

    await db.answers.put({
      student_id: studentId,
      question_id: questionId,
      entry_date: entryDate,
      value,
      client_updated_at: clientUpdatedAt,
      dirty: true,
    });
  });
}

export function pending() {
  return db.outbox.orderBy('seq').toArray();
}

export function pendingCount() {
  return db.outbox.count();
}

export function remove(seq) {
  return db.outbox.delete(seq);
}

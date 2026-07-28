import { db } from './db';
import { pending, remove } from './outbox';

let flushing = null;

/** Postgres raises business-rule violations as P0001; those will never succeed on retry. */
const isPermanent = (error) =>
  error?.code === 'P0001' || error?.code === '23514' || error?.code === '42501';

export async function flush(client) {
  if (flushing) return flushing;

  flushing = (async () => {
    const ops = await pending();
    if (ops.length === 0) return { pushed: 0, rejected: [] };

    let pushed = 0;
    const rejected = [];

    for (const op of ops) {
       
      const { error } = await client.from('answers').upsert(
        {
          student_id: op.studentId,
          question_id: op.questionId,
          entry_date: op.entryDate,
          value: op.value,
          client_updated_at: op.clientUpdatedAt,
          device_id: op.deviceId,
        },
        { onConflict: 'student_id,question_id,entry_date' },
      );

      if (!error) {
         
        await remove(op.seq);
         
        await db.answers.update([op.studentId, op.questionId, op.entryDate], { dirty: false });
        pushed += 1;
      } else if (isPermanent(error)) {
         
        await remove(op.seq);
        rejected.push({ op, error: error.message });
      } else {
        break; // transient: stop here and keep the queue ordered for the next attempt
      }
    }

    return { pushed, rejected };
  })();

  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

export async function mirror(client, { studentId, scheduleId, from }) {
  const [questionsRes, answersRes] = await Promise.all([
    client.from('questions').select('*').eq('schedule_id', scheduleId),
    client.from('answers').select('*').eq('student_id', studentId).gte('entry_date', from),
  ]);

  const questions = questionsRes.data;
  const answers = answersRes.data;

  await db.transaction('rw', db.questions, db.answers, async () => {
    if (questions) {
      await db.questions.where('schedule_id').equals(scheduleId).delete();
      await db.questions.bulkPut(questions);
    }
    if (answers) {
      // Never clobber a row that still has an unsynced local edit.
      for (const row of answers) {
         
        const local = await db.answers.get([row.student_id, row.question_id, row.entry_date]);
        if (local?.dirty) continue;
         
        await db.answers.put({ ...row, dirty: false });
      }
    }
  });

  return { questions: questions ?? [], answers: answers ?? [] };
}

export function startAutoSync(client, onResult) {
  const run = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      flush(client)
        .then((r) => {
          if (onResult && (r.pushed > 0 || r.rejected.length > 0)) onResult(r);
        })
        .catch(() => {});
    }
  };

  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', run);
  const timer = setInterval(run, 60_000);
  run();

  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', run);
    clearInterval(timer);
  };
}

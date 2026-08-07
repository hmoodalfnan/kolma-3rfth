/**
 * Fold per-student RPC outcomes into a success/failure summary.
 * Grants are best-effort: one student failing must not hide the rest.
 */
export function summarizeGrants(outcomes) {
  const ids = [];
  const failed = [];
  for (const o of outcomes) {
    if (o.id) ids.push(o.id);
    else failed.push({ studentId: o.studentId, error: o.error || 'تعذّر تسجيل النقاط' });
  }
  return { ids, failed };
}

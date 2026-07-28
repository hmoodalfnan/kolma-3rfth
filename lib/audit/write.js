import 'server-only';

/**
 * Fire-and-forget audit write. Never throws: a logging failure must not turn a
 * successful user action into an error response.
 */
export async function writeAudit(client, entry) {
  try {
    await client.rpc('write_audit', {
      p_actor_label: entry.actorLabel ?? '',
      p_actor_role: entry.actorRole ?? 'anonymous',
      p_schedule_id: entry.scheduleId ?? null,
      p_entity_type: entry.entityType,
      p_entity_id: entry.entityId ?? null,
      p_action: entry.action,
      p_before: entry.before ?? null,
      p_after: entry.after ?? null,
      p_ip: entry.ip ?? '',
      p_user_agent: entry.userAgent ?? '',
    });
  } catch (err) {
    console.error('[audit] write failed', entry.entityType, entry.action, err?.message);
  }
}

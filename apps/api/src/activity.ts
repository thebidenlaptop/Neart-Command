import type { Queryable } from './db.js';

export interface ActivityEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export async function logActivity(tx: Queryable, e: ActivityEntry) {
  await tx.query(
    `INSERT INTO activity_log (entity_type, entity_id, action, actor_id, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    [e.entityType, e.entityId, e.action, e.actorId, e.changes ?? null],
  );
}

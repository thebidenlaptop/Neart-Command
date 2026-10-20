import type { Lead } from '@neart/shared';
import type { Queryable, Row } from '../db.js';

const SELECT_LEAD = `
  SELECT l.*, src.slug AS source_slug, t.slug AS trade_slug, s.slug AS status_slug
  FROM leads l
  JOIN lead_sources src ON src.id = l.source_id
  JOIN statuses s ON s.id = l.status_id
  LEFT JOIN trade_types t ON t.id = l.trade_type_id`;

export function toLead(r: Row): Lead {
  return {
    id: r.id,
    source: r.source_slug,
    tradeType: r.trade_slug,
    status: r.status_slug,
    statusChangedAt: r.status_changed_at,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    scope: r.scope,
    message: r.message,
    contactAt: r.contact_at,
    customerId: r.customer_id,
    createdAt: r.created_at,
  };
}

export async function findLead(tx: Queryable, id: string, lock = false): Promise<Lead | null> {
  // FOR UPDATE can't apply to the outer-joined table, so lock the lead row only.
  const { rows } = await tx.query(
    `${SELECT_LEAD} WHERE l.id = $1 ${lock ? 'FOR UPDATE OF l' : ''}`,
    [id],
  );
  return rows[0] ? toLead(rows[0]) : null;
}

export async function findLeadBySourceRef(
  tx: Queryable,
  sourceId: string,
  externalId: string,
): Promise<Lead | null> {
  const { rows } = await tx.query(`${SELECT_LEAD} WHERE l.source_id = $1 AND l.external_id = $2`, [
    sourceId,
    externalId,
  ]);
  return rows[0] ? toLead(rows[0]) : null;
}

export async function listLeads(tx: Queryable, statusSlug?: string): Promise<Lead[]> {
  const { rows } = await tx.query(
    `${SELECT_LEAD} ${statusSlug ? 'WHERE s.slug = $1' : ''} ORDER BY l.created_at DESC`,
    statusSlug ? [statusSlug] : [],
  );
  return rows.map(toLead);
}

export async function findIdBySlug(
  tx: Queryable,
  table: 'lead_sources' | 'trade_types',
  slug: string,
): Promise<string | null> {
  const { rows } = await tx.query(`SELECT id FROM ${table} WHERE slug = $1 AND active`, [slug]);
  return rows[0]?.id ?? null;
}

export async function findStatus(tx: Queryable, where: { slug: string } | { isDefault: true }) {
  const { rows } = await tx.query(
    `SELECT * FROM statuses WHERE active AND ${'slug' in where ? 'slug = $1' : 'is_default'}`,
    'slug' in where ? [where.slug] : [],
  );
  return rows[0] ?? null;
}

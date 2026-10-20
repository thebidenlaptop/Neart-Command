import type { ChangeStatus, Lead, LeadIntake } from '@neart/shared';
import { logActivity } from '../activity.js';
import type { Db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import {
  findIdBySlug,
  findLead,
  findLeadBySourceRef,
  findStatus,
  listLeads,
} from './leads.repo.js';

/** Store a new lead in the default status (Uncontacted). Re-delivered leads return the original. */
export function createLead(
  db: Db,
  input: LeadIntake,
  actorId: string | null = null,
): Promise<Lead> {
  return db.transaction(async (tx) => {
    const sourceId = await findIdBySlug(tx, 'lead_sources', input.source);
    if (!sourceId) throw badRequest(`Unknown source "${input.source}"`);

    let tradeTypeId: string | null = null;
    if (input.tradeType) {
      tradeTypeId = await findIdBySlug(tx, 'trade_types', input.tradeType);
      if (!tradeTypeId) throw badRequest(`Unknown trade type "${input.tradeType}"`);
    }

    const status = await findStatus(tx, { isDefault: true });
    if (!status) throw badRequest('No default status configured');

    const { rows } = await tx.query(
      `INSERT INTO leads (source_id, trade_type_id, status_id, full_name, phone, email,
                          scope, message, external_id, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (source_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        sourceId,
        tradeTypeId,
        status.id,
        input.fullName ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.scope ?? null,
        input.message ?? null,
        input.externalId ?? null,
        input.rawPayload ?? null,
      ],
    );

    const id = rows[0]?.id;
    if (!id) {
      // Conflict: this lead was already received.
      return (await findLeadBySourceRef(tx, sourceId, input.externalId!))!;
    }

    await tx.query(
      `INSERT INTO lead_status_history (lead_id, to_status_id, changed_by) VALUES ($1,$2,$3)`,
      [id, status.id, actorId],
    );
    await logActivity(tx, { entityType: 'lead', entityId: id, action: 'created', actorId });
    return (await findLead(tx, id))!;
  });
}

/**
 * Move a lead to another status. The target status's flags drive side effects:
 * makes_contact promotes the lead to a contact; creates_customer creates the customer account.
 */
export function changeLeadStatus(
  db: Db,
  leadId: string,
  { status: slug }: ChangeStatus,
  actorId: string | null = null,
): Promise<Lead> {
  return db.transaction(async (tx) => {
    const lead = await findLead(tx, leadId, true);
    if (!lead) throw notFound('Lead');
    if (lead.status === slug) return lead;

    const target = await findStatus(tx, { slug });
    if (!target) throw badRequest(`Unknown status "${slug}"`);

    let customerId = lead.customerId;
    if (target.creates_customer && !customerId) {
      if (!lead.fullName) throw badRequest("Add the lead's name before booking");
      const { rows } = await tx.query(
        `INSERT INTO customers (full_name, email, phone) VALUES ($1,$2,$3) RETURNING id`,
        [lead.fullName, lead.email, lead.phone],
      );
      customerId = rows[0]!.id;
      await logActivity(tx, {
        entityType: 'customer',
        entityId: customerId!,
        action: 'created',
        actorId,
      });
    }

    await tx.query(
      `UPDATE leads SET status_id = $2, status_changed_at = now(), customer_id = $3,
              contact_at = CASE WHEN $4 THEN COALESCE(contact_at, now()) ELSE contact_at END
       WHERE id = $1`,
      [leadId, target.id, customerId, target.makes_contact],
    );
    await tx.query(
      `INSERT INTO lead_status_history (lead_id, from_status_id, to_status_id, changed_by)
       SELECT $1, id, $3, $4 FROM statuses WHERE slug = $2`,
      [leadId, lead.status, target.id, actorId],
    );
    await logActivity(tx, {
      entityType: 'lead',
      entityId: leadId,
      action: 'status_changed',
      actorId,
      changes: { status: { from: lead.status, to: slug } },
    });
    return (await findLead(tx, leadId))!;
  });
}

export const getLead = async (db: Db, id: string): Promise<Lead> => {
  const lead = await findLead(db, id);
  if (!lead) throw notFound('Lead');
  return lead;
};

export const getLeads = (db: Db, status?: string) => listLeads(db, status);

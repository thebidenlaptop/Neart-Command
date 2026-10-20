import { changeStatusSchema, leadIntakeSchema } from '@neart/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';
import { changeLeadStatus, createLead, getLead, getLeads } from './leads.service.js';

// Placeholder until authentication exists: callers say who they are.
const actor = (headers: Record<string, unknown>) =>
  typeof headers['x-user-id'] === 'string' ? headers['x-user-id'] : null;

export function leadRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Querystring: { status?: string } }>('/leads', (req) => getLeads(db, req.query.status));

  app.get<{ Params: { id: string } }>('/leads/:id', (req) => getLead(db, req.params.id));

  app.post('/leads', async (req, reply) => {
    const lead = await createLead(db, leadIntakeSchema.parse(req.body), actor(req.headers));
    return reply.code(201).send(lead);
  });

  app.post<{ Params: { id: string } }>('/leads/:id/status', (req) =>
    changeLeadStatus(db, req.params.id, changeStatusSchema.parse(req.body), actor(req.headers)),
  );
}

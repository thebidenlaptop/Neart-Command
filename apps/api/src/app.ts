import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { leadRoutes } from './leads/leads.routes.js';

export function buildApp(db: Db) {
  const app = Fastify();

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues });
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal error' });
  });

  leadRoutes(app, db);
  return app;
}

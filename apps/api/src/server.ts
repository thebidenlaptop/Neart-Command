import { buildApp } from './app.js';
import { createPgDb } from './db.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const app = buildApp(createPgDb(url));
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });

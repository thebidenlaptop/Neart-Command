import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  console.log('seeding', file);
  await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
}
await client.end();

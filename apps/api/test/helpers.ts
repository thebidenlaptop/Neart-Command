import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../src/db.js';

const dbDir = path.join(import.meta.dirname, '..', '..', '..', 'packages', 'db');

/** In-memory Postgres with the real migrations and seeds applied. */
export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  for (const sub of ['migrations', 'seeds']) {
    for (const f of fs
      .readdirSync(path.join(dbDir, sub))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await pg.exec(fs.readFileSync(path.join(dbDir, sub, f), 'utf8'));
    }
  }
  return {
    query: (sql, params) => pg.query(sql, params as unknown[]) as any,
    transaction: (fn) => pg.transaction((tx) => fn(tx as any)),
  };
}

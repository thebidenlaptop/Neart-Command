// Applies migrations + seeds to an in-memory Postgres (PGlite) and runs sanity checks.
// No database server needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
for (const sub of ['migrations', 'seeds']) {
  const dir = path.join(root, sub);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    console.log('ok', sub + '/' + f);
  }
}

let failed = 0;
const expect = async (name, fn, shouldThrow = false) => {
  try { await fn(); if (shouldThrow) throw new Error('expected failure'); console.log('pass', name); }
  catch (e) { if (shouldThrow && e.message !== 'expected failure') console.log('pass', name); else { failed++; console.log('FAIL', name, '-', e.message); } }
};

const q = (s, p) => db.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];

const src = await one(`SELECT id FROM lead_sources WHERE slug='facebook_lead_ads'`);
const unc = await one(`SELECT id FROM statuses WHERE slug='uncontacted'`);
const wfi = await one(`SELECT id FROM statuses WHERE slug='waiting_for_images'`);

await expect('sparse Facebook lead inserts', () =>
  q(`INSERT INTO leads (source_id,status_id,full_name,phone,email,external_id) VALUES ($1,$2,'A','1','a@b.c','fb-1')`, [src.id, unc.id]));
await expect('duplicate external_id rejected', () =>
  q(`INSERT INTO leads (source_id,status_id,external_id) VALUES ($1,$2,'fb-1')`, [src.id, unc.id]), true);
await expect('second default status rejected', () =>
  q(`UPDATE statuses SET is_default=true WHERE slug='quoted'`), true);
await expect('firm booking without date rejected', async () => {
  const l = await one(`SELECT id FROM leads LIMIT 1`);
  await q(`INSERT INTO bookings (type,lead_id) VALUES ('estimate_visit',$1)`, [l.id]);
}, true);
await expect('flexible booking without date accepted', async () => {
  const l = await one(`SELECT id FROM leads LIMIT 1`);
  await q(`INSERT INTO bookings (type,lead_id,is_flexible,flexible_from,flexible_until) VALUES ('booked_job',$1,true,'2026-11-01','2027-01-31')`, [l.id]);
});
await expect('lat without lng rejected', () =>
  q(`UPDATE leads SET latitude=51.5`), true);
await expect('updated_at trigger fires', async () => {
  const before = await one(`SELECT updated_at FROM leads LIMIT 1`);
  await q(`SELECT pg_sleep(0.01)`);
  await q(`UPDATE leads SET message='x'`);
  const after = await one(`SELECT updated_at FROM leads LIMIT 1`);
  if (!(after.updated_at > before.updated_at)) throw new Error('not updated');
});
await expect('seeded automation points at Waiting for images', async () => {
  const r = await one(`SELECT trigger_status_id FROM automations LIMIT 1`);
  if (r.trigger_status_id !== wfi.id) throw new Error('mismatch');
});

process.exit(failed ? 1 : 0);

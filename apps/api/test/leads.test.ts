import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Db } from '../src/db.js';
import { testDb } from './helpers.js';

let db: Db;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  db = await testDb();
  app = buildApp(db);
});

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as any });
const newLead = async (extra = {}) =>
  (
    await post('/leads', { source: 'google_ads', fullName: 'Dave Smith', phone: '07000', ...extra })
  ).json();

describe('lead intake', () => {
  it('lands new leads in Uncontacted', async () => {
    const res = await post('/leads', {
      source: 'facebook_lead_ads',
      fullName: 'A',
      email: 'a@b.co',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('uncontacted');
  });

  it('ignores a re-delivered lead', async () => {
    const a = await newLead({ externalId: 'x1' });
    const b = await newLead({ externalId: 'x1' });
    expect(b.id).toBe(a.id);
    expect((await app.inject('/leads')).json()).toHaveLength(1);
  });

  it('rejects unknown source and empty leads', async () => {
    expect((await post('/leads', { source: 'nope', fullName: 'A' })).statusCode).toBe(400);
    expect((await post('/leads', { source: 'google_ads' })).statusCode).toBe(400);
  });
});

describe('status change', () => {
  it('moves the lead between status lists and records history + activity', async () => {
    const lead = await newLead();
    const res = await post(`/leads/${lead.id}/status`, { status: 'waiting_for_images' });
    expect(res.json().status).toBe('waiting_for_images');
    expect((await app.inject('/leads?status=uncontacted')).json()).toHaveLength(0);
    expect((await app.inject('/leads?status=waiting_for_images')).json()).toHaveLength(1);
    expect(
      (await db.query('SELECT 1 FROM lead_status_history WHERE lead_id=$1', [lead.id])).rows,
    ).toHaveLength(2);
    expect(
      (await db.query(`SELECT 1 FROM activity_log WHERE action='status_changed'`)).rows,
    ).toHaveLength(1);
  });

  it('turns the lead into a contact when the status says so', async () => {
    const lead = await newLead();
    const res = await post(`/leads/${lead.id}/status`, { status: 'waiting_for_images' });
    expect(res.json().contactAt).toBeTruthy();
  });

  it('creates the customer only at Booked', async () => {
    const lead = await newLead({ email: 'd@s.co' });
    const quoted = (await post(`/leads/${lead.id}/status`, { status: 'quoted' })).json();
    expect(quoted.customerId).toBeNull();
    const booked = (await post(`/leads/${lead.id}/status`, { status: 'booked' })).json();
    expect(booked.customerId).toBeTruthy();
    const { rows } = await db.query('SELECT full_name, email FROM customers');
    expect(rows).toEqual([{ full_name: 'Dave Smith', email: 'd@s.co' }]);
  });

  it('does not create a second customer when re-booked', async () => {
    const lead = await newLead();
    await post(`/leads/${lead.id}/status`, { status: 'booked' });
    await post(`/leads/${lead.id}/status`, { status: 'quoted' });
    await post(`/leads/${lead.id}/status`, { status: 'booked' });
    expect((await db.query('SELECT 1 FROM customers')).rows).toHaveLength(1);
  });

  it('cannot book a lead with no name', async () => {
    const lead = await newLead({ fullName: undefined, email: 'x@y.co' });
    expect((await post(`/leads/${lead.id}/status`, { status: 'booked' })).statusCode).toBe(400);
  });

  it('404s for unknown lead, 400s for unknown status', async () => {
    const lead = await newLead();
    expect(
      (await post(`/leads/00000000-0000-0000-0000-000000000000/status`, { status: 'quoted' }))
        .statusCode,
    ).toBe(404);
    expect((await post(`/leads/${lead.id}/status`, { status: 'nope' })).statusCode).toBe(400);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { newLine } from '../../../src/lib/docs';
import { seal, unseal } from '../../_lib/server';
import type { Env } from '../../_lib/server';
import { onRequestPost as invoice } from './invoice';
import { onRequestGet as status } from './status';

const env: Env = {
  QBO_CLIENT_ID: 'cid',
  QBO_CLIENT_SECRET: 'secret',
  QBO_ENV: 'sandbox',
  SUPABASE_URL: 'https://db.example',
  SUPABASE_ANON_KEY: 'anon',
};
const ID = '11111111-2222-3333-4444-555555555555';

afterEach(() => vi.unstubAllGlobals());

describe('token encryption', () => {
  it('round-trips and is not readable as saved', async () => {
    const sealed = await seal(env, 'refresh-abc');
    expect(sealed).not.toContain('refresh-abc');
    expect(await unseal(env, sealed)).toBe('refresh-abc');
  });
  it('cannot be opened with a different secret', async () => {
    const sealed = await seal(env, 'x');
    await expect(unseal({ ...env, QBO_CLIENT_SECRET: 'other' }, sealed)).rejects.toThrow();
  });
});

describe('status', () => {
  it('says not configured without keys, and needs no login for that', async () => {
    const r = await status({ request: new Request('https://app.example/api/qbo/status'), env: {} });
    expect(await r.json()).toEqual({ configured: false, connected: false });
  });
  it('refuses a request with no login', async () => {
    const r = await status({ request: new Request('https://app.example/api/qbo/status'), env });
    expect(r.status).toBe(401);
  });
});

describe('send invoice to QuickBooks', () => {
  async function run(over: { vat_mode?: string; taxCodes?: Array<{ Id: string; Name: string }>; exported?: string | null } = {}) {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const conn = {
      realm_id: '9341',
      env: 'sandbox',
      access_token: await seal(env, 'ACCESS'),
      refresh_token: await seal(env, 'REFRESH'),
      access_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 86400_000 * 90).toISOString(),
      company_name: 'Test Co',
    };
    const inv = {
      id: ID,
      number: 'INV-0001',
      customer_name: "Sam O'Brien",
      customer_email: 'sam@example.com',
      customer_address: '1 High St',
      title: 'Bathroom refit',
      notes: '',
      lines: [newLine({ desc: 'Materials', qty: '1', price: '4000' }), newLine({ desc: 'Labour', qty: '100', price: '37' })],
      vat_mode: over.vat_mode ?? 'rc',
      issue_date: '2026-10-31',
      due_date: '2026-11-14',
      qbo_exported_at: over.exported ?? null,
    };
    const taxCodes = over.taxCodes ?? [
      { Id: '1', Name: '20.0% S' },
      { Id: '6', Name: '20.0% RC' },
      { Id: '4', Name: 'Out of Scope' },
    ];
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/auth/v1/user')) return reply({ id: 'user-1' });
      if (url.includes('/rest/v1/jmc_qbo_connections')) return reply([conn]);
      if (url.includes('/rest/v1/jmc_invoices')) return reply([inv]);
      if (url.includes('/query?query=')) {
        const q = decodeURIComponent(url.split('query=')[1].split('&')[0]);
        if (q.includes('from Customer')) return reply({ QueryResponse: {} });
        if (q.includes('from Item')) return reply({ QueryResponse: { Item: [{ Id: '7', Name: 'Services', Type: 'Service' }] } });
        if (q.includes('from TaxCode')) return reply({ QueryResponse: { TaxCode: taxCodes } });
      }
      if (url.includes('/customer?')) return reply({ Customer: { Id: '58' } });
      if (url.includes('/invoice?')) return reply({ Invoice: { Id: '201', DocNumber: '1001' } });
      return reply({}, 404);
    });
    const res = await invoice({
      request: new Request('https://app.example/api/qbo/invoice', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt' },
        body: JSON.stringify({ invoiceId: ID }),
      }),
      env,
    });
    return { res, calls };
  }

  it('finds or creates the customer, then creates the invoice with the reverse-charge code', async () => {
    const { res, calls } = await run();
    expect(res.status).toBe(200);
    const out = (await res.json()) as { id: string; doc: string };
    expect(out).toMatchObject({ id: '201', doc: '1001' });

    const cust = calls.find((c) => c.url.includes('/customer?'));
    expect(cust?.body).toMatchObject({ DisplayName: "Sam O'Brien", PrimaryEmailAddr: { Address: 'sam@example.com' } });
    const customerQuery = decodeURIComponent(calls.find((c) => c.url.includes('from%20Customer') || c.url.includes('from+Customer'))?.url ?? '');
    expect(customerQuery).toContain("DisplayName = 'Sam O\\'Brien'");

    const made = calls.find((c) => c.url.includes('/invoice?'))!;
    expect(made.url).toContain('sandbox-quickbooks.api.intuit.com/v3/company/9341/invoice');
    expect(made.body).toMatchObject({ CustomerRef: { value: '58' }, GlobalTaxCalculation: 'TaxExcluded', TxnDate: '2026-10-31', DueDate: '2026-11-14' });
    const lines = (made.body as { Line: Array<{ Amount: number; SalesItemLineDetail: { TaxCodeRef: { value: string }; ItemRef: { value: string } } }> }).Line;
    expect(lines.map((l) => l.Amount)).toEqual([4000, 3700]);
    expect(lines.every((l) => l.SalesItemLineDetail.TaxCodeRef.value === '6' && l.SalesItemLineDetail.ItemRef.value === '7')).toBe(true);
    expect(made.body).not.toHaveProperty('DocNumber');
  });

  it('explains which tax code is missing instead of guessing', async () => {
    const { res, calls } = await run({ taxCodes: [{ Id: '1', Name: '20.0% S' }] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/20% reverse charge.*20\.0% S/);
    expect(calls.some((c) => c.url.includes('/invoice?'))).toBe(false);
  });

  it('will not send the same invoice twice', async () => {
    const { res, calls } = await run({ exported: '2026-10-31T10:00:00Z' });
    expect(res.status).toBe(409);
    expect(calls.some((c) => c.url.includes('/invoice?'))).toBe(false);
  });
});

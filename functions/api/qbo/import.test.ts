import { afterEach, describe, expect, it, vi } from 'vitest';
import { seal } from '../../_lib/server';
import type { Env } from '../../_lib/server';
import { onRequestPost as importer } from './import';

const env: Env = { QBO_CLIENT_ID: 'cid', QBO_CLIENT_SECRET: 'secret', QBO_ENV: 'sandbox', SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon' };
afterEach(() => vi.unstubAllGlobals());

async function run(body: unknown, qboReply: unknown, existing: { numbers?: string[]; ids?: string[] } = {}) {
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
  vi.stubGlobal('fetch', async (url: string, init: { method?: string; body?: string } = {}) => {
    const u = String(url);
    calls.push({ method: init.method ?? 'GET', url: u, body: init.body ? JSON.parse(init.body) : undefined });
    const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (u.includes('/auth/v1/user')) return ok({ id: 'user-1' });
    if (u.includes('jmc_qbo_connections')) return ok([conn]);
    if (u.includes('quickbooks.api.intuit.com')) return ok(qboReply);
    if (u.includes('jmc_invoices?select=number')) return ok((existing.numbers ?? []).map((number) => ({ number })));
    if (u.includes('jmc_invoices?select=qbo_id')) return ok((existing.ids ?? []).map((qbo_id) => ({ qbo_id })));
    if (init.method === 'POST') return ok((JSON.parse(init.body ?? '[]') as unknown[]).map((_, i) => ({ id: String(i) })));
    return ok([]);
  });
  const res = await importer({
    request: new Request('https://app.example/api/qbo/import', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }),
    env,
  });
  return { res, data: (await res.json()) as Record<string, unknown>, calls };
}

describe('import from QuickBooks', () => {
  it('rejects an unknown step', async () => {
    expect((await run({ stage: 'x' }, {})).res.status).toBe(400);
  });

  it('saves customers, ignoring repeats, and reports no next page for a short page', async () => {
    const { data, calls } = await run(
      { stage: 'customers', start: 1 },
      { QueryResponse: { Customer: [{ Id: '1', DisplayName: 'Sam', BillAddr: { Line1: '1 High St' } }, { Id: '2', DisplayName: 'sam' }, { Id: '3' }] } },
    );
    expect(data).toEqual({ fetched: 3, added: 1, next: null });
    const post = calls.find((c) => c.method === 'POST' && c.url.includes('jmc_customers'));
    expect(post?.url).toContain('on_conflict=owner_id,name_key');
    expect(post?.body).toEqual([expect.objectContaining({ name: 'Sam', address: '1 High St', source: 'quickbooks' })]);
    const q = calls.find((c) => c.url.includes('quickbooks.api.intuit.com'));
    expect(decodeURIComponent(q!.url)).toContain('startposition 1 maxresults 100');
    expect(calls.every((c) => c.method === 'GET' || c.url.includes('jmc_customers'))).toBe(true);
  });

  it('asks for the next page when the page is full', async () => {
    const Customer = Array.from({ length: 100 }, (_, i) => ({ Id: String(i), DisplayName: `C${i}` }));
    const { data } = await run({ stage: 'customers', start: 101 }, { QueryResponse: { Customer } });
    expect(data.next).toBe(201);
  });

  it('saves new invoices, skipping ones already here and renaming clashing numbers', async () => {
    const mk = (Id: string, DocNumber: string) => ({ Id, DocNumber, TotalAmt: 120, Balance: 120, TxnTaxDetail: { TotalTax: 20 }, CustomerRef: { name: 'Sam' }, Line: [] });
    const { data, calls } = await run(
      { stage: 'invoices', start: 1 },
      { QueryResponse: { Invoice: [mk('1', '1001'), mk('2', '1002'), { Id: '3', TotalAmt: 0, PrivateNote: 'Voided' }] } },
      { numbers: ['1002'], ids: ['1'] },
    );
    expect(data).toEqual({ fetched: 3, added: 1, next: null });
    const post = calls.find((c) => c.method === 'POST' && c.url.includes('jmc_invoices'));
    expect(post?.url).toContain('on_conflict=owner_id,qbo_id');
    expect(post?.body).toEqual([expect.objectContaining({ qbo_id: '2', number: '1002 (QB)', imported: true })]);
  });
});

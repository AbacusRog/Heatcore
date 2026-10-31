import { buildInvoice, pickTaxCodes, qboQuote } from '../../../src/lib/qboPayload';
import type { QboTaxCode, TaxIds } from '../../../src/lib/qboPayload';
import type { DocLine, VatMode } from '../../../src/lib/types';
import { caller, db, guard, HttpError, json, liveConnection, qbo, qboQuery, requireConfigured } from '../../_lib/server';
import type { Ctx, Env } from '../../_lib/server';

interface InvoiceRow {
  id: string;
  number: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  notes: string;
  lines: DocLine[];
  vat_mode: VatMode;
  issue_date: string;
  due_date: string | null;
  qbo_exported_at: string | null;
}

type Conn = { realm: string; access: string };

async function customerId(env: Env, conn: Conn, inv: InvoiceRow): Promise<string> {
  const name = inv.customer_name.trim().slice(0, 100);
  const found = await qboQuery<{ Id: string }>(env, conn, `select Id from Customer where DisplayName = ${qboQuote(name)}`);
  if (found[0]) return found[0].Id;
  const make = (DisplayName: string) =>
    qbo<{ Customer: { Id: string } }>(env, conn, 'customer', {
      method: 'POST',
      body: {
        DisplayName,
        ...(/^\S+@\S+\.\S+$/.test(inv.customer_email.trim()) ? { PrimaryEmailAddr: { Address: inv.customer_email.trim() } } : {}),
        ...(inv.customer_address.trim() ? { BillAddr: { Line1: inv.customer_address.trim().slice(0, 500) } } : {}),
      },
    });
  try {
    return (await make(name)).Customer.Id;
  } catch (e) {
    // The name may already belong to a supplier or employee in QuickBooks, which must be unique.
    if (e instanceof HttpError && /duplicate|already in use/i.test(e.message)) return (await make(`${name.slice(0, 85)} (customer)`)).Customer.Id;
    throw e;
  }
}

async function serviceItem(env: Env, conn: Conn): Promise<string> {
  const items = await qboQuery<{ Id: string; Name: string; Type: string }>(env, conn, 'select Id, Name, Type from Item where Active = true maxresults 100');
  const pick =
    items.find((i) => i.Name.toLowerCase() === 'services') ?? items.find((i) => i.Type === 'Service') ?? items.find((i) => i.Type === 'NonInventory');
  if (!pick) throw new HttpError(409, 'QuickBooks needs a Service item to put the lines on. Add one called “Services” in QuickBooks, then try again.');
  return pick.Id;
}

async function taxIds(env: Env, conn: Conn, mode: VatMode): Promise<TaxIds> {
  const codes = await qboQuery<QboTaxCode>(env, conn, 'select Id, Name, Active from TaxCode maxresults 200');
  const { ids, missing } = pickTaxCodes(codes, {
    ...(env.QBO_TAXCODE_STD ? { std: env.QBO_TAXCODE_STD } : {}),
    ...(env.QBO_TAXCODE_RC ? { rc: env.QBO_TAXCODE_RC } : {}),
    ...(env.QBO_TAXCODE_NONE ? { none: env.QBO_TAXCODE_NONE } : {}),
  });
  const need = mode === 'std' ? 'std' : mode === 'rc' ? 'rc' : 'none';
  if (missing.includes(need)) {
    const label = mode === 'std' ? '20% VAT' : mode === 'rc' ? '20% reverse charge' : 'No VAT';
    const names = codes.map((c) => c.Name).slice(0, 12).join(', ');
    throw new HttpError(409, `We could not find the QuickBooks tax code for ${label}. Tax codes in your QuickBooks: ${names || 'none found'}. Abacus can set the right one on the site.`);
  }
  return ids;
}

/** Creates the invoice in the connected QuickBooks company. */
export const onRequestPost = ({ request, env }: Ctx): Promise<Response> =>
  guard(async () => {
    requireConfigured(env);
    const who = await caller(request, env);
    const { invoiceId } = (await request.json().catch(() => ({}))) as { invoiceId?: string };
    if (!invoiceId || !/^[0-9a-f-]{36}$/.test(invoiceId)) throw new HttpError(400, 'Bad request.');

    const rows = await db<InvoiceRow[]>(env, who, `jmc_invoices?id=eq.${invoiceId}&select=*`);
    const inv = rows[0];
    if (!inv) throw new HttpError(404, 'We could not find that invoice.');
    if (inv.qbo_exported_at) throw new HttpError(409, 'This invoice is already in QuickBooks.');
    if (!inv.customer_name.trim()) throw new HttpError(400, 'Add the customer’s name first.');

    const conn = await liveConnection(env, who);
    const [cust, item, tax] = await Promise.all([customerId(env, conn, inv), serviceItem(env, conn), taxIds(env, conn, inv.vat_mode)]);

    const body = buildInvoice({
      customerId: cust,
      itemId: item,
      number: inv.number,
      title: inv.title,
      notes: inv.notes,
      customerEmail: inv.customer_email,
      lines: inv.lines,
      vatMode: inv.vat_mode,
      taxIds: tax,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
    });
    if (!(body.Line as unknown[]).length) throw new HttpError(400, 'Add at least one line with a price first.');

    const made = await qbo<{ Invoice: { Id: string; DocNumber?: string } }>(env, conn, 'invoice', { method: 'POST', body });
    return json({ id: made.Invoice.Id, doc: made.Invoice.DocNumber ?? '', exported_at: new Date().toISOString() });
  });

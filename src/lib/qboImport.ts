import type { DocLine, ImportedTotals } from './types';

/* Turning what QuickBooks sends back into our own customer and invoice records. Pure, so it can be tested. */

export interface QboAddr {
  Line1?: string;
  Line2?: string;
  Line3?: string;
  Line4?: string;
  Line5?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
}

export const addressOf = (a: QboAddr | undefined | null): string =>
  a
    ? [a.Line1, a.Line2, a.Line3, a.Line4, a.Line5, a.City, a.CountrySubDivisionCode, a.PostalCode]
        .map((x) => (x ?? '').trim())
        .filter(Boolean)
        .join('\n')
    : '';

export interface QboCustomer {
  Id: string;
  DisplayName?: string;
  FullyQualifiedName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
  BillAddr?: QboAddr;
  ShipAddr?: QboAddr;
}

export interface CustomerRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  source: 'quickbooks';
}

/** Null when QuickBooks sent a customer with no usable name. */
export function mapCustomer(c: QboCustomer): CustomerRow | null {
  const name = (c.DisplayName || c.FullyQualifiedName || c.CompanyName || '').trim().slice(0, 200);
  if (!name) return null;
  return {
    name,
    email: (c.PrimaryEmailAddr?.Address ?? '').trim().slice(0, 200),
    phone: (c.PrimaryPhone?.FreeFormNumber || c.Mobile?.FreeFormNumber || '').trim().slice(0, 60),
    address: addressOf(c.BillAddr) || addressOf(c.ShipAddr),
    source: 'quickbooks',
  };
}

interface QboLine {
  Amount?: number;
  Description?: string;
  DetailType?: string;
  SalesItemLineDetail?: { Qty?: number; UnitPrice?: number; ItemRef?: { name?: string } };
}

export interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
  CustomerRef?: { value?: string; name?: string };
  CustomerMemo?: { value?: string };
  BillEmail?: { Address?: string };
  BillAddr?: QboAddr;
  Line?: QboLine[];
  TxnTaxDetail?: { TotalTax?: number };
  MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
}

export interface InvoiceRow {
  number: string;
  status: 'sent' | 'paid';
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  lines: DocLine[];
  vat_mode: 'std' | 'none';
  notes: string;
  issue_date: string;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  qbo_id: string;
  qbo_doc: string | null;
  qbo_exported_at: string | null;
  imported: true;
  imported_totals: ImportedTotals;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const text = (n: number) => String(r2(n));
const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** A voided invoice has no value and says so in its private note. Not worth keeping. */
export const isVoided = (i: QboInvoice): boolean => (i.TotalAmt ?? 0) === 0 && /^voided/i.test((i.PrivateNote ?? '').trim());

export function mapInvoice(inv: QboInvoice, newId: () => string): InvoiceRow {
  const lines: DocLine[] = [];
  for (const l of inv.Line ?? []) {
    const amount = l.Amount ?? 0;
    if (l.DetailType === 'SalesItemLineDetail') {
      const d = l.SalesItemLineDetail ?? {};
      const qty = d.Qty && d.Qty > 0 ? d.Qty : 1;
      const price = d.UnitPrice ?? (qty ? amount / qty : amount);
      lines.push({ id: newId(), desc: (l.Description || d.ItemRef?.name || 'Item').trim(), qty: String(qty), price: text(price) });
    } else if (l.DetailType === 'DescriptionOnly' && (l.Description ?? '').trim()) {
      lines.push({ id: newId(), desc: (l.Description ?? '').trim(), qty: '1', price: '0' });
    } else if (l.DetailType === 'DiscountLineDetail') {
      lines.push({ id: newId(), desc: (l.Description || 'Discount').trim(), qty: '1', price: text(-amount) });
    }
  }
  const total = r2(inv.TotalAmt ?? 0);
  const vat = r2(inv.TxnTaxDetail?.TotalTax ?? 0);
  const balance = r2(inv.Balance ?? 0);
  const paid = total > 0 && balance <= 0;
  const number = (inv.DocNumber ?? '').trim() || `QB-${inv.Id}`;
  return {
    number: number.slice(0, 60),
    status: paid ? 'paid' : 'sent',
    customer_name: (inv.CustomerRef?.name ?? '').trim(),
    customer_email: (inv.BillEmail?.Address ?? '').trim(),
    customer_address: addressOf(inv.BillAddr),
    title: '',
    lines,
    vat_mode: vat > 0 ? 'std' : 'none',
    notes: (inv.CustomerMemo?.value ?? '').trim(),
    issue_date: day(inv.TxnDate) ?? day(inv.MetaData?.CreateTime) ?? new Date().toISOString().slice(0, 10),
    due_date: day(inv.DueDate),
    sent_at: inv.MetaData?.CreateTime ?? null,
    paid_at: paid ? (inv.MetaData?.LastUpdatedTime ?? null) : null,
    qbo_id: inv.Id,
    qbo_doc: inv.DocNumber ?? null,
    qbo_exported_at: inv.MetaData?.CreateTime ?? null,
    imported: true,
    imported_totals: { net: r2(total - vat), vat, total, balance },
  };
}

/** Make this batch's invoice numbers unique, against numbers already saved and against each other. */
export function uniqueNumbers(rows: InvoiceRow[], taken: Set<string>): InvoiceRow[] {
  const used = new Set(taken);
  return rows.map((r) => {
    let n = r.number;
    if (used.has(n)) n = `${r.number} (QB)`;
    if (used.has(n)) n = `${r.number} (QB ${r.qbo_id})`;
    used.add(n);
    return n === r.number ? r : { ...r, number: n };
  });
}

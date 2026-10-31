import { num, r2 } from './calc';
import { newId } from './defaults';
import { money } from './format';
import type { Business, DocData, DocLine, Invoice, Job, Quote, Settings, VatMode } from './types';
import { compute } from './calc';

export const VAT_RATE = 0.2;

export const defaultSettings: Settings = {
  business_name: '',
  address: '',
  email: '',
  phone: '',
  vat_number: '',
  logo: null,
  quote_prefix: 'Q-',
  invoice_prefix: 'INV-',
  next_quote_no: 1,
  next_invoice_no: 1,
  payment_days: 14,
  quote_valid_days: 30,
  bank_details: '',
  quote_terms: '',
  invoice_terms: '',
  default_vat: 'std',
};

export const newLine = (p: Partial<DocLine> = {}): DocLine => ({ id: newId(), desc: '', qty: '1', price: '', ...p });

export const lineTotal = (l: DocLine): number => r2(num(l.qty) * num(l.price));

/** A line counts once it has something to charge for. */
export const lineUsed = (l: DocLine): boolean => lineTotal(l) > 0;

export interface Totals {
  net: number;
  vat: number;
  gross: number;
  /** Under the reverse charge: the VAT the customer accounts for, not added to the total. */
  rcVat: number;
}

export function docTotals(lines: DocLine[], vatMode: VatMode): Totals {
  const net = r2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const vat = vatMode === 'std' ? r2(net * VAT_RATE) : 0;
  const rcVat = vatMode === 'rc' ? r2(net * VAT_RATE) : 0;
  return { net, vat, gross: r2(net + vat), rcVat };
}

export const vatLabel: Record<VatMode, string> = {
  std: '20% VAT',
  rc: '20% reverse charge',
  none: 'No VAT',
};

export const RC_NOTE = 'Reverse charge: Customer to pay the VAT at the rates shown to HMRC.';

export const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(4, '0')}`;

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Lines for a quote, taken from a job's materials and labour. Costs and margin never go on it. */
export function linesFromJob(job: Job): DocLine[] {
  const c = compute(job);
  const lines: DocLine[] = [];
  if (c.matCharge > 0) lines.push(newLine({ desc: 'Materials', qty: '1', price: String(c.matCharge) }));
  if (c.labourCharge > 0) {
    lines.push(
      c.byHours
        ? newLine({ desc: 'Labour', qty: String(c.hours), price: String(c.rate) })
        : newLine({ desc: 'Labour', qty: '1', price: String(c.labourCharge) }),
    );
  }
  return lines.length ? lines : [newLine()];
}

/** Invoice lines copied from an accepted quote, with fresh line ids. */
export const copyLines = (lines: DocLine[]): DocLine[] => lines.map((l) => ({ ...l, id: newId() }));

export const businessOf = (s: Settings, kind: 'quote' | 'invoice'): Business => ({
  name: s.business_name,
  address: s.address,
  email: s.email,
  phone: s.phone,
  vat_number: s.vat_number,
  logo: s.logo,
  terms: kind === 'quote' ? s.quote_terms : s.invoice_terms,
  bank: kind === 'invoice' ? s.bank_details : undefined,
});

export const quoteDoc = (q: Quote, s: Settings): DocData => ({
  kind: 'quote',
  number: q.number,
  status: q.status,
  issue_date: q.issue_date,
  end_date: q.valid_until,
  customer_name: q.customer_name,
  customer_address: q.customer_address,
  title: q.title,
  lines: q.lines,
  vat_mode: q.vat_mode,
  notes: q.notes,
  business: businessOf(s, 'quote'),
});

export const invoiceDoc = (i: Invoice, s: Settings): DocData => ({
  kind: 'invoice',
  number: i.number,
  status: i.status,
  issue_date: i.issue_date,
  end_date: i.due_date,
  customer_name: i.customer_name,
  customer_address: i.customer_address,
  title: i.title,
  lines: i.lines,
  vat_mode: i.vat_mode,
  notes: i.notes,
  business: businessOf(s, 'invoice'),
});

/** Private link the customer opens. The long random token is the only key. */
export const docLink = (kind: 'quote' | 'invoice', token: string, origin = window.location.origin): string =>
  `${origin}/#/${kind === 'quote' ? 'q' : 'i'}/${token}`;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

export interface Mail {
  to: string;
  subject: string;
  body: string;
}

export function quoteMail(q: Quote, s: Settings, link: string): Mail {
  const t = docTotals(q.lines, q.vat_mode);
  const who = firstName(q.customer_name);
  const body = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    `Please find our quote ${q.number}${q.title.trim() ? ` for ${q.title.trim()}` : ''}, totalling ${money(t.gross)}${
      q.vat_mode === 'std' ? ' including VAT' : ''
    }.`,
    '',
    'You can view it and accept or decline it here:',
    link,
    q.valid_until ? `\nThis quote is valid until ${fmtDate(q.valid_until)}.` : '',
    '',
    'Kind regards,',
    s.business_name,
  ].join('\n');
  return { to: q.customer_email.trim(), subject: `Quote ${q.number} from ${s.business_name || 'us'}`, body };
}

export function invoiceMail(i: Invoice, s: Settings, link: string): Mail {
  const t = docTotals(i.lines, i.vat_mode);
  const who = firstName(i.customer_name);
  const body = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    `Please find invoice ${i.number}${i.title.trim() ? ` for ${i.title.trim()}` : ''}, totalling ${money(t.gross)}${
      i.due_date ? `, due ${fmtDate(i.due_date)}` : ''
    }.`,
    '',
    'You can view and print or save it here:',
    link,
    '',
    'Thank you,',
    s.business_name,
  ].join('\n');
  return { to: i.customer_email.trim(), subject: `Invoice ${i.number} from ${s.business_name || 'us'}`, body };
}

export const mailtoUrl = (m: Mail): string =>
  `mailto:${encodeURIComponent(m.to).replace(/%40/g, '@')}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;

export const mailText = (m: Mail): string => `To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}`;

/** Ready to send: a customer email and at least one charged line. */
export const readyToSend = (d: { customer_email: string; lines: DocLine[] }): string | null => {
  if (!/^\S+@\S+\.\S+$/.test(d.customer_email.trim())) return 'Add the customer’s email address first.';
  if (!d.lines.some(lineUsed)) return 'Add at least one line with a price first.';
  return null;
};

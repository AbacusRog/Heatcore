import { num } from './calc';
import { lineTotal, lineUsed } from './docs';
import type { DocLine, VatMode } from './types';

export interface QboTaxCode {
  Id: string;
  Name: string;
  Active?: boolean;
}

export interface TaxIds {
  std: string;
  rc: string;
  none: string;
}

const clean = (s: string) => s.trim().toLowerCase();

/**
 * Pick the QuickBooks UK tax codes for 20% VAT, 20% reverse charge and no VAT by their names.
 * `override` holds ids set on the site for any code the names do not find.
 */
export function pickTaxCodes(codes: QboTaxCode[], override: Partial<TaxIds> = {}): { ids: TaxIds; missing: Array<keyof TaxIds> } {
  const live = codes.filter((c) => c.Active !== false);
  const find = (test: (n: string) => boolean) => live.find((c) => test(clean(c.Name)))?.Id;
  const reverse = (n: string) => /reverse|\brc\b/.test(n);

  const std =
    override.std ??
    find((n) => /^20(\.0+)?%\s*(s|standard)\b/.test(n) && !reverse(n)) ??
    find((n) => /standard/.test(n) && /20/.test(n) && !reverse(n));
  const rc = override.rc ?? find((n) => reverse(n) && /20/.test(n) && !/expense|purchase/.test(n)) ?? find((n) => reverse(n) && !/expense|purchase/.test(n));
  const none =
    override.none ??
    find((n) => /^no vat$|out of scope|outside the scope/.test(n)) ??
    find((n) => /^exempt|zero|^0(\.0+)?%/.test(n));

  const ids = { std: std ?? '', rc: rc ?? '', none: none ?? '' };
  const missing = (Object.keys(ids) as Array<keyof TaxIds>).filter((k) => !ids[k]);
  return { ids, missing };
}

export interface InvoiceInput {
  customerId: string;
  itemId: string;
  number: string;
  title: string;
  notes: string;
  customerEmail: string;
  lines: DocLine[];
  vatMode: VatMode;
  taxIds: TaxIds;
  issueDate: string;
  dueDate: string | null;
}

/** The QuickBooks invoice. We do not send our own number: QuickBooks numbers it unless the company allows custom numbers. */
export function buildInvoice(i: InvoiceInput): Record<string, unknown> {
  const taxId = i.vatMode === 'std' ? i.taxIds.std : i.vatMode === 'rc' ? i.taxIds.rc : i.taxIds.none;
  const memo = [i.title.trim(), i.notes.trim()].filter(Boolean).join('\n').slice(0, 1000);
  const body: Record<string, unknown> = {
    CustomerRef: { value: i.customerId },
    TxnDate: i.issueDate,
    GlobalTaxCalculation: 'TaxExcluded',
    PrivateNote: `From Job Margin Checker, invoice ${i.number}`,
    Line: i.lines.filter(lineUsed).map((l, n) => ({
      LineNum: n + 1,
      Description: l.desc.trim() || i.title.trim() || 'Item',
      Amount: lineTotal(l),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: i.itemId },
        Qty: num(l.qty),
        UnitPrice: num(l.price),
        TaxCodeRef: { value: taxId },
      },
    })),
  };
  if (i.dueDate) body.DueDate = i.dueDate;
  if (memo) body.CustomerMemo = { value: memo };
  if (/^\S+@\S+\.\S+$/.test(i.customerEmail.trim())) body.BillEmail = { Address: i.customerEmail.trim() };
  return body;
}

/** Escape a value for a QuickBooks query string. */
export const qboQuote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A person-friendly message from a QuickBooks error response. */
export function qboFault(body: unknown): string {
  const f = (body as { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string }> } } | null)?.Fault?.Error?.[0];
  if (!f) return '';
  return [f.Message, f.Detail].filter(Boolean).join(': ');
}

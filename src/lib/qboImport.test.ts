import { describe, expect, it } from 'vitest';
import { grossOf, totalsOf } from './docs';
import { addressOf, isVoided, mapCustomer, mapInvoice, uniqueNumbers } from './qboImport';
import type { QboInvoice } from './qboImport';
import type { Invoice } from './types';

let n = 0;
const id = () => `l${++n}`;

describe('addressOf', () => {
  it('joins the parts that exist, one per line', () => {
    expect(addressOf({ Line1: '1 High St', Line2: ' ', City: 'Leeds', PostalCode: 'LS1 1AA' })).toBe('1 High St\nLeeds\nLS1 1AA');
  });
  it('is empty when there is none', () => {
    expect(addressOf(undefined)).toBe('');
  });
});

describe('mapCustomer', () => {
  it('takes name, email, phone and billing address', () => {
    const c = mapCustomer({
      Id: '5',
      DisplayName: ' Sam O’Brien ',
      PrimaryEmailAddr: { Address: 'sam@example.com' },
      Mobile: { FreeFormNumber: '07700 900123' },
      BillAddr: { Line1: '2 Mill Lane', City: 'York', PostalCode: 'YO1 7AA' },
    });
    expect(c).toEqual({ name: 'Sam O’Brien', email: 'sam@example.com', phone: '07700 900123', address: '2 Mill Lane\nYork\nYO1 7AA', source: 'quickbooks' });
  });
  it('falls back to the shipping address and skips nameless customers', () => {
    expect(mapCustomer({ Id: '6', DisplayName: 'A', ShipAddr: { Line1: 'Unit 4' } })?.address).toBe('Unit 4');
    expect(mapCustomer({ Id: '7' })).toBeNull();
  });
});

const qb: QboInvoice = {
  Id: '42',
  DocNumber: '1001',
  TxnDate: '2026-09-01',
  DueDate: '2026-09-30',
  TotalAmt: 1200,
  Balance: 0,
  CustomerRef: { value: '5', name: 'Sam O’Brien' },
  BillEmail: { Address: 'sam@example.com' },
  BillAddr: { Line1: '2 Mill Lane', City: 'York' },
  CustomerMemo: { value: 'Thanks' },
  TxnTaxDetail: { TotalTax: 200 },
  MetaData: { CreateTime: '2026-09-01T09:00:00Z', LastUpdatedTime: '2026-09-10T09:00:00Z' },
  Line: [
    { Amount: 600, Description: 'Labour', DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { Qty: 20, UnitPrice: 30 } },
    { Amount: 400, DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { Qty: 1, UnitPrice: 400, ItemRef: { name: 'Materials' } } },
    { Amount: 1000, DetailType: 'SubTotalLineDetail' },
  ],
};

describe('mapInvoice', () => {
  const r = mapInvoice(qb, id);
  it('keeps number, customer, dates and QuickBooks ids', () => {
    expect(r).toMatchObject({ number: '1001', customer_name: 'Sam O’Brien', customer_address: '2 Mill Lane\nYork', issue_date: '2026-09-01', due_date: '2026-09-30', qbo_id: '42', imported: true });
  });
  it('turns sales lines into lines and ignores subtotal lines', () => {
    expect(r.lines.map((l) => [l.desc, l.qty, l.price])).toEqual([['Labour', '20', '30'], ['Materials', '1', '400']]);
  });
  it('keeps QuickBooks totals and marks a settled invoice paid', () => {
    expect(r.imported_totals).toEqual({ net: 1000, vat: 200, total: 1200, balance: 0 });
    expect(r.status).toBe('paid');
    expect(r.vat_mode).toBe('std');
  });
  it('leaves an unpaid invoice as sent, with no VAT mode when untaxed', () => {
    const u = mapInvoice({ ...qb, Balance: 1200, TxnTaxDetail: { TotalTax: 0 }, TotalAmt: 1000 }, id);
    expect(u.status).toBe('sent');
    expect(u.paid_at).toBeNull();
    expect(u.vat_mode).toBe('none');
  });
  it('invents a number when QuickBooks has none', () => {
    expect(mapInvoice({ ...qb, DocNumber: undefined }, id).number).toBe('QB-42');
  });
});

describe('voided and duplicate numbers', () => {
  it('recognises a voided invoice', () => {
    expect(isVoided({ Id: '1', TotalAmt: 0, PrivateNote: 'Voided' })).toBe(true);
    expect(isVoided(qb)).toBe(false);
  });
  it('renames a number already used here or earlier in the batch', () => {
    const a = mapInvoice(qb, id);
    const b = { ...mapInvoice({ ...qb, Id: '43' }, id) };
    const out = uniqueNumbers([a, b], new Set(['1001']));
    expect(out[0].number).toBe('1001 (QB)');
    expect(out[1].number).toBe('1001 (QB 43)');
  });
});

describe('imported totals are what is shown', () => {
  const inv = { ...mapInvoice(qb, id), lines: [], imported: true } as unknown as Invoice;
  it('grossOf uses the QuickBooks total', () => {
    expect(grossOf(inv)).toBe(1200);
  });
  it('totalsOf uses them for a document', () => {
    const t = totalsOf({ imported: { net: 1000, vat: 200, total: 1200, balance: 0 }, lines: [], vat_mode: 'std' } as never);
    expect(t).toEqual({ net: 1000, vat: 200, gross: 1200, rcVat: 0 });
  });
});

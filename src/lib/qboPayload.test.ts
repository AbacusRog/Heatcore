import { describe, expect, it } from 'vitest';
import { newLine } from './docs';
import { buildInvoice, pickTaxCodes, qboFault, qboQuote } from './qboPayload';

const uk = [
  { Id: '1', Name: '20.0% S' },
  { Id: '2', Name: '0.0% Z' },
  { Id: '3', Name: 'Exempt' },
  { Id: '4', Name: 'Out of Scope' },
  { Id: '5', Name: 'Reverse charge 20.0% (VAT on Expenses)' },
  { Id: '6', Name: '20.0% RC' },
];

describe('tax code matching', () => {
  it('finds standard, reverse charge and no VAT by name', () => {
    const r = pickTaxCodes(uk);
    expect(r.ids).toEqual({ std: '1', rc: '6', none: '4' });
    expect(r.missing).toEqual([]);
  });
  it('reports what it cannot find, and lets an id be set instead', () => {
    const r = pickTaxCodes([{ Id: '1', Name: '20.0% S' }]);
    expect(r.missing).toEqual(['rc', 'none']);
    expect(pickTaxCodes([{ Id: '1', Name: '20.0% S' }], { rc: '99', none: '98' }).missing).toEqual([]);
  });
  it('ignores inactive codes', () => {
    expect(pickTaxCodes([{ Id: '1', Name: '20.0% S', Active: false }]).ids.std).toBe('');
  });
});

describe('invoice payload', () => {
  const base = {
    customerId: '58',
    itemId: '7',
    number: 'INV-0001',
    title: 'Bathroom refit',
    notes: 'Thanks',
    customerEmail: 'sam@example.com',
    lines: [newLine({ desc: 'Materials', qty: '1', price: '4000' }), newLine({ desc: 'Labour', qty: '100', price: '37' }), newLine({ desc: 'Empty', qty: '1', price: '' })],
    vatMode: 'rc' as const,
    taxIds: { std: '1', rc: '6', none: '4' },
    issueDate: '2026-10-31',
    dueDate: '2026-11-14',
  };
  it('builds tax-exclusive lines with the right tax code and skips empty lines', () => {
    const p = buildInvoice(base) as { Line: Array<{ Amount: number; SalesItemLineDetail: { TaxCodeRef: { value: string }; Qty: number; UnitPrice: number } }>; GlobalTaxCalculation: string };
    expect(p.GlobalTaxCalculation).toBe('TaxExcluded');
    expect(p.Line).toHaveLength(2);
    expect(p.Line[1].Amount).toBe(3700);
    expect(p.Line[1].SalesItemLineDetail).toMatchObject({ Qty: 100, UnitPrice: 37, TaxCodeRef: { value: '6' } });
  });
  it('never sends our own number as the QuickBooks number', () => {
    const p = buildInvoice(base);
    expect(p).not.toHaveProperty('DocNumber');
    expect(p.PrivateNote).toContain('INV-0001');
    expect(p).toMatchObject({ DueDate: '2026-11-14', BillEmail: { Address: 'sam@example.com' }, CustomerMemo: { value: 'Bathroom refit\nThanks' } });
  });
  it('uses the standard code for 20% VAT', () => {
    const p = buildInvoice({ ...base, vatMode: 'std' }) as { Line: Array<{ SalesItemLineDetail: { TaxCodeRef: { value: string } } }> };
    expect(p.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe('1');
  });
});

describe('query and error helpers', () => {
  it('escapes quotes in names', () => expect(qboQuote("O'Brien")).toBe("'O\\'Brien'"));
  it('reads a QuickBooks fault', () => {
    expect(qboFault({ Fault: { Error: [{ Message: 'Business Validation Error', Detail: 'Invalid tax code' }] } })).toBe('Business Validation Error: Invalid tax code');
    expect(qboFault({})).toBe('');
  });
});

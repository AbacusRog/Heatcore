import { describe, expect, it } from 'vitest';
import { exampleJob } from './defaults';
import {
  addDays,
  copyLines,
  docLink,
  docTotals,
  fmtDate,
  linesFromJob,
  mailtoUrl,
  newLine,
  pad,
  quoteMail,
  readyToSend,
  defaultSettings,
} from './docs';
import type { Quote } from './types';

const L = (qty: string, price: string) => newLine({ qty, price });

describe('document totals', () => {
  it('adds 20% VAT on top for a standard quote', () => {
    expect(docTotals([L('1', '4000'), L('1', '3700')], 'std')).toEqual({ net: 7700, vat: 1540, gross: 9240, rcVat: 0 });
  });
  it('adds no VAT under the reverse charge but reports what the customer accounts for', () => {
    expect(docTotals([L('2', '50.50')], 'rc')).toEqual({ net: 101, vat: 0, gross: 101, rcVat: 20.2 });
  });
  it('adds no VAT when none is charged', () => {
    expect(docTotals([L('3', '10')], 'none')).toEqual({ net: 30, vat: 0, gross: 30, rcVat: 0 });
  });
  it('treats blanks as nothing', () => {
    expect(docTotals([L('', ''), L('2', '')], 'std').gross).toBe(0);
  });
});

describe('quote from a job', () => {
  it('uses the charged materials and labour, never costs', () => {
    const lines = linesFromJob(exampleJob());
    expect(lines.map((l) => [l.desc, l.qty, l.price])).toEqual([
      ['Materials', '1', '4000'],
      ['Labour', '100', '37'],
    ]);
    expect(docTotals(lines, 'rc').net).toBe(7700);
  });
  it('gives one blank line for an empty job', () => {
    expect(linesFromJob({ ...exampleJob(), matCost: '', hours: '', rate: '' })).toHaveLength(1);
  });
  it('copies lines with new ids', () => {
    const a = [L('1', '5')];
    const b = copyLines(a);
    expect(b[0].id).not.toBe(a[0].id);
    expect(b[0].price).toBe('5');
  });
});

describe('numbers and dates', () => {
  it('pads numbers', () => expect(pad('Q-', 7)).toBe('Q-0007'));
  it('adds days across a month end', () => expect(addDays('2026-10-31', 30)).toBe('2026-11-30'));
  it('formats dates', () => expect(fmtDate('2026-11-30')).toBe('30 Nov 2026'));
});

describe('email', () => {
  const quote = {
    number: 'Q-0001',
    title: 'Bathroom refit',
    customer_name: 'Sam Smith',
    customer_email: 'sam@example.com',
    lines: [L('1', '1000')],
    vat_mode: 'std',
    valid_until: '2026-11-30',
  } as Quote;
  const link = docLink('quote', 'a'.repeat(40), 'https://app.example');
  it('builds the customer link', () => expect(link).toBe(`https://app.example/#/q/${'a'.repeat(40)}`));
  it('writes the message with total, link and expiry', () => {
    const m = quoteMail(quote, { ...defaultSettings, business_name: 'Heatcore Solutions' }, link);
    expect(m.subject).toBe('Quote Q-0001 from Heatcore Solutions');
    expect(m.body).toContain('Hello Sam,');
    expect(m.body).toContain('£1,200.00 including VAT');
    expect(m.body).toContain(link);
    expect(m.body).toContain('valid until 30 Nov 2026');
    expect(mailtoUrl(m).startsWith('mailto:sam@example.com?subject=')).toBe(true);
  });
  it('asks for an email address and a price before sending', () => {
    expect(readyToSend({ customer_email: '', lines: [L('1', '5')] })).toMatch(/email/);
    expect(readyToSend({ customer_email: 'a@b.co', lines: [L('1', '')] })).toMatch(/line/);
    expect(readyToSend({ customer_email: 'a@b.co', lines: [L('1', '5')] })).toBeNull();
  });
});

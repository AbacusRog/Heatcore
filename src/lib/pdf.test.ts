import { describe, expect, it } from 'vitest';
import { newLine } from './docs';
import { buildPdf, pdfFileName, pdfSafe } from './pdf';
import type { DocData } from './types';

const base = (over: Partial<DocData> = {}): DocData => ({
  kind: 'invoice',
  number: 'INV-0007',
  status: 'sent',
  issue_date: '2026-11-10',
  end_date: '2026-11-24',
  customer_name: 'Sam O’Brien Ltd',
  customer_address: '9 South Western Road\nSt Margarets\nTW1 1LG',
  title: 'Underfloor heating at 2 Winslow – phase 1',
  lines: [
    newLine({ desc: 'Labour supplied to install UFH to 2 Winslow', qty: '1', price: '2216.28', kind: 'cis_labour' }),
    newLine({ desc: 'UFH supplied to 2 Winslow', qty: '1', price: '5483.72', kind: 'cis_materials' }),
    newLine({ desc: 'Powerflush', qty: '2', price: '250', kind: 'normal' }),
  ],
  vat_mode: 'rc',
  notes: 'Thank you for your business.',
  business: {
    name: 'Heatcore Solutions',
    address: '12 Boiler Lane\nExeter\nEX1 1AA',
    email: 'info@heatcoresolutions.co.uk',
    phone: '01392 555 0100',
    vat_number: 'GB 123 4567 89',
    logo: null,
    bank: 'Heatcore Solutions\nSort code 00-00-00\nAccount 00000000',
    terms: 'Payment due within 14 days.',
  },
  ...over,
});

describe('PDF download', () => {
  it('builds a one-page PDF for an ordinary invoice', async () => {
    const pdf = await buildPdf(base(), null);
    expect(pdf.getNumberOfPages()).toBe(1);
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(2000);
  });
  it('runs on to more pages for a long document and numbers them', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => newLine({ desc: `Item number ${i + 1} with a longer description of the work carried out`, qty: '1', price: '10', kind: 'normal' }));
    const pdf = await buildPdf(base({ lines, vat_mode: 'std' }), null);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  });
  it('builds a quote and copes with no lines, blank customer and odd characters', async () => {
    const pdf = await buildPdf(base({ kind: 'quote', number: 'Q-0001', lines: [newLine()], customer_name: '', title: '', notes: '', vat_mode: 'none', business: { ...base().business, bank: undefined, terms: undefined } }), null);
    expect(pdf.getNumberOfPages()).toBe(1);
  });
  it('maps punctuation the PDF fonts cannot draw', () => {
    expect(pdfSafe('Sam’s “job” – 2 x 5…')).toBe('Sam\'s "job" - 2 x 5...');
    expect(pdfSafe('Café £5 ✓')).toBe('Café £5 ?');
  });
  it('names the file by number and customer', () => {
    expect(pdfFileName(base())).toBe('INV-0007 - Sam OBrien Ltd.pdf');
    expect(pdfFileName(base({ customer_name: '' }))).toBe('INV-0007.pdf');
  });
});

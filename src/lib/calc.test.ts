import { describe, expect, it } from 'vitest';
import { compute } from './calc';
import { exampleJob } from './defaults';

describe('compute', () => {
  it('matches the worked example under reverse charge with 20% CIS', () => {
    const c = compute(exampleJob());
    expect(c.matVat).toBe(800);
    expect(c.invoiceNet).toBe(7700);
    expect(c.cis).toBe(740);
    expect(c.cashIn).toBe(6960);
    expect(c.inVat).toBe(800);
    expect(c.paidOut).toBe(4800);
    expect(c.profit).toBe(3700);
    expect(c.netCash).toBe(2960);
  });

  it('gives the same net cash when 20% VAT is charged, because VAT is neutral', () => {
    const c = compute({ ...exampleJob(), vatMode: 'std' });
    expect(c.outVat).toBe(1540);
    expect(c.cashIn).toBe(8500);
    expect(c.profit).toBe(3700);
    expect(c.netCash).toBe(2960);
  });

  it('adds markup to materials and extra costs with and without VAT', () => {
    const job = exampleJob();
    job.matMode = 'markup';
    job.markupPct = '10';
    job.extras = [
      { id: 'a', name: 'Fuel', amount: '100', vat: '20' },
      { id: 'b', name: 'Subcontractor', amount: '500', vat: '0' },
    ];
    const c = compute(job);
    expect(c.matCharge).toBe(4400);
    expect(c.invoiceNet).toBe(8100);
    expect(c.extrasNet).toBe(600);
    expect(c.inVat).toBe(820);
    expect(c.profit).toBe(3500);
    expect(c.cis).toBe(740);
  });

  it('always has net cash plus CIS equal to profit', () => {
    const job = exampleJob();
    job.labourMode = 'fixed';
    job.fixedCharge = '2500';
    job.fixedCost = '900';
    job.cis = '30';
    job.vatMode = 'std';
    job.extras = [{ id: 'a', name: 'Plant', amount: '250', vat: '20' }];
    const c = compute(job);
    expect(c.netCash + c.cis).toBeCloseTo(c.profit, 2);
  });

  it('treats blank and invalid fields as zero', () => {
    const job = exampleJob();
    job.matCost = '';
    job.hours = 'abc';
    const c = compute(job);
    expect(c.invoiceNet).toBe(0);
    expect(c.margin).toBeNull();
  });

  it('works out the invoice needed for the target margin', () => {
    const job = exampleJob();
    job.hours = '10';
    job.target = '20';
    const c = compute(job);
    // costs are £4,000 of materials, so 20% margin needs £5,000
    expect(c.requiredInvoice).toBe(5000);
  });
});

import type { Job } from './types';

/** Parse a typed amount. Blank, negative or junk becomes 0. */
export const num = (v: string): number => {
  const x = parseFloat(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

export interface Calc {
  matCost: number;
  matVat: number;
  matCharge: number;
  markupOn: boolean;
  markupPct: number;

  byHours: boolean;
  hours: number;
  rate: number;
  labourCharge: number;
  labourCost: number;

  cisPct: number;
  cis: number;
  rc: boolean;

  extrasNet: number;
  extrasVat: number;
  extrasCount: number;

  invoiceNet: number;
  outVat: number;
  invoiceGross: number;
  cashIn: number;

  costsNet: number;
  profit: number;
  margin: number | null;
  markupOnCost: number | null;

  inVat: number;
  paidOut: number;
  netCash: number;

  target: number;
  requiredInvoice: number | null;
}

export function compute(job: Job): Calc {
  const matCost = num(job.matCost);
  const markupOn = job.matMode === 'markup';
  const markupPct = markupOn ? num(job.markupPct) : 0;
  const matCharge = r2(matCost * (1 + markupPct / 100));
  const matVat = r2(matCost * (job.matVat === '20' ? 0.2 : 0));

  const byHours = job.labourMode === 'hours';
  const hours = byHours ? num(job.hours) : 0;
  const rate = byHours ? num(job.rate) : 0;
  const labourCharge = byHours ? r2(hours * rate) : r2(num(job.fixedCharge));
  const labourCost = byHours ? r2(hours * num(job.costRate)) : r2(num(job.fixedCost));

  const cisPct = num(job.cis);
  const cis = r2((labourCharge * cisPct) / 100);
  const rc = job.vatMode === 'rc';

  let extrasNet = 0;
  let extrasVat = 0;
  let extrasCount = 0;
  for (const x of job.extras) {
    const a = num(x.amount);
    if (a > 0) extrasCount++;
    extrasNet += a;
    extrasVat += r2(a * (x.vat === '20' ? 0.2 : 0));
  }
  extrasNet = r2(extrasNet);
  extrasVat = r2(extrasVat);

  const invoiceNet = r2(matCharge + labourCharge);
  const outVat = rc ? 0 : r2(invoiceNet * 0.2);
  const invoiceGross = r2(invoiceNet + outVat);
  const cashIn = r2(invoiceGross - cis);

  const costsNet = r2(matCost + extrasNet + labourCost);
  const profit = r2(invoiceNet - costsNet);
  const margin = invoiceNet > 0 ? profit / invoiceNet : null;
  const markupOnCost = costsNet > 0 ? profit / costsNet : null;

  const inVat = r2(matVat + extrasVat);
  const paidOut = r2(costsNet + inVat);
  const netCash = r2(cashIn + inVat - outVat - paidOut);

  const target = num(job.target);
  const requiredInvoice =
    target > 0 && target < 100 && costsNet > 0 ? r2(costsNet / (1 - target / 100)) : null;

  return {
    matCost, matVat, matCharge, markupOn, markupPct,
    byHours, hours, rate, labourCharge, labourCost,
    cisPct, cis, rc,
    extrasNet, extrasVat, extrasCount,
    invoiceNet, outVat, invoiceGross, cashIn,
    costsNet, profit, margin, markupOnCost,
    inVat, paidOut, netCash,
    target, requiredInvoice,
  };
}

export type Tone = 'ok' | 'low' | 'loss' | 'neutral';

export function statusOf(c: Calc): { tone: Tone; label: string } {
  if (c.invoiceNet <= 0) return { tone: 'neutral', label: 'Add your charges' };
  if (c.profit < 0) return { tone: 'loss', label: 'Loss on this job' };
  if (c.target > 0 && c.margin !== null && c.margin * 100 < c.target) {
    return { tone: 'low', label: `Below ${plainNumber(c.target)}% target` };
  }
  return { tone: 'ok', label: c.target > 0 ? 'On target' : 'In profit' };
}

export const plainNumber = (n: number): string => String(+n.toFixed(2));

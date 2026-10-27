import type { Calc } from './calc';
import { plainNumber } from './calc';
import { money, pct } from './format';
import type { Job } from './types';

/** Plain-text summary for sharing or pasting into a message. */
export function summaryText(job: Job, c: Calc): string {
  const lines: string[] = [];
  lines.push(`Job: ${job.ref.trim() || '(no reference)'}`);
  lines.push(
    `Invoice, ex VAT: ${money(c.invoiceNet)} (materials ${money(c.matCharge)}${
      c.markupOn ? ` with ${plainNumber(c.markupPct)}% markup` : ' at cost'
    }, labour ${money(c.labourCharge)})`,
  );
  lines.push(c.rc ? 'VAT on invoice: 20% reverse charge, none charged' : `VAT on invoice: ${money(c.outVat)}`);
  lines.push(`CIS deducted: ${money(c.cis)}${c.cisPct > 0 ? ` (${plainNumber(c.cisPct)}% of labour)` : ''}`);
  lines.push(`Cash received: ${money(c.cashIn)}`);
  lines.push(`Materials: ${money(c.matCost)} + ${money(c.matVat)} VAT = ${money(c.matCost + c.matVat)}`);
  if (c.extrasNet > 0) lines.push(`Extra costs: ${money(c.extrasNet)} + ${money(c.extrasVat)} VAT`);
  if (c.labourCost > 0) lines.push(`Labour cost: ${money(c.labourCost)}`);
  lines.push(`Profit: ${money(c.profit)}${c.margin === null ? '' : ` (${pct(c.margin)} margin)`}`);
  lines.push(
    `Net cash generated: ${money(c.netCash)} (${money(c.cashIn)} + ${money(c.inVat)}${
      c.outVat > 0 ? ` − ${money(c.outVat)}` : ''
    } − ${money(c.paidOut)})`,
  );
  if (c.cis > 0) lines.push(`CIS credit to recover later: ${money(c.cis)}`);
  return lines.join('\n');
}

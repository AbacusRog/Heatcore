import type { Calc } from '../lib/calc';
import { plainNumber, statusOf } from '../lib/calc';
import { money, moneyS, pct } from '../lib/format';
import { Pill } from './ui';

type RowKind = 'normal' | 'total' | 'sub';

interface LedgerRow {
  label: string;
  amount: string;
  kind?: RowKind;
  /** Sign used to colour a total row. */
  sign?: number;
  note?: string;
}

function Ledger({ rows }: { rows: LedgerRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0 text-[0.95rem]">
      {rows.map((r, i) => {
        if (r.note) {
          return (
            <li key={i} className="pt-2 text-[0.85rem] text-muted">
              {r.note}
            </li>
          );
        }
        const kind = r.kind ?? 'normal';
        const wrap =
          kind === 'total'
            ? 'mt-1.5 border-t border-lineStrong pt-2.5 font-bold'
            : kind === 'sub'
              ? 'text-[0.85rem] text-muted'
              : '';
        const tone = kind === 'total' ? ((r.sign ?? 1) < 0 ? 'text-neg' : 'text-pos') : '';
        return (
          <li key={i} className={`flex items-end gap-2 py-1 ${wrap}`}>
            <span className="min-w-0">{r.label}</span>
            <span
              className="mb-[0.38em] min-w-4 flex-1 border-b border-dotted border-lineStrong"
              aria-hidden="true"
            />
            <span className={`whitespace-nowrap font-mono text-[0.9rem] tabular-nums ${tone}`}>
              {r.amount}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="mb-2 mt-0 text-[0.75rem] font-bold uppercase tracking-[0.08em] text-muted">
      {children}
    </h3>
  );
}

export default function Results({ c }: { c: Calc }) {
  const st = statusOf(c);

  const cashFormula = `${money(c.cashIn)} + ${money(c.inVat)}${
    c.outVat > 0 ? ` − ${money(c.outVat)}` : ''
  } − ${money(c.paidOut)}`;

  let targetLine = '';
  if (c.requiredInvoice !== null) {
    targetLine =
      c.invoiceNet >= c.requiredInvoice
        ? `The invoice could drop by ${money(c.invoiceNet - c.requiredInvoice)} ex VAT before the margin falls to your ${plainNumber(c.target)}% target.`
        : `To reach a ${plainNumber(c.target)}% margin, invoice at least ${money(c.requiredInvoice)} ex VAT, which is ${money(c.requiredInvoice - c.invoiceNet)} more than now.`;
  }

  const parts = [
    { l: 'Materials', v: c.matCost, col: 'var(--c-mat)' },
    { l: 'Extra costs', v: c.extrasNet, col: 'var(--c-extra)' },
    { l: 'Labour cost', v: c.labourCost, col: 'var(--c-lab)' },
    {
      l: c.profit < 0 ? 'Loss' : 'Profit',
      v: c.profit,
      col: c.profit < 0 ? 'var(--neg)' : 'var(--c-profit)',
    },
  ].filter((p) => p.v !== 0);
  const whole = Math.max(c.invoiceNet, c.costsNet);
  const barLabel = parts.length
    ? `Split of the invoice: ${parts.map((p) => `${p.l} ${money(p.v)}`).join(', ')}`
    : 'No figures entered yet';

  const invoice: LedgerRow[] = [
    {
      label: `Materials${c.markupOn ? ` (cost + ${plainNumber(c.markupPct)}% markup)` : ' (at cost)'}`,
      amount: money(c.matCharge),
    },
    {
      label: `Labour${c.byHours ? ` (${plainNumber(c.hours)} hrs × ${money(c.rate)})` : ' (fixed sum)'}`,
      amount: money(c.labourCharge),
    },
    { label: 'Invoice total, ex VAT', amount: money(c.invoiceNet), kind: 'total' },
    c.rc
      ? { label: 'VAT: 20% reverse charge, none on invoice', amount: money(0) }
      : { label: 'VAT at 20%', amount: money(c.outVat) },
    { label: 'Amount payable by customer', amount: money(c.invoiceGross) },
    {
      label:
        c.cisPct > 0
          ? `Less CIS deducted (${plainNumber(c.cisPct)}% of labour)`
          : 'CIS deduction (not under CIS)',
      amount: moneyS(-c.cis),
    },
    { label: 'Cash received', amount: money(c.cashIn), kind: 'total' },
  ];

  const profitRows: LedgerRow[] = [
    { label: 'Invoice value, ex VAT', amount: money(c.invoiceNet) },
    { label: 'Materials cost', amount: moneyS(-c.matCost) },
  ];
  if (c.extrasNet > 0) profitRows.push({ label: `Extra costs (${c.extrasCount})`, amount: moneyS(-c.extrasNet) });
  if (c.labourCost > 0) profitRows.push({ label: 'Labour cost', amount: moneyS(-c.labourCost) });
  profitRows.push({ label: 'Profit', amount: money(c.profit), kind: 'total', sign: c.profit });
  profitRows.push({
    label: 'Profit margin (profit ÷ invoice)',
    amount: c.margin === null ? 'n/a' : pct(c.margin),
    kind: 'sub',
  });
  profitRows.push({
    label: 'Markup on costs (profit ÷ costs)',
    amount: c.markupOnCost === null ? 'n/a' : pct(c.markupOnCost),
    kind: 'sub',
  });
  if (c.cis > 0) {
    profitRows.push({
      label: '',
      amount: '',
      note: `CIS of ${money(c.cis)} is a tax credit, not a cost, so it is not taken off profit.`,
    });
  }

  const cashRows: LedgerRow[] = [
    { label: `Cash received from customer${c.cis > 0 ? ' (after CIS)' : ''}`, amount: moneyS(c.cashIn) },
    { label: 'Materials paid, inc VAT', amount: moneyS(-(c.matCost + c.matVat)) },
  ];
  if (c.extrasNet > 0) cashRows.push({ label: 'Extra costs paid, inc VAT', amount: moneyS(-(c.extrasNet + c.extrasVat)) });
  if (c.labourCost > 0) cashRows.push({ label: 'Labour cost paid', amount: moneyS(-c.labourCost) });
  cashRows.push({ label: 'VAT reclaimed on purchases', amount: moneyS(c.inVat) });
  if (!c.rc) cashRows.push({ label: 'VAT due to HMRC on this invoice', amount: moneyS(-c.outVat) });
  cashRows.push({ label: 'Net cash generated', amount: money(c.netCash), kind: 'total', sign: c.netCash });
  if (c.cis > 0) {
    cashRows.push({ label: 'CIS credit to recover later', amount: moneyS(c.cis), kind: 'sub' });
    cashRows.push({ label: 'Cash once the CIS credit is recovered', amount: money(c.netCash + c.cis), kind: 'sub' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.07em] text-muted">Profit</span>
          <span
            className={`break-words font-mono text-[1.3rem] font-semibold leading-tight tabular-nums ${c.profit < 0 ? 'text-neg' : 'text-pos'}`}
          >
            {money(c.profit)}
          </span>
          <span className="text-[0.8rem] text-muted">
            {c.margin === null ? 'No margin yet' : `${pct(c.margin)} margin, ex VAT`}
          </span>
          <span className="break-words font-mono text-[0.72rem] text-muted">
            {money(c.invoiceNet)} {'−'} {money(c.costsNet)}
          </span>
          <span className="mt-1.5 self-start">
            <Pill tone={st.tone}>{st.label}</Pill>
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.07em] text-muted">Net cash</span>
          <span
            className={`break-words font-mono text-[1.3rem] font-semibold leading-tight tabular-nums ${c.netCash < 0 ? 'text-neg' : 'text-pos'}`}
          >
            {money(c.netCash)}
          </span>
          <span className="text-[0.8rem] text-muted">After VAT and CIS</span>
          <span className="break-words font-mono text-[0.72rem] text-muted">{cashFormula}</span>
        </div>
      </div>

      {targetLine && <p className="m-0 text-[0.92rem] text-muted">{targetLine}</p>}

      <div>
        <Heading>Where the invoice goes</Heading>
        <div
          className="flex h-3.5 overflow-hidden rounded-[7px] bg-line"
          role="img"
          aria-label={barLabel}
        >
          {parts
            .filter((p) => p.v > 0 && whole > 0)
            .map((p) => (
              <i
                key={p.l}
                className="block h-full border-r-2 border-surface last:border-r-0"
                style={{ flex: `0 0 ${((p.v / whole) * 100).toFixed(3)}%`, background: p.col }}
              />
            ))}
        </div>
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[0.92rem]">
          {parts.map((p) => (
            <li key={p.l} className="grid grid-cols-[12px_minmax(0,1fr)_auto_52px] items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.col }} />
              <span>{p.l}</span>
              <span className="whitespace-nowrap text-right font-mono text-[0.85rem] tabular-nums">{money(p.v)}</span>
              <span className="text-right font-mono text-[0.8rem] tabular-nums text-muted">
                {c.invoiceNet > 0 ? pct(p.v / c.invoiceNet) : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Heading>Invoice</Heading>
        <Ledger rows={invoice} />
      </div>
      <div>
        <Heading>Profit</Heading>
        <Ledger rows={profitRows} />
      </div>
      <div>
        <Heading>Cashflow</Heading>
        <Ledger rows={cashRows} />
      </div>

      <details className="border-t border-line pt-3.5 text-[0.92rem] text-muted">
        <summary className="cursor-pointer font-semibold text-fg">How this is worked out</summary>
        <ul className="m-0 mt-2.5 flex flex-col gap-1.5 pl-[18px]">
          <li>
            Profit is the invoice ex VAT, less materials, extra costs and your labour cost. VAT is neither income nor
            cost.
          </li>
          <li>
            CIS is taken from the labour only, before VAT and excluding materials. It is held back from your payment
            but counts as a tax credit, so it reduces cash now and not profit.
          </li>
          <li>
            Net cash adds back the VAT you reclaim on purchases and takes off any VAT you collect for HMRC. The reclaim
            comes with your VAT return, so it lands later than the invoice payment.
          </li>
          <li>Under reverse charge the invoice carries no VAT. Your customer accounts for the 20% themselves.</li>
        </ul>
      </details>
    </div>
  );
}

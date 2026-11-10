import { RC_NOTE, docTotals, fmtDate, kindLabel, kindTag, kindTotals, lineTotal, lineUsed } from '../lib/docs';
import { money } from '../lib/format';
import { plainNumber, num } from '../lib/calc';
import type { DocData, LineKind } from '../lib/types';

/** The quote or invoice as the customer sees it. Always on white paper so it prints and saves cleanly. */
export default function DocView({ doc }: { doc: DocData }) {
  const t = docTotals(doc.lines, doc.vat_mode);
  const shown = doc.lines.filter((l) => l.desc.trim() || lineUsed(l));
  const byKind = kindTotals(doc.lines.filter(lineUsed));
  const kindsPresent = (Object.keys(byKind) as LineKind[]).filter((k) => byKind[k] > 0);
  const showStd = doc.vat_mode === 'std' || t.vat > 0;
  const showRc = doc.vat_mode === 'rc' || t.rcVat > 0;
  const b = doc.business;
  const isQuote = doc.kind === 'quote';
  // Until a logo is uploaded in Settings, the documents carry the Heatcore Solutions logo.
  const ownLogo = Boolean(b.logo);
  const logo = b.logo || '/heatcore-logo.jpg';

  return (
    <article className="paper print-area flex flex-col gap-5 overflow-hidden rounded-xl border border-neutral-300 bg-white p-5 text-[0.95rem] text-neutral-900">
      <div className="heat-strip -mx-5 -mt-5 h-2" aria-hidden="true" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <img
            src={logo}
            alt={b.name ? `${b.name} logo` : 'Logo'}
            className={ownLogo ? 'max-h-16 max-w-[200px] self-start object-contain' : 'h-28 w-auto self-start object-contain'}
          />
          <div className="text-[0.88rem] leading-snug text-neutral-700">
            {b.name && ownLogo && <div className="text-[1rem] font-bold text-heat-navy">{b.name}</div>}
            {b.address && <div className="whitespace-pre-line">{b.address}</div>}
            {b.phone && <div>{b.phone}</div>}
            {b.email && <div>{b.email}</div>}
            {b.vat_number && <div>VAT no. {b.vat_number}</div>}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 sm:text-right">
          <h2 className="m-0 text-[1.6rem] font-bold uppercase leading-none tracking-tight text-heat-navy">{isQuote ? 'Quote' : 'Invoice'}</h2>
          <div className="font-mono text-[0.95rem] font-semibold text-heat-blue">{doc.number}</div>
          <div className="text-[0.85rem] text-neutral-600">Date {fmtDate(doc.issue_date)}</div>
          {doc.end_date && (
            <div className="text-[0.85rem] text-neutral-600">
              {isQuote ? 'Valid until' : 'Due'} {fmtDate(doc.end_date)}
            </div>
          )}
        </div>
      </header>

      <section aria-label="Customer" className="text-[0.92rem] leading-snug">
        <div className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-heat-blue">{isQuote ? 'Prepared for' : 'Bill to'}</div>
        <div className="font-semibold">{doc.customer_name || 'Customer name'}</div>
        {doc.customer_address && <div className="whitespace-pre-line text-neutral-700">{doc.customer_address}</div>}
      </section>

      {doc.title.trim() && <h3 className="m-0 text-[1.05rem] font-bold leading-snug text-heat-navy">{doc.title}</h3>}

      <section aria-label="Items">
        <ul className="m-0 list-none border-t-2 border-heat-navy p-0">
          {shown.length === 0 && <li className="py-3 text-neutral-500">No items yet.</li>}
          {shown.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 border-b border-neutral-200 py-3">
              <div className="min-w-0">
                <div className="whitespace-pre-line break-words font-medium">{l.desc.trim() || 'Item'}</div>
                {kindTag(l) && <div className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-heat-ink">{kindTag(l)}</div>}
                {num(l.qty) !== 1 && (
                  <div className="font-mono text-[0.8rem] text-neutral-600">
                    {plainNumber(num(l.qty))} × {money(num(l.price))}
                  </div>
                )}
              </div>
              <div className="shrink-0 font-mono font-semibold tabular-nums">{money(lineTotal(l))}</div>
            </li>
          ))}
        </ul>

        <dl className="m-0 mt-3 ml-auto flex max-w-[300px] flex-col gap-1.5 text-[0.92rem]">
          {kindsPresent.length > 1 &&
            kindsPresent.map((k) => (
              <div key={k} className="flex justify-between gap-4 text-[0.85rem] text-neutral-600">
                <dt>{kindLabel[k]}</dt>
                <dd className="m-0 font-mono tabular-nums">{money(byKind[k])}</dd>
              </div>
            ))}
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-700">Subtotal</dt>
            <dd className="m-0 font-mono tabular-nums">{money(t.net)}</dd>
          </div>
          {showStd && (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-700">VAT at 20%</dt>
              <dd className="m-0 font-mono tabular-nums">{money(t.vat)}</dd>
            </div>
          )}
          {showRc && (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-700">VAT at 20% (reverse charge)</dt>
              <dd className="m-0 font-mono tabular-nums">{money(0)}</dd>
            </div>
          )}
          {doc.vat_mode === 'none' && (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-700">VAT</dt>
              <dd className="m-0 font-mono tabular-nums">Not charged</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between gap-4 rounded-lg bg-heat-navy px-3 py-2 text-[1.1rem] font-bold text-white">
            <dt>Total</dt>
            <dd className="m-0 font-mono tabular-nums">{money(t.gross)}</dd>
          </div>
        </dl>

        {t.rcVat > 0 && (
          <p className="m-0 mt-3 rounded-lg border-l-4 border-heat-blue bg-heat-tint px-3 py-2.5 text-[0.85rem] leading-snug text-neutral-800">
            {RC_NOTE} VAT of {money(t.rcVat)} at 20% is due from you, not from {b.name || 'us'}.
          </p>
        )}
      </section>

      {doc.notes.trim() && (
        <section aria-label="Notes" className="text-[0.88rem] leading-snug">
          <div className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-heat-blue">Notes</div>
          <div className="whitespace-pre-line text-neutral-800">{doc.notes}</div>
        </section>
      )}

      {!isQuote && b.bank?.trim() && (
        <section aria-label="Payment details" className="text-[0.88rem] leading-snug">
          <div className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-heat-blue">How to pay</div>
          <div className="whitespace-pre-line text-neutral-800">{b.bank}</div>
        </section>
      )}

      {b.terms?.trim() && (
        <section aria-label="Terms" className="border-t-2 border-heat-orange pt-3 text-[0.8rem] leading-snug text-neutral-600">
          <div className="whitespace-pre-line">{b.terms}</div>
        </section>
      )}
    </article>
  );
}

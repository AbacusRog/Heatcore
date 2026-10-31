import { lineTotal, newLine } from '../lib/docs';
import { money } from '../lib/format';
import type { DocLine } from '../lib/types';
import { cleanNumber } from './ui';

export default function LineEditor({ lines, onChange }: { lines: DocLine[]; onChange: (l: DocLine[]) => void }) {
  const patch = (id: string, p: Partial<DocLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));

  return (
    <div className="flex flex-col gap-3">
      {lines.map((l, i) => (
        <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface2 p-3">
          <textarea
            id={`l-${l.id}-desc`}
            rows={2}
            className="input h-auto min-h-12 bg-surface py-2.5 leading-snug"
            aria-label={`Line ${i + 1} description`}
            placeholder="What it is, e.g. Boiler supply and fit"
            value={l.desc}
            onChange={(e) => patch(l.id, { desc: e.target.value })}
          />
          <div className="grid grid-cols-[88px_1fr] gap-2">
            <div className="affix bg-surface">
              <input
                id={`l-${l.id}-qty`}
                type="text"
                inputMode="decimal"
                aria-label={`Line ${i + 1} quantity`}
                placeholder="Qty"
                autoComplete="off"
                value={l.qty}
                onChange={(e) => patch(l.id, { qty: cleanNumber(e.target.value) })}
              />
            </div>
            <div className="affix bg-surface">
              <span className="pl-3">£</span>
              <input
                id={`l-${l.id}-price`}
                type="text"
                inputMode="decimal"
                aria-label={`Line ${i + 1} price each, ex VAT`}
                placeholder="Price each, ex VAT"
                autoComplete="off"
                value={l.price}
                onChange={(e) => patch(l.id, { price: cleanNumber(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="h-10 px-1 text-[0.9rem] font-semibold text-neg"
              onClick={() => onChange(lines.length > 1 ? lines.filter((x) => x.id !== l.id) : [newLine()])}
              aria-label={`Remove line ${i + 1}`}
            >
              Remove
            </button>
            <span className="font-mono text-[0.95rem] font-semibold tabular-nums">{money(lineTotal(l))}</span>
          </div>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => onChange([...lines, newLine()])}>
        + Add a line
      </button>
    </div>
  );
}

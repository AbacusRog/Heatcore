import { newId } from '../lib/defaults';
import type { ExtraCost, PurchaseVat } from '../lib/types';
import { cleanNumber } from './ui';

const PRESETS: { label: string; name: string; vat: PurchaseVat }[] = [
  { label: '+ Fuel', name: 'Fuel', vat: '20' },
  { label: '+ Subcontractor', name: 'Subcontractor', vat: '0' },
  { label: '+ Plant hire', name: 'Plant hire', vat: '20' },
  { label: '+ Other', name: '', vat: '20' },
];

export default function ExtraCosts({
  extras,
  onChange,
}: {
  extras: ExtraCost[];
  onChange: (extras: ExtraCost[]) => void;
}) {
  const patch = (id: string, p: Partial<ExtraCost>) =>
    onChange(extras.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className="flex flex-col gap-3">
      {extras.length === 0 && (
        <p className="rounded-lg bg-surface2 px-3 py-2.5 text-[0.9rem] text-muted">
          No extra costs yet. Add fuel, subcontractors or plant hire below.
        </p>
      )}

      {extras.map((x) => (
        <div key={x.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface2 p-3">
          <input
            id={`x-${x.id}-name`}
            className="input bg-surface"
            type="text"
            aria-label="Description"
            placeholder="Description"
            autoComplete="off"
            value={x.name}
            onChange={(e) => patch(x.id, { name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="affix bg-surface">
              <span className="pl-3">£</span>
              <input
                id={`x-${x.id}-amount`}
                type="text"
                inputMode="decimal"
                aria-label="Amount ex VAT"
                placeholder="0.00"
                autoComplete="off"
                value={x.amount}
                onChange={(e) => patch(x.id, { amount: cleanNumber(e.target.value) })}
              />
            </div>
            <select
              id={`x-${x.id}-vat`}
              className="input"
              aria-label="VAT on this cost"
              value={x.vat}
              onChange={(e) => patch(x.id, { vat: e.target.value as PurchaseVat })}
            >
              <option value="20">20% VAT</option>
              <option value="0">No VAT</option>
            </select>
          </div>
          <button
            type="button"
            className="-mb-1 h-10 self-end px-1 text-[0.9rem] font-semibold text-neg"
            onClick={() => onChange(extras.filter((e) => e.id !== x.id))}
            aria-label={`Remove ${x.name || 'this cost'}`}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Add an extra cost">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="chip"
            onClick={() => onChange([...extras, { id: newId(), name: p.name, amount: '', vat: p.vat }])}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

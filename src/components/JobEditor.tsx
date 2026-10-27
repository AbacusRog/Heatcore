import { useMemo, useState } from 'react';
import { compute, plainNumber } from '../lib/calc';
import { money, pct } from '../lib/format';
import { summaryText } from '../lib/summary';
import type { Job } from '../lib/types';
import ExtraCosts from './ExtraCosts';
import Results from './Results';
import type { SyncStatus } from '../lib/useJobs';
import { NumField, Section, Seg, SyncBadge } from './ui';

type Tab = 'inputs' | 'results';

interface Props {
  job: Job;
  status: SyncStatus;
  onChange: (job: Job) => void;
  onBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

export default function JobEditor({ job, status, onChange, onBack, onDuplicate, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>('inputs');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState('');
  const [box, setBox] = useState('');
  const c = useMemo(() => compute(job), [job]);

  const set = <K extends keyof Job>(k: K, v: Job[K]) => onChange({ ...job, [k]: v });

  const switchTab = (t: Tab) => {
    setTab(t);
    window.scrollTo(0, 0);
  };

  async function share() {
    const text = summaryText(job, c);
    setBox('');
    try {
      if (navigator.share) {
        await navigator.share({ title: job.ref.trim() || 'Job summary', text });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote('Summary copied.');
    } catch {
      setBox(text);
      setNote('Copy the summary from the box below.');
    }
  }

  const matLine = `${money(c.matCost)} + ${money(c.matVat)} VAT = ${money(c.matCost + c.matVat)} paid. Charged out at ${money(c.matCharge)}${
    c.markupOn ? ` (${plainNumber(c.markupPct)}% markup).` : ' (at cost).'
  }`;
  const labLine =
    (c.byHours
      ? `${plainNumber(c.hours)} hrs × ${money(c.rate)} = ${money(c.labourCharge)} charged.`
      : `${money(c.labourCharge)} charged.`) +
    (c.cisPct > 0 ? ` CIS at ${plainNumber(c.cisPct)}% holds back ${money(c.cis)}.` : ' No CIS deduction.') +
    (c.labourCost > 0 ? ` Costs you ${money(c.labourCost)}.` : '');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[560px] items-center gap-1 px-2 pt-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to jobs"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg"
          >
            <Chevron dir="left" />
          </button>
          <input
            id="jobRef"
            type="text"
            aria-label="Job name or address"
            placeholder="Job name or address"
            autoComplete="off"
            value={job.ref}
            onChange={(e) => set('ref', e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent pr-2 text-[1.1rem] font-bold text-fg outline-offset-0"
          />
          <span className="shrink-0 pr-2">
            <SyncBadge status={status} short />
          </span>
        </div>
        <div className="mx-auto max-w-[560px] px-4 pb-3 pt-1">
          <div role="tablist" aria-label="Job view" className="flex overflow-hidden rounded-lg border border-lineStrong bg-surface">
            {(['inputs', 'results'] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                onClick={() => switchTab(t)}
                className={`h-11 flex-1 text-[0.95rem] font-semibold ${i > 0 ? 'border-l border-lineStrong' : ''} ${
                  tab === t ? 'bg-accent text-accentInk' : 'text-fg'
                }`}
              >
                {t === 'inputs' ? 'Figures' : 'Results'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main
        className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-4"
        style={{ paddingBottom: 'calc(112px + env(safe-area-inset-bottom))' }}
      >
        {tab === 'inputs' ? (
          <div id="panel-inputs" role="tabpanel" aria-labelledby="tab-inputs" className="flex flex-col gap-4">
            <Section title="Materials">
              <NumField id="matCost" label="Bought, ex VAT" prefix="£" value={job.matCost} onChange={(v) => set('matCost', v)} />
              <Seg
                legend="VAT on the purchase"
                name="matVat"
                value={job.matVat}
                onChange={(v) => set('matVat', v)}
                options={[
                  { value: '20', label: '20% VAT' },
                  { value: '0', label: 'No VAT' },
                ]}
              />
              <p className="rounded-lg bg-surface2 px-3 py-2.5 text-[0.88rem] text-muted">{matLine}</p>
              <Seg
                legend="Charge materials out"
                name="matMode"
                value={job.matMode}
                onChange={(v) => set('matMode', v)}
                options={[
                  { value: 'cost', label: 'At cost' },
                  { value: 'markup', label: 'With markup' },
                ]}
              />
              {job.matMode === 'markup' && (
                <NumField id="markupPct" label="Markup on cost" suffix="%" placeholder="0" value={job.markupPct} onChange={(v) => set('markupPct', v)} />
              )}
            </Section>

            <Section title="Labour">
              <Seg
                legend="Charge labour by"
                name="labourMode"
                value={job.labourMode}
                onChange={(v) => set('labourMode', v)}
                options={[
                  { value: 'hours', label: 'Hours × rate' },
                  { value: 'fixed', label: 'Fixed sum' },
                ]}
              />
              {job.labourMode === 'hours' ? (
                <>
                  <NumField id="hours" label="Hours" suffix="hrs" placeholder="0" value={job.hours} onChange={(v) => set('hours', v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <NumField id="rate" label="Charge-out rate" prefix="£" suffix="/hr" value={job.rate} onChange={(v) => set('rate', v)} />
                    <NumField id="costRate" label="Your cost" prefix="£" suffix="/hr" value={job.costRate} onChange={(v) => set('costRate', v)} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <NumField id="fixedCharge" label="Charge, ex VAT" prefix="£" value={job.fixedCharge} onChange={(v) => set('fixedCharge', v)} />
                  <NumField id="fixedCost" label="Your cost" prefix="£" value={job.fixedCost} onChange={(v) => set('fixedCost', v)} />
                </div>
              )}
              <p className="hint">Your cost is what the labour costs you in wages or subcontract pay. Leave it at zero to treat the whole charge as margin.</p>
              <Seg
                legend="Is the labour under CIS?"
                name="cis"
                value={job.cis}
                onChange={(v) => set('cis', v)}
                options={[
                  { value: '20', label: 'CIS 20%' },
                  { value: '30', label: 'CIS 30%' },
                  { value: '0', label: 'No CIS' },
                ]}
              />
              <p className="rounded-lg bg-surface2 px-3 py-2.5 text-[0.88rem] text-muted">{labLine}</p>
            </Section>

            <Section title="VAT on your invoice">
              <Seg
                legend="VAT rate charged"
                name="vatMode"
                value={job.vatMode}
                onChange={(v) => set('vatMode', v)}
                options={[
                  { value: 'std', label: '20% VAT' },
                  { value: 'rc', label: '20% reverse charge' },
                ]}
              />
              <p className="hint">
                {c.rc
                  ? 'The invoice shows no VAT. Your customer accounts for the 20% under the domestic reverse charge. You still reclaim VAT on your purchases.'
                  : 'The invoice adds 20% VAT, which you hold for HMRC and pay over on your VAT return.'}
              </p>
            </Section>

            <Section title="Extra costs" note="Fuel, subcontractors, plant hire and anything else the job cost you. Use No VAT for reverse-charged or VAT-exempt costs.">
              <ExtraCosts extras={job.extras} onChange={(x) => set('extras', x)} />
            </Section>

            <Section title="Target margin">
              <NumField id="target" label="Margin you want on a job" suffix="%" placeholder="0" value={job.target} onChange={(v) => set('target', v)} />
              <p className="hint">Margin is profit as a share of the invoice, ex VAT.</p>
            </Section>
          </div>
        ) : (
          <div id="panel-results" role="tabpanel" aria-labelledby="tab-results" className="flex flex-col gap-6">
            <Results c={c} />

            <section className="card flex flex-col gap-3" aria-label="Job actions">
              <button type="button" className="btn btn-primary" onClick={share}>
                Share summary
              </button>
              {note && (
                <p role="status" className="hint m-0">
                  {note}
                </p>
              )}
              {box && (
                <textarea
                  readOnly
                  rows={9}
                  aria-label="Job summary"
                  value={box}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-lineStrong bg-surface2 p-3 font-mono text-[0.8rem] text-fg"
                />
              )}
              <button type="button" className="btn" onClick={onDuplicate}>
                Duplicate job
              </button>
              {confirmDelete ? (
                <div className="flex flex-col gap-2 rounded-lg bg-negSoft p-3">
                  <p className="m-0 text-[0.92rem] text-neg">Delete this job? This cannot be undone.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                    <button type="button" className="btn btn-danger" onClick={onDelete}>
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  Delete job
                </button>
              )}
            </section>
          </div>
        )}
      </main>

      {tab === 'inputs' && (
        <button
          type="button"
          onClick={() => switchTab('results')}
          aria-label={`Profit ${money(c.profit)}, net cash ${money(c.netCash)}. Open the full breakdown.`}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-lineStrong bg-surface text-left text-fg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <span className="mx-auto grid max-w-[560px] grid-cols-[1fr_1fr_auto] items-center gap-3 px-4 py-2.5">
            <span className="block min-w-0">
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.07em] text-muted">Profit</span>
              <span className={`block font-mono text-[1.05rem] font-semibold tabular-nums ${c.profit < 0 ? 'text-neg' : 'text-pos'}`}>
                {money(c.profit)}
              </span>
              <span className="block text-[0.75rem] text-muted">{c.margin === null ? ' ' : `${pct(c.margin)} margin`}</span>
            </span>
            <span className="block min-w-0">
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.07em] text-muted">Net cash</span>
              <span className={`block font-mono text-[1.05rem] font-semibold tabular-nums ${c.netCash < 0 ? 'text-neg' : 'text-pos'}`}>
                {money(c.netCash)}
              </span>
              <span className="block text-[0.75rem] text-muted">after VAT and CIS</span>
            </span>
            <span className="text-muted">
              <Chevron dir="right" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

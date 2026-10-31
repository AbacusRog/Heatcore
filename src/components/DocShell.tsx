import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Tone } from '../lib/calc';
import { docTotals, invoiceDoc, quoteDoc } from '../lib/docs';
import { money } from '../lib/format';
import type { DocData, DocLine, Invoice, Quote, Settings, VatMode } from '../lib/types';
import { errorText } from '../lib/useData';
import DocView from './DocView';
import LineEditor from './LineEditor';
import { Notice, Pill, Section, Seg, TextField } from './ui';

export interface FormState {
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  lines: DocLine[];
  vat_mode: VatMode;
  notes: string;
  issue_date: string;
  /** Quote: valid until. Invoice: due date. */
  end_date: string;
}

export const formFrom = (kind: 'quote' | 'invoice', d: Quote | Invoice): FormState => ({
  customer_name: d.customer_name,
  customer_email: d.customer_email,
  customer_address: d.customer_address,
  title: d.title,
  lines: d.lines,
  vat_mode: d.vat_mode,
  notes: d.notes,
  issue_date: d.issue_date,
  end_date: (kind === 'quote' ? (d as Quote).valid_until : (d as Invoice).due_date) ?? '',
});

export const patchFrom = (kind: 'quote' | 'invoice', f: FormState): Record<string, unknown> => {
  const base = {
    customer_name: f.customer_name,
    customer_email: f.customer_email,
    customer_address: f.customer_address,
    title: f.title,
    lines: f.lines,
    vat_mode: f.vat_mode,
    notes: f.notes,
    issue_date: f.issue_date || undefined,
  };
  return kind === 'quote' ? { ...base, valid_until: f.end_date || null } : { ...base, due_date: f.end_date || null };
};

export interface ShellApi {
  /** Save anything typed but not yet saved. Throws if it cannot be saved. */
  flush: () => Promise<void>;
  /** The document including anything just typed. */
  current: Quote | Invoice;
}

interface Props {
  kind: 'quote' | 'invoice';
  doc: Quote | Invoice;
  settings: Settings;
  pill: { tone: Tone; label: string };
  onSave: (patch: Record<string, unknown>) => Promise<unknown>;
  onBack: () => void;
  onSettings: () => void;
  /** Messages shown above the document once it is no longer a draft. */
  top?: ReactNode;
  actions: (api: ShellApi) => ReactNode;
}

const Chevron = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export default function DocShell({ kind, doc, settings, pill, onSave, onBack, onSettings, top, actions }: Props) {
  const draft = doc.status === 'draft';
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [form, setForm] = useState<FormState>(() => formFrom(kind, doc));
  const formRef = useRef(form);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const save = useRef(onSave);
  save.current = onSave;
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      await save.current(patchFrom(kind, formRef.current));
      setSaveState('saved');
      setSaveError('');
    } catch (e) {
      dirty.current = true;
      setSaveState('error');
      setSaveError(errorText(e));
      throw e;
    }
  }, [kind]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (dirty.current) void flush().catch(() => undefined);
    },
    [flush],
  );

  const change = (p: Partial<FormState>) => {
    const next = { ...formRef.current, ...p };
    formRef.current = next;
    setForm(next);
    dirty.current = true;
    setSaveState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush().catch(() => undefined), 700);
  };

  const current = (draft ? { ...doc, ...patchFrom(kind, form), issue_date: form.issue_date || doc.issue_date } : doc) as Quote | Invoice;
  const data: DocData = kind === 'quote' ? quoteDoc(current as Quote, settings) : invoiceDoc(current as Invoice, settings);
  const totals = docTotals(current.lines, current.vat_mode);

  const back = async () => {
    try {
      await flush();
      onBack();
    } catch {
      /* the error is shown; stay so nothing typed is lost */
    }
  };

  const goTab = (t: 'edit' | 'preview') => {
    setTab(t);
    window.scrollTo(0, 0);
  };

  const noun = kind === 'quote' ? 'Quote' : 'Invoice';
  const showForm = draft && tab === 'edit';

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[560px] items-center gap-1 px-2 pt-2">
          <button type="button" onClick={() => void back()} aria-label={`Back to ${kind}s`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg">
            <Chevron />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.1rem] font-bold">
              {noun} <span className="font-mono">{doc.number}</span>
            </div>
          </div>
          <span className="shrink-0 pr-2">
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </span>
        </div>
        <div className="mx-auto max-w-[560px] px-4 pb-3 pt-1">
          {draft ? (
            <div role="tablist" aria-label={`${noun} view`} className="flex overflow-hidden rounded-lg border border-lineStrong bg-surface">
              {(['edit', 'preview'] as const).map((t, i) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => goTab(t)}
                  className={`h-11 flex-1 text-[0.95rem] font-semibold ${i > 0 ? 'border-l border-lineStrong' : ''} ${tab === t ? 'bg-accent text-accentInk' : 'text-fg'}`}
                >
                  {t === 'edit' ? 'Details' : 'Preview and send'}
                </button>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[0.8rem] text-muted">
              {noun} for {doc.customer_name || 'customer'} · {money(totals.gross)}
            </p>
          )}
          {saveState === 'saving' && <p className="m-0 mt-1 text-[0.78rem] text-muted">Saving…</p>}
          {saveState === 'saved' && <p className="m-0 mt-1 text-[0.78rem] text-muted">Saved</p>}
          {saveState === 'error' && (
            <p role="alert" className="m-0 mt-1 text-[0.8rem] text-neg">
              Could not save. {saveError}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-4" style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
        {showForm ? (
          <>
            <Section title="Customer">
              <TextField id="cname" label="Name" value={form.customer_name} onChange={(v) => change({ customer_name: v })} autoComplete="off" />
              <TextField id="cemail" label="Email" type="email" inputMode="email" value={form.customer_email} onChange={(v) => change({ customer_email: v })} />
              <TextField id="caddr" label="Address" rows={3} value={form.customer_address} onChange={(v) => change({ customer_address: v })} />
            </Section>

            <Section title={`${noun} details`}>
              <TextField id="ctitle" label="What is the work?" placeholder="e.g. Bathroom refit at 14 Elm Road" value={form.title} onChange={(v) => change({ title: v })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField id="cdate" label="Date" type="date" value={form.issue_date} onChange={(v) => change({ issue_date: v })} />
                <TextField id="cend" label={kind === 'quote' ? 'Valid until' : 'Due date'} type="date" value={form.end_date} onChange={(v) => change({ end_date: v })} />
              </div>
              <Seg
                legend="VAT"
                name="docVat"
                value={form.vat_mode}
                onChange={(v) => change({ vat_mode: v })}
                options={[
                  { value: 'std', label: '20% VAT' },
                  { value: 'rc', label: '20% reverse charge' },
                  { value: 'none', label: 'No VAT' },
                ]}
              />
            </Section>

            <Section title="Items" note="Prices are each, before VAT. The customer sees these lines and the totals, never your costs.">
              <LineEditor lines={form.lines} onChange={(lines) => change({ lines })} />
            </Section>

            <Section title="Notes" note="Optional. Shown on the document, e.g. access arrangements or what is not included.">
              <TextField id="cnotes" label="Notes for the customer" rows={4} value={form.notes} onChange={(v) => change({ notes: v })} />
            </Section>
          </>
        ) : (
          <>
            {draft && !settings.business_name.trim() && (
              <div className="no-print">
                <Notice tone="warn">
                  Your business name and logo are not set yet, so they won’t appear.{' '}
                  <button type="button" className="font-bold underline" onClick={onSettings}>
                    Add them in Settings
                  </button>
                </Notice>
              </div>
            )}
            {top && <div className="no-print flex flex-col gap-3">{top}</div>}
            <DocView doc={data} />
            <div className="no-print flex flex-col gap-3">{actions({ flush, current })}</div>
          </>
        )}
      </main>

      {showForm && (
        <button
          type="button"
          onClick={() => goTab('preview')}
          aria-label={`Total ${money(totals.gross)}. Preview and send.`}
          className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-lineStrong bg-surface text-left text-fg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <span className="mx-auto flex max-w-[560px] items-center justify-between gap-3 px-4 py-3">
            <span className="block">
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.07em] text-muted">Total{current.vat_mode === 'std' ? ' inc VAT' : ''}</span>
              <span className="block font-mono text-[1.15rem] font-semibold tabular-nums">{money(totals.gross)}</span>
            </span>
            <span className="btn btn-primary">Preview and send</span>
          </span>
        </button>
      )}
    </div>
  );
}


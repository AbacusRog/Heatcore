import type { Tone } from '../lib/calc';
import { fmtDate } from '../lib/docs';
import { money } from '../lib/format';
import { ActionBar, Notice, Pill } from './ui';

export interface DocRow {
  id: string;
  number: string;
  customer: string;
  title: string;
  total: number;
  date: string;
  pill: { tone: Tone; label: string };
}

export default function DocList({
  heading,
  blurb,
  rows,
  loaded,
  error,
  emptyTitle,
  emptyText,
  newLabel,
  onNew,
  onOpen,
  busy,
}: {
  heading: string;
  blurb: string;
  rows: DocRow[];
  loaded: boolean;
  error: string;
  emptyTitle: string;
  emptyText: string;
  newLabel: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto flex max-w-[560px] flex-col gap-4 px-4"
        style={{
          paddingTop: 'calc(20px + env(safe-area-inset-top))',
          paddingBottom: 'calc(var(--nav-h) + 110px + env(safe-area-inset-bottom))',
        }}
      >
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[1.7rem] font-bold leading-tight tracking-tight">{heading}</h1>
          <p className="m-0 text-[0.95rem] text-muted">{blurb}</p>
        </header>

        {error && <Notice tone="bad">{error}</Notice>}

        {loaded && rows.length === 0 && !error && (
          <section className="card flex flex-col gap-2" aria-label={emptyTitle}>
            <h2 className="m-0 text-[1.05rem] font-bold">{emptyTitle}</h2>
            <p className="hint m-0">{emptyText}</p>
          </section>
        )}

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left text-fg"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[1.02rem] font-semibold">{r.customer.trim() || 'No customer yet'}</span>
                  <span className="truncate text-[0.85rem] text-muted">
                    <span className="font-mono">{r.number}</span>
                    {r.title.trim() ? ` · ${r.title.trim()}` : ''}
                  </span>
                  <span className="mt-1.5 self-start">
                    <Pill tone={r.pill.tone}>{r.pill.label}</Pill>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-[1.05rem] font-semibold tabular-nums">{money(r.total)}</span>
                  <span className="text-[0.75rem] text-muted">{fmtDate(r.date)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>

      <ActionBar>
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={onNew}>
          {busy ? 'Creating…' : newLabel}
        </button>
      </ActionBar>
    </div>
  );
}

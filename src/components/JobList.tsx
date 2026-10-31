import { useMemo, useRef, useState } from 'react';
import { compute, statusOf } from '../lib/calc';
import { money, pct } from '../lib/format';
import { downloadBackup, parseBackup } from '../lib/storage';
import type { Job } from '../lib/types';
import type { SyncStatus } from '../lib/useJobs';
import { ActionBar, Pill, SyncBadge } from './ui';

interface Props {
  jobs: Job[];
  status: SyncStatus;
  message: string;
  email: string;
  onSignOut: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onExample: () => void;
  onRestore: (jobs: Job[]) => void;
}

export default function JobList({
  jobs,
  status,
  message,
  email,
  onSignOut,
  onOpen,
  onNew,
  onExample,
  onRestore,
}: Props) {
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((job) => ({ job, c: compute(job) })),
    [jobs],
  );

  const totals = useMemo(() => {
    let profit = 0;
    let net = 0;
    let invoice = 0;
    for (const r of rows) {
      profit += r.c.profit;
      net += r.c.netCash;
      invoice += r.c.invoiceNet;
    }
    return { profit, net, invoice };
  }, [rows]);

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const restored = parseBackup(await file.text());
      onRestore(restored);
      setMsg(`Restored ${restored.length} job${restored.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setMsg(e instanceof Error ? `Could not restore: ${e.message}.` : 'Could not restore that file.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto flex max-w-[560px] flex-col gap-5 px-4"
        style={{
          paddingTop: 'calc(20px + env(safe-area-inset-top))',
          paddingBottom: 'calc(var(--nav-h) + 110px + env(safe-area-inset-bottom))',
        }}
      >
        <header className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <SyncBadge status={status} />
            <button type="button" onClick={onSignOut} className="h-10 px-1 text-[0.88rem] font-semibold text-accent">
              Sign out
            </button>
          </div>
          <h1 className="m-0 text-[1.7rem] font-bold leading-tight tracking-tight">Job Margin Checker</h1>
          <p className="m-0 text-[0.95rem] text-muted">
            Profit and cashflow for each job, after CIS and VAT.
          </p>
          {message && (
            <p role="alert" className="m-0 mt-2 rounded-lg bg-negSoft px-3 py-2.5 text-[0.9rem] text-neg">
              {message}
            </p>
          )}
          {email && <p className="m-0 text-[0.8rem] text-muted">Signed in as {email}</p>}
        </header>

        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5" aria-label="Totals across all jobs">
            <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3.5">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.07em] text-muted">
                Profit, {rows.length} job{rows.length === 1 ? '' : 's'}
              </span>
              <span className={`break-words font-mono text-[1.2rem] font-semibold tabular-nums ${totals.profit < 0 ? 'text-neg' : 'text-pos'}`}>
                {money(totals.profit)}
              </span>
              <span className="text-[0.8rem] text-muted">
                {totals.invoice > 0 ? `${pct(totals.profit / totals.invoice)} of ${money(totals.invoice)}` : 'No invoices yet'}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3.5">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.07em] text-muted">Net cash</span>
              <span className={`break-words font-mono text-[1.2rem] font-semibold tabular-nums ${totals.net < 0 ? 'text-neg' : 'text-pos'}`}>
                {money(totals.net)}
              </span>
              <span className="text-[0.8rem] text-muted">After VAT and CIS</span>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <section className="card flex flex-col gap-3" aria-label="No jobs yet">
            <h2 className="m-0 text-[1.05rem] font-bold">No jobs yet</h2>
            <p className="hint m-0">
              Start a job to see its profit and cash position. Or load the worked example (£4,000 of materials,
              £3,700 of labour at 20% CIS, reverse charge) to see how it reads.
            </p>
            <button type="button" className="btn" onClick={onExample}>
              Load the example job
            </button>
          </section>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {rows.map(({ job, c }) => {
              const st = statusOf(c);
              return (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(job.id)}
                    className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left text-fg"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[1.02rem] font-semibold">{job.ref.trim() || 'Untitled job'}</span>
                      <span className="text-[0.85rem] text-muted">
                        {money(c.invoiceNet)} ex VAT · edited{' '}
                        {new Date(job.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="mt-1.5 self-start">
                        <Pill tone={st.tone}>{c.margin === null ? st.label : `${pct(c.margin)} · ${st.label}`}</Pill>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className={`font-mono text-[1.05rem] font-semibold tabular-nums ${c.profit < 0 ? 'text-neg' : 'text-pos'}`}>
                        {money(c.profit)}
                      </span>
                      <span className="text-[0.75rem] text-muted">profit</span>
                      <span className="mt-1 font-mono text-[0.82rem] tabular-nums text-muted">{money(c.netCash)}</span>
                      <span className="text-[0.75rem] text-muted">net cash</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-label="Backup">
            <h2 className="m-0 text-[0.75rem] font-bold uppercase tracking-[0.08em] text-muted">Backup</h2>
            <p className="hint m-0">
              Jobs are saved to your account and kept on this phone for offline use. Download a backup if you want a
              copy of your own.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" className="btn" onClick={() => downloadBackup(jobs)}>
                Back up jobs
              </button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Restore backup
              </button>
            </div>
            <input
              ref={fileRef}
              id="restoreFile"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a backup file"
              onChange={(e) => restore(e.target.files?.[0])}
            />
            {msg && (
              <p role="status" className="hint m-0">
                {msg}
              </p>
            )}
          </section>
        )}
      </main>

      <ActionBar>
        <button type="button" className="btn btn-primary w-full" onClick={onNew}>
          + New job
        </button>
      </ActionBar>
    </div>
  );
}

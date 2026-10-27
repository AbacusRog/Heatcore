import type { ReactNode } from 'react';
import type { Tone } from '../lib/calc';
import type { SyncStatus } from '../lib/useJobs';

/** Keep digits and one decimal point, so the phone keypad input stays a valid number. */
export function cleanNumber(s: string): string {
  const t = s.replace(/[^0-9.]/g, '');
  const i = t.indexOf('.');
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4" aria-label={title}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[1.05rem] font-bold tracking-tight">{title}</h2>
        {note && <p className="hint">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function NumField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder = '0.00',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="lbl">
        {label}
      </label>
      <div className="affix">
        {prefix && <span className="pl-3">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(cleanNumber(e.target.value))}
        />
        {suffix && <span className="pr-3">{suffix}</span>}
      </div>
    </div>
  );
}

export function Seg<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="lbl mb-1.5 p-0">{legend}</legend>
      <div className="flex overflow-hidden rounded-lg border border-lineStrong bg-surface">
        {options.map((o, i) => (
          <label
            key={o.value}
            className={`relative flex flex-1 ${i > 0 ? 'border-l border-lineStrong' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="flex min-h-12 flex-1 items-center justify-center px-2 text-center text-[0.92rem] font-semibold text-fg peer-checked:bg-accent peer-checked:text-accentInk peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-fg">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const syncLook: Record<SyncStatus, { dot: string; text: string }> = {
  loading: { dot: 'bg-muted', text: 'Loading…' },
  saving: { dot: 'bg-muted', text: 'Saving…' },
  saved: { dot: 'bg-pos', text: 'Saved' },
  offline: { dot: 'bg-warn', text: 'Offline, saved on this phone' },
  error: { dot: 'bg-neg', text: 'Could not save' },
};

export function SyncBadge({ status, short = false }: { status: SyncStatus; short?: boolean }) {
  const look = syncLook[status];
  const text = short && status === 'offline' ? 'Offline' : look.text;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8rem] text-muted">
      <span className={`h-2 w-2 rounded-full ${look.dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

const pillTone: Record<Tone, string> = {
  ok: 'bg-posSoft text-pos',
  low: 'bg-warnSoft text-warn',
  loss: 'bg-negSoft text-neg',
  neutral: 'border border-line bg-surface text-muted',
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillTone[tone]}`}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

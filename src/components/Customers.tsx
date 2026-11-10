import { useMemo, useState } from 'react';
import { fmtDate, grossOf } from '../lib/docs';
import { money } from '../lib/format';
import type { Customer, Invoice, Quote } from '../lib/types';
import { errorText } from '../lib/useData';
import { ActionBar, Notice, Section, TextField } from './ui';

const key = (s: string) => s.trim().toLowerCase();

export function CustomerList({
  customers,
  loaded,
  error,
  onOpen,
  onNew,
}: {
  customers: Customer[];
  loaded: boolean;
  error: string;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = key(q);
    return t ? customers.filter((c) => [c.name, c.address, c.email, c.phone].some((x) => x.toLowerCase().includes(t))) : customers;
  }, [customers, q]);

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto flex max-w-[560px] flex-col gap-4 px-4"
        style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))', paddingBottom: 'calc(var(--nav-h) + 110px + env(safe-area-inset-bottom))' }}
      >
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[1.7rem] font-bold leading-tight tracking-tight">Customers</h1>
          <p className="m-0 text-[0.95rem] text-muted">
            {loaded ? `${customers.length} saved.` : 'Loading…'} Names and addresses are filled in for you on new quotes and invoices.
          </p>
        </header>
        {error && <Notice tone="bad">{error}</Notice>}
        <TextField id="cust-search" label="Search" placeholder="Name, address, email or phone" value={q} onChange={setQ} />
        {loaded && customers.length === 0 && !error && (
          <section className="card flex flex-col gap-2">
            <h2 className="m-0 text-[1.05rem] font-bold">No customers yet</h2>
            <p className="hint m-0">Add one below, or copy them all from QuickBooks in Settings. Customers are also saved when you send a quote or invoice.</p>
          </section>
        )}
        {loaded && customers.length > 0 && shown.length === 0 && <p className="hint m-0">No customer matches “{q}”.</p>}
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {shown.slice(0, 300).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} className="flex w-full flex-col gap-0.5 rounded-xl border border-line bg-surface p-4 text-left text-fg">
                <span className="truncate text-[1.02rem] font-semibold">{c.name}</span>
                <span className="truncate text-[0.85rem] text-muted">{c.address.replace(/\n/g, ', ') || 'No address saved'}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length > 300 && <p className="hint m-0">Showing the first 300. Search to narrow down.</p>}
      </main>
      <ActionBar>
        <button type="button" className="btn btn-primary w-full" onClick={onNew}>
          + New customer
        </button>
      </ActionBar>
    </div>
  );
}

export function CustomerScreen({
  customer,
  quotes,
  invoices,
  onSave,
  onDelete,
  onBack,
  onQuote,
  onInvoice,
  onOpenQuote,
  onOpenInvoice,
}: {
  /** null while adding a new one. */
  customer: Customer | null;
  quotes: Quote[];
  invoices: Invoice[];
  onSave: (v: { name: string; email: string; phone: string; address: string }) => Promise<Customer>;
  onDelete: () => Promise<void>;
  onBack: () => void;
  onQuote: (c: Customer) => void;
  onInvoice: (c: Customer) => void;
  onOpenQuote: (id: string) => void;
  onOpenInvoice: (id: string) => void;
}) {
  const [f, setF] = useState({ name: customer?.name ?? '', email: customer?.email ?? '', phone: customer?.phone ?? '', address: customer?.address ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<typeof f>) => {
    setF({ ...f, ...p });
    setMsg(null);
  };

  const mine = {
    quotes: customer ? quotes.filter((x) => key(x.customer_name) === key(customer.name)) : [],
    invoices: customer ? invoices.filter((x) => key(x.customer_name) === key(customer.name)) : [],
  };
  const billed = mine.invoices.reduce((n, i) => n + grossOf(i), 0);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      const dup = typeof e === 'object' && e && 'code' in e && (e as { code: string }).code === '23505';
      setMsg({ tone: 'bad', text: dup ? 'A customer with that name is already saved.' : errorText(e) });
    }
    setBusy(false);
  }

  const save = () =>
    run(async () => {
      if (!f.name.trim()) throw new Error('Add the customer’s name first.');
      await onSave({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), address: f.address.trim() });
      setMsg({ tone: 'good', text: 'Saved.' });
    });

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[560px] items-center gap-1 px-2 py-2">
          <button type="button" onClick={onBack} aria-label="Back to customers" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 truncate text-[1.1rem] font-bold">{customer ? customer.name : 'New customer'}</div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-4" style={{ paddingBottom: 'calc(var(--nav-h) + 40px + env(safe-area-inset-bottom))' }}>
        <Section title="Details">
          <TextField id="cu-name" label="Name" value={f.name} onChange={(v) => set({ name: v })} />
          <TextField id="cu-email" label="Email" type="email" inputMode="email" value={f.email} onChange={(v) => set({ email: v })} />
          <TextField id="cu-phone" label="Phone" type="tel" inputMode="tel" value={f.phone} onChange={(v) => set({ phone: v })} />
          <TextField id="cu-addr" label="Address" rows={4} value={f.address} onChange={(v) => set({ address: v })} />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {customer ? 'Save changes' : 'Save customer'}
          </button>
          {customer?.source === 'quickbooks' && <p className="hint m-0">Copied from QuickBooks. Changes here do not change QuickBooks.</p>}
        </Section>

        {customer && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn" onClick={() => onQuote(customer)}>
                New quote
              </button>
              <button type="button" className="btn" onClick={() => onInvoice(customer)}>
                New invoice
              </button>
            </div>

            <Section title="History" note={mine.invoices.length ? `${mine.invoices.length} invoice${mine.invoices.length === 1 ? '' : 's'}, ${money(billed)} in total` : undefined}>
              {mine.quotes.length === 0 && mine.invoices.length === 0 && <p className="hint m-0">No quotes or invoices for this customer yet.</p>}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {mine.invoices.slice(0, 50).map((i) => (
                  <li key={i.id}>
                    <button type="button" className="flex w-full justify-between gap-3 rounded-lg border border-line p-3 text-left text-fg" onClick={() => onOpenInvoice(i.id)}>
                      <span className="text-[0.9rem]">
                        Invoice <span className="font-mono">{i.number}</span> · {fmtDate(i.issue_date)}
                      </span>
                      <span className="font-mono text-[0.9rem] tabular-nums">{money(grossOf(i))}</span>
                    </button>
                  </li>
                ))}
                {mine.quotes.slice(0, 50).map((x) => (
                  <li key={x.id}>
                    <button type="button" className="flex w-full justify-between gap-3 rounded-lg border border-line p-3 text-left text-fg" onClick={() => onOpenQuote(x.id)}>
                      <span className="text-[0.9rem]">
                        Quote <span className="font-mono">{x.number}</span> · {fmtDate(x.issue_date)}
                      </span>
                      <span className="font-mono text-[0.9rem] tabular-nums">{money(grossOf(x))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>

            {confirm ? (
              <div className="flex flex-col gap-2 rounded-lg bg-negSoft p-3">
                <p className="m-0 text-[0.92rem] text-neg">Delete this customer? Their quotes and invoices are kept.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn" onClick={() => setConfirm(false)}>
                    Keep them
                  </button>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(onDelete)}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
                Delete customer
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

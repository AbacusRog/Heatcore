import { useEffect, useRef, useState } from 'react';
import { resizeLogo } from '../lib/logo';
import { newOauthState, qboAuthorize, qboDisconnect, qboStatus } from '../lib/qbo';
import type { QboStatus } from '../lib/qbo';
import type { Settings, VatMode } from '../lib/types';
import { errorText } from '../lib/useData';
import { Notice, Section, Seg, TextField } from './ui';

interface Props {
  settings: Settings;
  email: string;
  save: (patch: Partial<Settings>) => Promise<void>;
  onSignOut: () => void;
  /** Result of coming back from QuickBooks, if we just did. */
  qboMessage: { tone: 'good' | 'bad'; text: string } | null;
}

const digits = (v: string) => v.replace(/[^0-9]/g, '');

export default function SettingsScreen({ settings, email, save, onSignOut, qboMessage }: Props) {
  const [form, setForm] = useState<Settings>(settings);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState('');
  const pending = useRef<Partial<Settings>>({});
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const [logoMsg, setLogoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const flush = async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setState('saving');
    try {
      await saveRef.current(patch);
      setState('saved');
      setErr('');
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      setState('error');
      setErr(errorText(e));
    }
  };

  const change = (patch: Partial<Settings>, now = false) => {
    setForm((f) => ({ ...f, ...patch }));
    pending.current = { ...pending.current, ...patch };
    setState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), now ? 0 : 800);
  };

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (Object.keys(pending.current).length) void saveRef.current(pending.current).catch(() => undefined);
    },
    [],
  );

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    setLogoMsg('');
    try {
      change({ logo: await resizeLogo(file) }, true);
    } catch (e) {
      setLogoMsg(e instanceof Error ? e.message : 'Could not use that image.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const num = (key: 'next_quote_no' | 'next_invoice_no' | 'payment_days' | 'quote_valid_days', min: number) => (v: string) => {
    const n = parseInt(digits(v), 10);
    change({ [key]: Number.isFinite(n) ? Math.max(min, n) : min } as Partial<Settings>);
  };

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto flex max-w-[560px] flex-col gap-4 px-4"
        style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))', paddingBottom: 'calc(var(--nav-h) + 32px + env(safe-area-inset-bottom))' }}
      >
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[1.7rem] font-bold leading-tight tracking-tight">Settings</h1>
          <p className="m-0 text-[0.95rem] text-muted">Your business details appear on every quote and invoice.</p>
          <p role="status" className="m-0 text-[0.8rem] text-muted">
            {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
          </p>
          {state === 'error' && <Notice tone="bad">Could not save. {err}</Notice>}
        </header>

        <Section title="Business">
          <TextField id="sname" label="Business name" value={form.business_name} onChange={(v) => change({ business_name: v })} autoComplete="organization" />
          <TextField id="saddr" label="Address" rows={3} value={form.address} onChange={(v) => change({ address: v })} autoComplete="street-address" />
          <TextField id="semail" label="Email" type="email" inputMode="email" value={form.email} onChange={(v) => change({ email: v })} />
          <TextField id="sphone" label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={(v) => change({ phone: v })} />
          <TextField id="svat" label="VAT number" value={form.vat_number} onChange={(v) => change({ vat_number: v })} />
        </Section>

        <Section title="Logo" note="Shown at the top of quotes and invoices. A PNG with a clear background looks best.">
          {form.logo ? (
            <div className="flex items-center gap-4 rounded-lg border border-line bg-white p-3">
              <img src={form.logo} alt="Your logo" className="max-h-16 max-w-[200px] object-contain" />
            </div>
          ) : (
            <p className="rounded-lg bg-surface2 px-3 py-2.5 text-[0.9rem] text-muted">No logo yet.</p>
          )}
          <input ref={fileRef} id="logoFile" type="file" accept="image/*" className="sr-only" aria-label="Choose a logo image" onChange={(e) => void chooseLogo(e.target.files?.[0])} />
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {form.logo ? 'Change logo' : 'Upload logo'}
            </button>
            <button type="button" className="btn btn-danger" disabled={!form.logo} onClick={() => change({ logo: null }, true)}>
              Remove
            </button>
          </div>
          {logoMsg && <Notice tone="bad">{logoMsg}</Notice>}
        </Section>

        <Section title="Quotes and invoices" note="Numbers carry on from the next number shown. Change it only if you have used another system before.">
          <div className="grid grid-cols-2 gap-3">
            <TextField id="qpre" label="Quote prefix" value={form.quote_prefix} onChange={(v) => change({ quote_prefix: v.slice(0, 10) })} />
            <TextField id="qnext" label="Next quote no." inputMode="numeric" value={String(form.next_quote_no)} onChange={num('next_quote_no', 1)} />
            <TextField id="ipre" label="Invoice prefix" value={form.invoice_prefix} onChange={(v) => change({ invoice_prefix: v.slice(0, 10) })} />
            <TextField id="inext" label="Next invoice no." inputMode="numeric" value={String(form.next_invoice_no)} onChange={num('next_invoice_no', 1)} />
            <TextField id="qdays" label="Quotes valid for (days)" inputMode="numeric" value={String(form.quote_valid_days)} onChange={num('quote_valid_days', 1)} />
            <TextField id="pdays" label="Invoices due in (days)" inputMode="numeric" value={String(form.payment_days)} onChange={num('payment_days', 0)} />
          </div>
          <Seg<VatMode>
            legend="VAT on new quotes and invoices"
            name="defVat"
            value={form.default_vat}
            onChange={(v) => change({ default_vat: v })}
            options={[
              { value: 'std', label: '20% VAT' },
              { value: 'rc', label: '20% reverse charge' },
              { value: 'none', label: 'No VAT' },
            ]}
          />
          <TextField id="sbank" label="Payment details (shown on invoices)" rows={3} placeholder="Account name, sort code, account number" value={form.bank_details} onChange={(v) => change({ bank_details: v })} />
          <TextField id="sqterms" label="Quote terms (shown at the bottom of quotes)" rows={3} value={form.quote_terms} onChange={(v) => change({ quote_terms: v })} />
          <TextField id="siterms" label="Invoice footer" rows={3} placeholder="e.g. Thank you for your business." value={form.invoice_terms} onChange={(v) => change({ invoice_terms: v })} />
        </Section>

        <QuickBooksCard message={qboMessage} />

        <Section title="Your login">
          <p className="m-0 text-[0.9rem] text-muted">Signed in as {email || 'your account'}.</p>
          <button type="button" className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </Section>
      </main>
    </div>
  );
}

function QuickBooksCard({ message }: { message: { tone: 'good' | 'bad'; text: string } | null }) {
  const [status, setStatus] = useState<QboStatus | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let live = true;
    qboStatus()
      .then((s) => live && setStatus(s))
      .catch((e) => live && setProblem(errorText(e)));
    return () => {
      live = false;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setProblem('');
    try {
      const { url } = await qboAuthorize(newOauthState());
      window.location.href = url;
    } catch (e) {
      setProblem(errorText(e));
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await qboDisconnect();
      setStatus({ configured: true, connected: false });
      setConfirm(false);
    } catch (e) {
      setProblem(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Section title="QuickBooks" note="Send finished invoices straight into your QuickBooks Online company.">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {problem && <Notice tone="bad">{problem}</Notice>}
      {!status && !problem && <p className="hint m-0">Checking…</p>}
      {status && !status.configured && (
        <Notice tone="warn">QuickBooks has not been set up on this site yet. Abacus needs to add the QuickBooks keys first.</Notice>
      )}
      {status?.configured && !status.connected && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void connect()}>
          {busy ? 'Opening QuickBooks…' : 'Connect QuickBooks'}
        </button>
      )}
      {status?.connected && (
        <>
          <Notice tone="good">
            Connected{status.company_name ? ` to ${status.company_name}` : ''}
            {status.env === 'sandbox' ? ' (test company, nothing real is changed)' : ''}.
          </Notice>
          {confirm ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Stay connected
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirm(true)}>
              Disconnect QuickBooks
            </button>
          )}
        </>
      )}
    </Section>
  );
}

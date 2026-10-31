import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import BottomNav from './components/BottomNav';
import type { Tab } from './components/BottomNav';
import DocList from './components/DocList';
import type { DocRow } from './components/DocList';
import InvoiceScreen, { invoicePill } from './components/InvoiceScreen';
import JobEditor from './components/JobEditor';
import JobList from './components/JobList';
import Login from './components/Login';
import PublicDoc from './components/PublicDoc';
import QuoteScreen, { quotePill } from './components/QuoteScreen';
import SettingsScreen from './components/SettingsScreen';
import { Notice } from './components/ui';
import { blankJob, exampleJob, newId } from './lib/defaults';
import { addDays, copyLines, docTotals, linesFromJob, newLine, todayIso } from './lib/docs';
import { checkOauthState, qboExchange } from './lib/qbo';
import { supabase } from './lib/supabase';
import type { Invoice, Job, Quote } from './lib/types';
import { errorText, useInvoices, useQuotes, useSettings } from './lib/useData';
import { useJobs } from './lib/useJobs';

type Route =
  | { name: 'tab'; tab: Tab }
  | { name: 'job' | 'quote' | 'invoice'; id: string }
  | { name: 'public'; kind: 'quote' | 'invoice'; token: string };

const TAB_HASH: Record<Tab, string> = { jobs: '', quotes: '#/quotes', invoices: '#/invoices', settings: '#/settings' };

function parseHash(): Route {
  const h = window.location.hash;
  let m = h.match(/^#\/q\/([A-Za-z0-9_-]{16,})$/);
  if (m) return { name: 'public', kind: 'quote', token: m[1] };
  m = h.match(/^#\/i\/([A-Za-z0-9_-]{16,})$/);
  if (m) return { name: 'public', kind: 'invoice', token: m[1] };
  m = h.match(/^#\/(job|quote|invoice)\/(.+)$/);
  if (m) return { name: m[1] as 'job' | 'quote' | 'invoice', id: decodeURIComponent(m[2]) };
  if (h === '#/quotes') return { name: 'tab', tab: 'quotes' };
  if (h === '#/invoices') return { name: 'tab', tab: 'invoices' };
  if (h === '#/settings') return { name: 'tab', tab: 'settings' };
  return { name: 'tab', tab: 'jobs' };
}

export interface Nav {
  tab: (t: Tab) => void;
  open: (kind: 'job' | 'quote' | 'invoice', id: string, replace?: boolean) => void;
  back: (fallback: Tab) => void;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  // undefined while the saved session is being checked
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setRoute(parseHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const nav: Nav = {
    tab: (t) => {
      window.history.replaceState(null, '', TAB_HASH[t] || window.location.pathname);
      setRoute({ name: 'tab', tab: t });
    },
    open: (kind, id, replace = false) => {
      const url = `#/${kind}/${encodeURIComponent(id)}`;
      if (replace) window.history.replaceState({ app: true }, '', url);
      else window.history.pushState({ app: true }, '', url);
      setRoute({ name: kind, id });
    },
    back: (fallback) => {
      if (window.history.state && (window.history.state as { app?: boolean }).app) window.history.back();
      else nav.tab(fallback);
    },
  };

  // A customer opening their link needs no sign-in.
  if (route.name === 'public') return <PublicDoc kind={route.kind} token={route.token} />;

  if (!supabase) {
    return (
      <main className="mx-auto max-w-[420px] px-4 pt-16">
        <div className="card flex flex-col gap-2">
          <h1 className="m-0 text-[1.1rem] font-bold">Supabase is not set up</h1>
          <p className="hint m-0">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example), then rebuild.
          </p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <div className="min-h-dvh" aria-busy="true" />;
  if (!session) return <Login />;
  return <Signed userId={session.user.id} email={session.user.email ?? ''} route={route} nav={nav} />;
}

function Signed({ userId, email, route, nav }: { userId: string; email: string; route: Route; nav: Nav }) {
  const { jobs, status, message, addJob, updateJob, removeJob, restore } = useJobs(userId);
  const settingsData = useSettings(userId);
  const { settings } = settingsData;
  const quotes = useQuotes();
  const invoices = useInvoices();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [qboMessage, setQboMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const handledReturn = useRef(false);

  const routeKey = route.name === 'tab' ? route.tab : route.name === 'public' ? 'public' : `${route.name}:${route.id}`;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  // Coming back from QuickBooks: Intuit sends the person to the site with a one-time code.
  useEffect(() => {
    if (handledReturn.current) return;
    const p = new URLSearchParams(window.location.search);
    const code = p.get('code');
    const realm = p.get('realmId');
    const state = p.get('state');
    if (!(code && realm && state) && !p.get('error')) return;
    handledReturn.current = true;
    window.history.replaceState(null, '', `${window.location.pathname}#/settings`);
    nav.tab('settings');
    if (!code || !realm || !state) {
      setQboMessage({ tone: 'bad', text: 'The QuickBooks connection was cancelled.' });
      return;
    }
    if (!checkOauthState(state)) {
      setQboMessage({ tone: 'bad', text: 'We could not confirm that connection. Please try connecting again.' });
      return;
    }
    qboExchange(code, realm)
      .then((r) => setQboMessage({ tone: 'good', text: `QuickBooks connected${r.company_name ? ` to ${r.company_name}` : ''}.` }))
      .catch((e) => setQboMessage({ tone: 'bad', text: errorText(e) }));
  }, [nav]);

  /** Create a numbered draft. If another phone took the same number a moment ago, take the next one. */
  async function withNumber<T>(kind: 'quote' | 'invoice', make: (number: string) => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      const number = await settingsData.takeNumber(kind);
      try {
        return await make(number);
      } catch (e) {
        last = e;
        if (!(typeof e === 'object' && e && 'code' in e && (e as { code: string }).code === '23505')) throw e;
      }
    }
    throw last;
  }

  async function newQuote(seed: Partial<Quote> = {}) {
    setCreating(true);
    setCreateError('');
    try {
      const q = await withNumber('quote', (number) =>
        quotes.insert({
          number,
          status: 'draft',
          customer_name: '',
          customer_email: '',
          customer_address: '',
          title: '',
          lines: [newLine()],
          vat_mode: settings.default_vat,
          notes: '',
          issue_date: todayIso(),
          valid_until: addDays(todayIso(), settings.quote_valid_days),
          ...seed,
        }),
      );
      nav.open('quote', q.id);
    } catch (e) {
      setCreateError(errorText(e));
    }
    setCreating(false);
  }

  function quoteFromJob(job: Job) {
    void newQuote({
      title: job.ref.trim(),
      lines: linesFromJob(job),
      vat_mode: job.vatMode === 'rc' ? 'rc' : settings.default_vat === 'rc' ? 'std' : settings.default_vat,
      job_id: job.id,
    });
  }

  async function invoiceFromQuote(q: Quote) {
    const inv = await withNumber('invoice', (number) =>
      invoices.insert({
        number,
        status: 'draft',
        quote_id: q.id,
        customer_name: q.customer_name,
        customer_email: q.customer_email,
        customer_address: q.customer_address,
        title: q.title,
        lines: copyLines(q.lines),
        vat_mode: q.vat_mode,
        notes: '',
        issue_date: todayIso(),
        due_date: addDays(todayIso(), settings.payment_days),
      }),
    );
    await quotes.update(q.id, { status: 'invoiced', invoice_id: inv.id });
    // Replace the quote screen, so Back from the new invoice goes to the list rather than to the old quote.
    nav.open('invoice', inv.id, true);
  }

  const goTab = (t: Tab) => nav.tab(t);
  const waiting = quotes.rows.filter((q) => q.status === 'accepted').length;

  /* ---------- Editors (full screen, no tab bar) ---------- */

  if (route.name === 'job') {
    const job = jobs.find((j) => j.id === route.id);
    if (job) {
      return (
        <JobEditor
          key={job.id}
          job={job}
          status={status}
          onChange={updateJob}
          onBack={() => nav.back('jobs')}
          onQuote={() => quoteFromJob(job)}
          onDuplicate={() => {
            const now = Date.now();
            const copy: Job = {
              ...job,
              id: newId(),
              ref: job.ref.trim() ? `${job.ref.trim()} (copy)` : '',
              extras: job.extras.map((x) => ({ ...x, id: newId() })),
              createdAt: now,
              updatedAt: now,
            };
            addJob(copy);
            nav.open('job', copy.id);
          }}
          onDelete={() => {
            removeJob(job.id);
            nav.tab('jobs');
          }}
        />
      );
    }
  }

  if (route.name === 'quote') {
    const quote = quotes.rows.find((q) => q.id === route.id);
    if (quote) {
      const inv = invoices.rows.find((i) => i.id === quote.invoice_id);
      return (
        <QuoteScreen
          quote={quote}
          settings={settings}
          invoiceNumber={inv?.number}
          onUpdate={(patch) => quotes.update(quote.id, patch)}
          onBack={() => nav.back('quotes')}
          onDelete={async () => {
            await quotes.remove(quote.id);
            nav.tab('quotes');
          }}
          onCreateInvoice={() => invoiceFromQuote(quote)}
          onOpenInvoice={() => inv && nav.open('invoice', inv.id)}
          onSettings={() => nav.tab('settings')}
        />
      );
    }
    if (!quotes.loaded) return <div className="min-h-dvh" aria-busy="true" />;
  }

  if (route.name === 'invoice') {
    const invoice = invoices.rows.find((i) => i.id === route.id);
    if (invoice) {
      return (
        <InvoiceScreen
          invoice={invoice}
          settings={settings}
          onUpdate={(patch) => invoices.update(invoice.id, patch)}
          onBack={() => nav.back('invoices')}
          onDelete={async () => {
            await invoices.remove(invoice.id);
            nav.tab('invoices');
          }}
          onSettings={() => nav.tab('settings')}
        />
      );
    }
    if (!invoices.loaded) return <div className="min-h-dvh" aria-busy="true" />;
  }

  /* ---------- Tabs ---------- */

  const tab: Tab = route.name === 'tab' ? route.tab : route.name === 'quote' ? 'quotes' : route.name === 'invoice' ? 'invoices' : 'jobs';

  let page;
  if (tab === 'quotes') {
    const rows: DocRow[] = quotes.rows.map((q) => ({
      id: q.id,
      number: q.number,
      customer: q.customer_name,
      title: q.title,
      total: docTotals(q.lines, q.vat_mode).gross,
      date: q.issue_date,
      pill: quotePill[q.status],
    }));
    page = (
      <DocList
        heading="Quotes"
        blurb="Email a quote. The customer accepts or declines from the link."
        rows={rows}
        loaded={quotes.loaded}
        error={createError || quotes.error}
        emptyTitle="No quotes yet"
        emptyText="Start a quote below, or open a job and choose Create a quote from this job."
        newLabel="+ New quote"
        busy={creating}
        onNew={() => void newQuote()}
        onOpen={(id) => nav.open('quote', id)}
      />
    );
  } else if (tab === 'invoices') {
    const rows: DocRow[] = invoices.rows.map((i: Invoice) => ({
      id: i.id,
      number: i.number,
      customer: i.customer_name,
      title: i.title,
      total: docTotals(i.lines, i.vat_mode).gross,
      date: i.issue_date,
      pill: invoicePill(i),
    }));
    page = (
      <DocList
        heading="Invoices"
        blurb="Created from accepted quotes, or from scratch. Email them or send them to QuickBooks."
        rows={rows}
        loaded={invoices.loaded}
        error={invoices.error}
        emptyTitle="No invoices yet"
        emptyText="When a customer accepts a quote, open it and choose Turn into an invoice. You can also start one from scratch."
        newLabel="+ New invoice"
        busy={creating}
        onNew={() => void newInvoice()}
        onOpen={(id) => nav.open('invoice', id)}
      />
    );
  } else if (tab === 'settings') {
    page = settingsData.loaded ? (
      <SettingsScreen
        key="settings"
        settings={settings}
        email={email}
        save={settingsData.save}
        onSignOut={() => void supabase?.auth.signOut()}
        qboMessage={qboMessage}
      />
    ) : (
      <div className="min-h-dvh" aria-busy="true">
        {settingsData.error && (
          <main className="mx-auto max-w-[560px] px-4 pt-8">
            <Notice tone="bad">{settingsData.error}</Notice>
          </main>
        )}
      </div>
    );
  } else {
    page = (
      <JobList
        jobs={jobs}
        status={status}
        message={message}
        email={email}
        onSignOut={() => void supabase?.auth.signOut()}
        onOpen={(id) => nav.open('job', id)}
        onNew={() => {
          const j = blankJob(jobs[0]);
          addJob(j);
          nav.open('job', j.id);
        }}
        onExample={() => {
          const j = exampleJob();
          addJob(j);
          nav.open('job', j.id);
        }}
        onRestore={restore}
      />
    );
  }

  async function newInvoice() {
    setCreating(true);
    try {
      const inv = await withNumber('invoice', (number) =>
        invoices.insert({
          number,
          status: 'draft',
          customer_name: '',
          customer_email: '',
          customer_address: '',
          title: '',
          lines: [newLine()],
          vat_mode: settings.default_vat,
          notes: '',
          issue_date: todayIso(),
          due_date: addDays(todayIso(), settings.payment_days),
        }),
      );
      nav.open('invoice', inv.id);
    } catch (e) {
      setCreateError(errorText(e));
    }
    setCreating(false);
  }

  return (
    <>
      {page}
      <BottomNav active={tab} onGo={goTab} waiting={waiting} />
    </>
  );
}


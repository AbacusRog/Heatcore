import { useEffect, useState } from 'react';
import { fmtDate } from '../lib/docs';
import type { DocData, DocLine, VatMode } from '../lib/types';
import { supabase } from '../lib/supabase';
import { errorText, fetchPublicDoc, respondToQuote } from '../lib/useData';
import DocView from './DocView';
import { Notice, TextField } from './ui';

interface Loaded {
  data: DocData;
  responder: string | null;
  respondedAt: string | null;
}

function toDoc(kind: 'quote' | 'invoice', r: Record<string, unknown>): Loaded {
  const biz = (r.business ?? {}) as Record<string, string | null>;
  return {
    data: {
      kind,
      number: String(r.number ?? ''),
      status: String(r.status ?? ''),
      issue_date: String(r.issue_date ?? ''),
      end_date: ((kind === 'quote' ? r.valid_until : r.due_date) as string | null) ?? null,
      customer_name: String(r.customer_name ?? ''),
      customer_address: String(r.customer_address ?? ''),
      title: String(r.title ?? ''),
      lines: (r.lines as DocLine[]) ?? [],
      vat_mode: (r.vat_mode as VatMode) ?? 'std',
      notes: String(r.notes ?? ''),
      business: {
        name: biz.name ?? '',
        address: biz.address ?? '',
        email: biz.email ?? '',
        phone: biz.phone ?? '',
        vat_number: biz.vat_number ?? '',
        logo: biz.logo ?? null,
        terms: biz.terms ?? undefined,
        bank: biz.bank ?? undefined,
      },
    },
    responder: (r.responder_name as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
  };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** What a customer sees when they open the emailed link. No sign-in. */
export default function PublicDoc({ kind, token }: { kind: 'quote' | 'invoice'; token: string }) {
  const [state, setState] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    if (!supabase) {
      setState('error');
      setError('This page is not available right now.');
      return;
    }
    fetchPublicDoc(kind, token)
      .then((r) => {
        if (!live) return;
        if (!r) setState('missing');
        else {
          setDoc(toDoc(kind, r));
          setState('ready');
        }
      })
      .catch((e) => {
        if (!live) return;
        setError(errorText(e));
        setState('error');
      });
    return () => {
      live = false;
    };
  }, [kind, token]);

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto flex max-w-[640px] flex-col gap-4 px-4"
        style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))', paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}
      >
        {state === 'loading' && <p className="hint m-0" role="status">Loading…</p>}
        {state === 'error' && <Notice tone="bad">{error}</Notice>}
        {state === 'missing' && (
          <section className="card flex flex-col gap-2">
            <h1 className="m-0 text-[1.2rem] font-bold">We can’t find that {kind}</h1>
            <p className="hint m-0">The link may be incomplete, or the {kind} may have been withdrawn. Please contact the person who sent it.</p>
          </section>
        )}
        {state === 'ready' && doc && (
          <>
            <DocView doc={doc.data} />
            {kind === 'quote' ? (
              <QuoteReply token={token} doc={doc} onChanged={(next) => setDoc(next)} />
            ) : (
              <div className="no-print flex flex-col gap-3">
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                  Print or save as PDF
                </button>
                <Contact doc={doc.data} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Contact({ doc }: { doc: DocData }) {
  const b = doc.business;
  if (!b.email && !b.phone) return null;
  return (
    <p className="hint m-0">
      Questions? {b.email && <a className="font-semibold text-accent underline" href={`mailto:${b.email}`}>{b.email}</a>}
      {b.email && b.phone ? ' or ' : ''}
      {b.phone && <a className="font-semibold text-accent underline" href={`tel:${b.phone.replace(/\s+/g, '')}`}>{b.phone}</a>}
    </p>
  );
}

function QuoteReply({ token, doc, onChanged }: { token: string; doc: Loaded; onChanged: (d: Loaded) => void }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = doc.data.status;
  const expired = !!doc.data.end_date && doc.data.end_date < todayIso();
  const who = doc.data.business.name || 'the sender';

  async function answer(accept: boolean) {
    setError('');
    if (accept && name.trim().length < 2) {
      setError('Please type your full name to accept the quote.');
      return;
    }
    setBusy(true);
    try {
      const r = await respondToQuote(token, accept, name, note);
      if (r.ok) {
        onChanged({
          ...doc,
          data: { ...doc.data, status: r.status ?? (accept ? 'accepted' : 'declined') },
          responder: name.trim() || null,
          respondedAt: new Date().toISOString(),
        });
      } else if (r.error === 'expired') setError('Sorry, this quote has expired. Please contact us for an updated one.');
      else if (r.error === 'already_answered') setError('This quote has already been answered.');
      else if (r.error === 'name_required') setError('Please type your full name to accept the quote.');
      else setError('We could not record your answer. Please try again, or contact us.');
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <div className="no-print flex flex-col gap-3">
      {status === 'sent' && !expired && (
        <section className="card flex flex-col gap-3" aria-label="Your reply">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[1.1rem] font-bold">Your reply</h2>
            <p className="hint m-0">Typing your name and choosing Accept confirms you are happy to go ahead on the terms above.</p>
          </div>
          <TextField id="rname" label="Your full name" autoComplete="name" value={name} onChange={setName} />
          <TextField id="rnote" label="Message (optional)" rows={3} value={note} onChange={setNote} />
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" className="btn" disabled={busy} onClick={() => void answer(false)}>
              Decline
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void answer(true)}>
              Accept quote
            </button>
          </div>
        </section>
      )}
      {status === 'sent' && expired && (
        <Notice tone="warn">This quote was valid until {fmtDate(doc.data.end_date)} and has now expired. Please contact {who} for an updated quote.</Notice>
      )}
      {(status === 'accepted' || status === 'invoiced') && (
        <Notice tone="good">
          Thank you. This quote was accepted{doc.responder ? ` by ${doc.responder}` : ''}
          {doc.respondedAt ? ` on ${fmtDate(doc.respondedAt)}` : ''}. {who} will be in touch.
        </Notice>
      )}
      {status === 'declined' && (
        <Notice tone="info">This quote was declined{doc.respondedAt ? ` on ${fmtDate(doc.respondedAt)}` : ''}. If that was a mistake, please contact {who}.</Notice>
      )}
      <button type="button" className="btn" onClick={() => window.print()}>
        Print or save as PDF
      </button>
      <Contact doc={doc.data} />
    </div>
  );
}

import { useState } from 'react';
import type { Tone } from '../lib/calc';
import { docLink, fmtDate, mailText, mailtoUrl, quoteMail, readyToSend } from '../lib/docs';
import type { Mail } from '../lib/docs';
import type { Quote, QuoteStatus, Settings } from '../lib/types';
import { errorText } from '../lib/useData';
import DocShell from './DocShell';
import { Notice, copyText } from './ui';

export const quotePill: Record<QuoteStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  sent: { tone: 'low', label: 'Waiting for reply' },
  accepted: { tone: 'ok', label: 'Accepted' },
  declined: { tone: 'loss', label: 'Declined' },
  invoiced: { tone: 'ok', label: 'Invoiced' },
};

interface Props {
  quote: Quote;
  settings: Settings;
  invoiceNumber?: string;
  onUpdate: (patch: Partial<Quote>) => Promise<Quote>;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onCreateInvoice: () => Promise<void>;
  onOpenInvoice: () => void;
  onSettings: () => void;
}

export default function QuoteScreen({ quote, settings, invoiceNumber, onUpdate, onBack, onDelete, onCreateInvoice, onOpenInvoice, onSettings }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [mail, setMail] = useState<Mail | null>(null);
  const [confirm, setConfirm] = useState<'accept' | 'decline' | 'delete' | null>(null);
  const link = docLink('quote', quote.token);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ tone: 'bad', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function emailIt(flush: () => Promise<void>, current: Quote) {
    await run(async () => {
      await flush();
      const problem = readyToSend(current);
      if (problem) {
        setMsg({ tone: 'bad', text: problem });
        return;
      }
      const saved =
        quote.status === 'draft'
          ? await onUpdate({ status: 'sent', sent_at: new Date().toISOString() })
          : quote;
      const m = quoteMail(saved, settings, docLink('quote', saved.token));
      setMail(m);
      window.location.href = mailtoUrl(m);
    });
  }

  async function copy(text: string, done: string) {
    const ok = await copyText(text);
    setMsg({ tone: ok ? 'good' : 'bad', text: ok ? done : 'Could not copy. Select the text and copy it yourself.' });
  }

  const record = (accepted: boolean) =>
    run(async () => {
      await onUpdate({
        status: accepted ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
        responder_name: 'Recorded by us',
        response_note: 'Customer replied by phone or message.',
      });
      setConfirm(null);
    });

  const reopen = () =>
    run(async () => {
      await onUpdate({ status: 'draft', responded_at: null, responder_name: null, response_note: null, sent_at: null });
    });

  const top = (
    <>
      {quote.status === 'sent' && (
        <Notice tone="info">
          Sent {fmtDate(quote.sent_at)}. Waiting for {quote.customer_name || 'the customer'} to accept or decline.
        </Notice>
      )}
      {quote.status === 'accepted' && (
        <Notice tone="good">
          Accepted{quote.responder_name ? ` by ${quote.responder_name}` : ''} on {fmtDate(quote.responded_at)}.
          {quote.response_note ? ` “${quote.response_note}”` : ''}
        </Notice>
      )}
      {quote.status === 'declined' && (
        <Notice tone="bad">
          Declined on {fmtDate(quote.responded_at)}.{quote.response_note ? ` “${quote.response_note}”` : ''}
        </Notice>
      )}
      {quote.status === 'invoiced' && (
        <Notice tone="good">
          Accepted{quote.responder_name ? ` by ${quote.responder_name}` : ''} and invoiced{invoiceNumber ? ` as ${invoiceNumber}` : ''}.
        </Notice>
      )}
    </>
  );

  return (
    <DocShell
      key={`${quote.id}:${quote.status === 'draft' ? 'draft' : 'open'}`}
      kind="quote"
      doc={quote}
      settings={settings}
      pill={quotePill[quote.status]}
      onSave={(patch) => onUpdate(patch as Partial<Quote>)}
      onBack={onBack}
      onSettings={onSettings}
      top={top}
      actions={({ flush, current }) => (
        <>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          {quote.status === 'accepted' && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(onCreateInvoice)}>
              Turn into an invoice
            </button>
          )}
          {quote.status === 'invoiced' && (
            <button type="button" className="btn btn-primary" onClick={onOpenInvoice}>
              Open the invoice
            </button>
          )}

          {(quote.status === 'draft' || quote.status === 'sent') && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void emailIt(flush, current as Quote)}>
              {quote.status === 'draft' ? 'Email to customer' : 'Email again'}
            </button>
          )}

          {mail && (
            <div className="card flex flex-col gap-2">
              <p className="m-0 text-[0.9rem]">
                Your email app should open with the message ready. {quote.status !== 'draft' && 'The quote is marked as sent. '}If it doesn’t, copy the message and paste it into an email.
              </p>
              <button type="button" className="btn" onClick={() => void copy(mailText(mail), 'Message copied.')}>
                Copy the message
              </button>
            </div>
          )}

          {quote.status !== 'draft' && (
            <button type="button" className="btn" onClick={() => void copy(link, 'Link copied.')}>
              Copy customer link
            </button>
          )}

          {quote.status === 'sent' && (
            <div className="card flex flex-col gap-2">
              <p className="m-0 text-[0.9rem] font-semibold">Customer answered another way?</p>
              {confirm === 'accept' || confirm === 'decline' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                  <button type="button" className={`btn ${confirm === 'accept' ? 'btn-primary' : 'btn-danger'}`} disabled={busy} onClick={() => void record(confirm === 'accept')}>
                    Record as {confirm === 'accept' ? 'accepted' : 'declined'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn" onClick={() => setConfirm('accept')}>
                    They accepted
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirm('decline')}>
                    They declined
                  </button>
                </div>
              )}
            </div>
          )}

          {quote.status !== 'draft' && quote.status !== 'invoiced' && (
            <button type="button" className="btn" disabled={busy} onClick={() => void reopen()}>
              Edit as a draft again
            </button>
          )}

          {quote.status !== 'draft' && (
            <button type="button" className="btn" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          )}

          {confirm === 'delete' ? (
            <div className="flex flex-col gap-2 rounded-lg bg-negSoft p-3">
              <p className="m-0 text-[0.92rem] text-neg">Delete this quote? The customer’s link will stop working.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn" onClick={() => setConfirm(null)}>
                  Keep it
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(onDelete)}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>
              Delete quote
            </button>
          )}
        </>
      )}
    />
  );
}

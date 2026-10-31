import { useState } from 'react';
import type { Tone } from '../lib/calc';
import { docLink, fmtDate, invoiceMail, lineUsed, mailText, mailtoUrl, readyToSend, todayIso } from '../lib/docs';
import type { Mail } from '../lib/docs';
import type { Invoice, Settings } from '../lib/types';
import { qboSendInvoice } from '../lib/qbo';
import { errorText } from '../lib/useData';
import DocShell from './DocShell';
import { Notice, copyText } from './ui';

export const invoicePill = (i: Invoice): { tone: Tone; label: string } => {
  if (i.status === 'paid') return { tone: 'ok', label: 'Paid' };
  if (i.status === 'sent') return i.due_date && i.due_date < todayIso() ? { tone: 'loss', label: 'Overdue' } : { tone: 'low', label: 'Sent' };
  return { tone: 'neutral', label: 'Draft' };
};

interface Props {
  invoice: Invoice;
  settings: Settings;
  onUpdate: (patch: Partial<Invoice>) => Promise<Invoice>;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onSettings: () => void;
}

export default function InvoiceScreen({ invoice, settings, onUpdate, onBack, onDelete, onSettings }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [mail, setMail] = useState<Mail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const link = docLink('invoice', invoice.token);

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

  async function copy(text: string, done: string) {
    const ok = await copyText(text);
    setMsg({ tone: ok ? 'good' : 'bad', text: ok ? done : 'Could not copy. Select the text and copy it yourself.' });
  }

  async function emailIt(flush: () => Promise<void>, current: Invoice) {
    await run(async () => {
      await flush();
      const problem = readyToSend(current);
      if (problem) {
        setMsg({ tone: 'bad', text: problem });
        return;
      }
      const saved = invoice.status === 'draft' ? await onUpdate({ status: 'sent', sent_at: new Date().toISOString() }) : invoice;
      const m = invoiceMail(saved, settings, docLink('invoice', saved.token));
      setMail(m);
      window.location.href = mailtoUrl(m);
    });
  }

  async function toQuickBooks(flush: () => Promise<void>, current: Invoice) {
    await run(async () => {
      await flush();
      if (!current.customer_name.trim()) {
        setMsg({ tone: 'bad', text: 'Add the customer’s name first. QuickBooks needs it.' });
        return;
      }
      if (!current.lines.some(lineUsed)) {
        setMsg({ tone: 'bad', text: 'Add at least one line with a price first.' });
        return;
      }
      const r = await qboSendInvoice(invoice.id);
      await onUpdate({ qbo_id: r.id, qbo_doc: r.doc, qbo_exported_at: r.exported_at });
      setMsg({ tone: 'good', text: `Sent to QuickBooks${r.doc ? ` as invoice ${r.doc}` : ''}.` });
    });
  }

  const pill = invoicePill(invoice);

  const top = (
    <>
      {invoice.status === 'sent' && (
        <Notice tone={pill.tone === 'loss' ? 'bad' : 'info'}>
          Sent {fmtDate(invoice.sent_at)}.{invoice.due_date ? ` Due ${fmtDate(invoice.due_date)}.` : ''}
          {pill.tone === 'loss' ? ' This invoice is overdue.' : ''}
        </Notice>
      )}
      {invoice.status === 'paid' && <Notice tone="good">Paid{invoice.paid_at ? ` on ${fmtDate(invoice.paid_at)}` : ''}.</Notice>}
      {invoice.qbo_exported_at && (
        <Notice tone="good">
          In QuickBooks{invoice.qbo_doc ? ` as invoice ${invoice.qbo_doc}` : ''} since {fmtDate(invoice.qbo_exported_at)}.
        </Notice>
      )}
    </>
  );

  return (
    <DocShell
      key={`${invoice.id}:${invoice.status === 'draft' ? 'draft' : 'open'}`}
      kind="invoice"
      doc={invoice}
      settings={settings}
      pill={pill}
      onSave={(patch) => onUpdate(patch as Partial<Invoice>)}
      onBack={onBack}
      onSettings={onSettings}
      top={top}
      actions={({ flush, current }) => (
        <>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void emailIt(flush, current as Invoice)}>
            {invoice.status === 'draft' ? 'Email to customer' : 'Email a copy to customer'}
          </button>

          {mail && (
            <div className="card flex flex-col gap-2">
              <p className="m-0 text-[0.9rem]">
                Your email app should open with the message ready. {invoice.status !== 'draft' && 'The invoice is marked as sent. '}If it doesn’t, copy the message and paste it into an email.
              </p>
              <button type="button" className="btn" onClick={() => void copy(mailText(mail), 'Message copied.')}>
                Copy the message
              </button>
            </div>
          )}

          <div className="card flex flex-col gap-2">
            <p className="m-0 text-[0.9rem] font-semibold">QuickBooks</p>
            {invoice.qbo_exported_at ? (
              <p className="hint m-0">This invoice is already in QuickBooks. Changing it here will not change the QuickBooks copy.</p>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void toQuickBooks(flush, current as Invoice)}>
                Send to QuickBooks
              </button>
            )}
            <button type="button" className="h-10 self-start px-1 text-[0.88rem] font-semibold text-accent" onClick={onSettings}>
              QuickBooks connection
            </button>
          </div>

          {invoice.status === 'sent' && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void run(async () => void (await onUpdate({ status: 'paid', paid_at: new Date().toISOString() })))}
            >
              Mark as paid
            </button>
          )}
          {invoice.status === 'paid' && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void run(async () => void (await onUpdate({ status: 'sent', paid_at: null })))}
            >
              Mark as not paid
            </button>
          )}

          {invoice.status !== 'draft' && (
            <button type="button" className="btn" onClick={() => void copy(link, 'Link copied.')}>
              Copy customer link
            </button>
          )}
          {invoice.status !== 'draft' && (
            <button type="button" className="btn" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          )}
          {invoice.status !== 'draft' && (
            <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => void (await onUpdate({ status: 'draft', paid_at: null })))}>
              Edit as a draft again
            </button>
          )}

          {confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-lg bg-negSoft p-3">
              <p className="m-0 text-[0.92rem] text-neg">
                Delete this invoice? The customer’s link will stop working.{invoice.qbo_exported_at ? ' QuickBooks keeps its own copy.' : ''}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(onDelete)}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete invoice
            </button>
          )}
        </>
      )}
    />
  );
}

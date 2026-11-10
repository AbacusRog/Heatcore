import { useState } from 'react';
import type { ReactNode } from 'react';
import { downloadPdf } from '../lib/pdf';
import type { DocData } from '../lib/types';
import { Notice } from './ui';

/** Builds the document as a PDF on this device and saves it. */
export default function PdfButton({ doc, className = 'btn', children = 'Download PDF' }: { doc: DocData; className?: string; children?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function go() {
    setBusy(true);
    setFailed(false);
    try {
      await downloadPdf(doc);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => void go()}>
        {busy ? 'Making the PDF…' : children}
      </button>
      {failed && <Notice tone="bad">Could not make the PDF. Please try again, or use Print and choose “Save as PDF”.</Notice>}
    </>
  );
}

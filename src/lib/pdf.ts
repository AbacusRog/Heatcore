import { num, plainNumber } from './calc';
import { RC_NOTE, totalsOf, fmtDate, kindLabel, kindTag, kindTotals, lineTotal, lineUsed } from './docs';
import { money } from './format';
import type { DocData, LineKind } from './types';

/* A4 portrait, drawn directly so the text stays sharp, selectable and small. Mirrors the on-screen document. */

const NAVY: RGB = [13, 39, 64];
const BLUE: RGB = [10, 95, 180];
const ORANGE: RGB = [242, 106, 10];
const RED: RGB = [217, 58, 12];
const INK: RGB = [184, 58, 6];
const TINT: RGB = [238, 244, 251];
const TEXT: RGB = [38, 38, 38];
const GREY: RGB = [96, 96, 96];
const RULE: RGB = [222, 222, 222];
type RGB = [number, number, number];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15;
const RIGHT = PAGE_W - M;
const BOTTOM = PAGE_H - 18;

export interface PdfLogo {
  data: string;
  format: 'JPEG' | 'PNG';
  /** Natural size in pixels, for the aspect ratio. */
  w: number;
  h: number;
}

export const BRAND_LOGO = '/heatcore-logo.jpg';

/** Text the built-in PDF fonts can draw: plain Latin-1, with common punctuation mapped across. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/\r/g, '')
    .replace(/[^\n -ÿ]/g, '?');
}

export function pdfFileName(doc: DocData): string {
  const who = doc.customer_name.trim().replace(/[^\w .&'-]+/g, '').slice(0, 40).trim();
  return `${doc.number}${who ? ` - ${who}` : ''}.pdf`;
}

/** Loads a logo (a path or a data URL) as a PNG or JPEG the PDF can embed. Returns null if it cannot be read. */
export async function loadLogo(src: string): Promise<PdfLogo | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const jpeg = /^data:image\/jpe?g/i.test(src) || /\.jpe?g(\?|$)/i.test(src);
    if (jpeg) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92), format: jpeg ? 'JPEG' : 'PNG', w, h };
  } catch {
    return null;
  }
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

/** The logo-coloured strip across the top: orange, red, blue, navy. */
function strip(pdf: import('jspdf').jsPDF, y: number, h: number) {
  const stops: Array<[number, RGB]> = [
    [0, ORANGE],
    [0.34, RED],
    [0.68, BLUE],
    [1, NAVY],
  ];
  const n = 70;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const c = mix(c0, c1, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    pdf.setFillColor(c[0], c[1], c[2]);
    pdf.rect((PAGE_W / n) * i, y, PAGE_W / n + 0.2, h, 'F');
  }
}

export async function buildPdf(doc: DocData, logo: PdfLogo | null) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `${doc.kind === 'quote' ? 'Quote' : 'Invoice'} ${doc.number}`, author: doc.business.name || undefined });

  const b = doc.business;
  const isQuote = doc.kind === 'quote';
  const ownLogo = Boolean(b.logo);
  const t = totalsOf(doc);
  const shown = doc.lines.filter((l) => l.desc.trim() || lineUsed(l));
  const byKind = kindTotals(doc.lines.filter(lineUsed));
  const kindsPresent = (Object.keys(byKind) as LineKind[]).filter((k) => byKind[k] > 0);
  const showStd = doc.vat_mode === 'std' || t.vat > 0;
  const showRc = doc.vat_mode === 'rc' || t.rcVat > 0;

  let y = 0;
  const fill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const draw = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const lh = (size: number) => size * 0.3528 * 1.3;
  const font = (style: 'normal' | 'bold', size: number, face: 'helvetica' | 'courier' = 'helvetica') => {
    pdf.setFont(face, style);
    pdf.setFontSize(size);
  };
  const wrap = (text: string, width: number): string[] => pdf.splitTextToSize(pdfSafe(text), width) as string[];
  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      pdf.addPage();
      strip(pdf, 0, 2);
      y = M;
    }
  };
  const label = (text: string, x = M) => {
    font('bold', 7.5);
    ink(BLUE);
    pdf.text(text.toUpperCase(), x, y, { charSpace: 0.4 });
    y += lh(7.5) + 0.8;
  };

  /* ---- header ---- */
  strip(pdf, 0, 3);
  y = 12;
  let leftBottom = y;
  if (logo) {
    const maxH = ownLogo ? 18 : 32;
    const maxW = ownLogo ? 55 : 60;
    const ratio = logo.w / logo.h;
    let h = maxH;
    let w = h * ratio;
    if (w > maxW) {
      w = maxW;
      h = w / ratio;
    }
    pdf.addImage(logo.data, logo.format, M, y, w, h);
    leftBottom = y + h + 4;
  }
  let ly = leftBottom;
  if (b.name && (ownLogo || !logo)) {
    font('bold', 10.5);
    ink(NAVY);
    pdf.text(pdfSafe(b.name), M, ly + 1);
    ly += lh(10.5);
  }
  font('normal', 9);
  ink(GREY);
  const contact: string[] = [];
  if (b.address) contact.push(...b.address.split('\n').filter((x) => x.trim()));
  if (b.phone) contact.push(b.phone);
  if (b.email) contact.push(b.email);
  if (b.vat_number) contact.push(`VAT no. ${b.vat_number}`);
  for (const c of contact) {
    pdf.text(pdfSafe(c), M, ly + 1);
    ly += lh(9);
  }

  let ry = 18;
  font('bold', 24);
  ink(NAVY);
  pdf.text(isQuote ? 'QUOTE' : 'INVOICE', RIGHT, ry, { align: 'right' });
  ry += 7;
  font('bold', 11, 'courier');
  ink(BLUE);
  pdf.text(pdfSafe(doc.number), RIGHT, ry, { align: 'right' });
  ry += 6;
  font('normal', 9);
  ink(GREY);
  pdf.text(`Date ${fmtDate(doc.issue_date)}`, RIGHT, ry, { align: 'right' });
  if (doc.end_date) {
    ry += 4.6;
    pdf.text(`${isQuote ? 'Valid until' : 'Due'} ${fmtDate(doc.end_date)}`, RIGHT, ry, { align: 'right' });
  }

  y = Math.max(ly, ry) + 7;

  /* ---- customer and title ---- */
  label(isQuote ? 'Prepared for' : 'Bill to');
  font('bold', 11);
  ink(TEXT);
  pdf.text(pdfSafe(doc.customer_name || 'Customer name'), M, y);
  y += lh(11);
  if (doc.customer_address.trim()) {
    font('normal', 9.5);
    ink(GREY);
    for (const row of wrap(doc.customer_address, 95)) {
      pdf.text(row, M, y);
      y += lh(9.5);
    }
  }
  y += 5;
  if (doc.title.trim()) {
    font('bold', 12);
    ink(NAVY);
    for (const row of wrap(doc.title, RIGHT - M)) {
      ensure(lh(12));
      pdf.text(row, M, y);
      y += lh(12);
    }
    y += 3;
  }

  /* ---- items ---- */
  fill(NAVY);
  pdf.rect(M, y, RIGHT - M, 0.7, 'F');
  y += 1.5;
  const descW = 128;
  if (shown.length === 0) {
    font('normal', 10);
    ink(GREY);
    pdf.text('No items yet.', M, y + 6);
    y += 10;
  }
  for (const l of shown) {
    const rows = wrap(l.desc.trim() || 'Item', descW);
    const tag = kindTag(l);
    const qtyLine = num(l.qty) !== 1 ? `${plainNumber(num(l.qty))} x ${money(num(l.price))}` : '';
    const h = 3 + rows.length * lh(10) + (tag ? lh(7.5) : 0) + (qtyLine ? lh(8.5) : 0) + 2.5;
    ensure(h);
    let ty = y + 3 + 2.6;
    font('normal', 10);
    ink(TEXT);
    for (const row of rows) {
      pdf.text(row, M, ty);
      ty += lh(10);
    }
    if (tag) {
      font('bold', 7.5);
      ink(INK);
      pdf.text(tag.toUpperCase(), M, ty - 0.4, { charSpace: 0.3 });
      ty += lh(7.5);
    }
    if (qtyLine) {
      font('normal', 8.5, 'courier');
      ink(GREY);
      pdf.text(qtyLine, M, ty - 0.4);
    }
    font('bold', 10, 'courier');
    ink(TEXT);
    pdf.text(money(lineTotal(l)), RIGHT, y + 3 + 2.6, { align: 'right' });
    y += h;
    draw(RULE);
    pdf.setLineWidth(0.2);
    pdf.line(M, y, RIGHT, y);
  }
  y += 5;

  /* ---- totals ---- */
  const tx = 112;
  const row = (name: string, value: string, opts: { small?: boolean } = {}) => {
    ensure(lh(10) + 1);
    font('normal', opts.small ? 8.5 : 9.5);
    ink(opts.small ? GREY : TEXT);
    pdf.text(name, tx, y);
    font('normal', opts.small ? 8.5 : 9.5, 'courier');
    pdf.text(value, RIGHT, y, { align: 'right' });
    y += lh(opts.small ? 8.5 : 9.5) + 0.8;
  };
  if (kindsPresent.length > 1) for (const k of kindsPresent) row(kindLabel[k], money(byKind[k]), { small: true });
  row('Subtotal', money(t.net));
  if (showStd) row('VAT at 20%', money(t.vat));
  if (showRc) row('VAT at 20% (reverse charge)', money(0));
  if (doc.vat_mode === 'none') row('VAT', 'Not charged');
  ensure(12);
  y += 1;
  fill(NAVY);
  pdf.roundedRect(tx - 4, y - 5.2, RIGHT - tx + 8, 9, 1.5, 1.5, 'F');
  font('bold', 11.5);
  ink([255, 255, 255]);
  pdf.text('Total', tx, y + 0.9);
  font('bold', 11.5, 'courier');
  pdf.text(money(t.gross), RIGHT - 3, y + 0.9, { align: 'right' });
  y += 11;

  if (t.rcVat > 0) {
    const text = `${RC_NOTE} VAT of ${money(t.rcVat)} at 20% is due from you, not from ${b.name || 'us'}.`;
    const rows = wrap(text, RIGHT - M - 10);
    const h = rows.length * lh(9) + 6;
    ensure(h);
    fill(TINT);
    pdf.rect(M, y, RIGHT - M, h, 'F');
    fill(BLUE);
    pdf.rect(M, y, 1.2, h, 'F');
    font('normal', 9);
    ink(TEXT);
    let ny = y + 5;
    for (const r of rows) {
      pdf.text(r, M + 5, ny);
      ny += lh(9);
    }
    y += h + 5;
  }

  /* ---- notes, payment details, terms ---- */
  const block = (title: string, text: string) => {
    const rows = wrap(text, RIGHT - M);
    ensure(lh(7.5) + lh(9.5) * Math.min(rows.length, 3) + 2);
    label(title);
    font('normal', 9.5);
    ink(TEXT);
    for (const r of rows) {
      ensure(lh(9.5));
      pdf.text(r, M, y);
      y += lh(9.5);
    }
    y += 4;
  };
  if (doc.notes.trim()) block('Notes', doc.notes);
  if (!isQuote && b.bank?.trim()) block('How to pay', b.bank);
  if (b.terms?.trim()) {
    const rows = wrap(b.terms, RIGHT - M);
    ensure(lh(8) * Math.min(rows.length, 3) + 6);
    fill(ORANGE);
    pdf.rect(M, y, RIGHT - M, 0.6, 'F');
    y += 4.5;
    font('normal', 8);
    ink(GREY);
    for (const r of rows) {
      ensure(lh(8));
      pdf.text(r, M, y);
      y += lh(8);
    }
  }

  /* ---- page numbers ---- */
  const pages = pdf.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      pdf.setPage(p);
      font('normal', 8);
      ink(GREY);
      pdf.text(`${doc.number}  -  page ${p} of ${pages}`, PAGE_W / 2, PAGE_H - 9, { align: 'center' });
    }
  }
  return pdf;
}

/** Builds the PDF in the browser and saves it. */
export async function downloadPdf(doc: DocData): Promise<void> {
  const logo = await loadLogo(doc.business.logo || BRAND_LOGO);
  const pdf = await buildPdf(doc, logo);
  pdf.save(pdfFileName(doc));
}

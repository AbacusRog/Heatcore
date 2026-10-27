import type { Job } from './types';

/** A real UUID, because job ids are the primary key in Supabase. */
export const newId = (): string => {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** The worked example: £4,000 + £800 VAT materials, £3,700 labour, 20% CIS, reverse charge. */
export function exampleJob(): Job {
  const now = Date.now();
  return {
    id: newId(),
    ref: '14 Elm Road, bathroom refit',
    createdAt: now,
    updatedAt: now,
    matCost: '4000',
    matVat: '20',
    matMode: 'cost',
    markupPct: '15',
    labourMode: 'hours',
    hours: '100',
    rate: '37',
    costRate: '0',
    fixedCharge: '3700',
    fixedCost: '0',
    cis: '20',
    vatMode: 'rc',
    extras: [],
    target: '20',
  };
}

/** A new job keeps the rates and tax settings from the previous one, with the amounts cleared. */
export function blankJob(prev?: Job): Job {
  const now = Date.now();
  return {
    id: newId(),
    ref: '',
    createdAt: now,
    updatedAt: now,
    matCost: '',
    matVat: prev?.matVat ?? '20',
    matMode: prev?.matMode ?? 'cost',
    markupPct: prev?.markupPct ?? '15',
    labourMode: prev?.labourMode ?? 'hours',
    hours: '',
    rate: prev?.rate ?? '',
    costRate: prev?.costRate ?? '',
    fixedCharge: '',
    fixedCost: '',
    cis: prev?.cis ?? '20',
    vatMode: prev?.vatMode ?? 'rc',
    extras: [],
    target: prev?.target ?? '20',
  };
}

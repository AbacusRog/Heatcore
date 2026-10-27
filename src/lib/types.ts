export type PurchaseVat = '20' | '0';
export type CisRate = '20' | '30' | '0';

export interface ExtraCost {
  id: string;
  name: string;
  amount: string;
  vat: PurchaseVat;
}

/** Amount fields are kept as strings so half-typed numbers like "12." survive. */
export interface Job {
  id: string;
  ref: string;
  createdAt: number;
  updatedAt: number;

  matCost: string;
  matVat: PurchaseVat;
  matMode: 'cost' | 'markup';
  markupPct: string;

  labourMode: 'hours' | 'fixed';
  hours: string;
  rate: string;
  costRate: string;
  fixedCharge: string;
  fixedCost: string;
  cis: CisRate;

  vatMode: 'std' | 'rc';
  extras: ExtraCost[];
  target: string;
}

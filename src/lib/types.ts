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

/* ---------- Quotes, invoices and business settings ---------- */

export type VatMode = 'std' | 'rc' | 'none';

export interface DocLine {
  id: string;
  desc: string;
  qty: string;
  price: string;
}

export interface Settings {
  business_name: string;
  address: string;
  email: string;
  phone: string;
  vat_number: string;
  logo: string | null;
  quote_prefix: string;
  invoice_prefix: string;
  next_quote_no: number;
  next_invoice_no: number;
  payment_days: number;
  quote_valid_days: number;
  bank_details: string;
  quote_terms: string;
  invoice_terms: string;
  default_vat: VatMode;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced';
export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Quote {
  id: string;
  token: string;
  number: string;
  status: QuoteStatus;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  lines: DocLine[];
  vat_mode: VatMode;
  notes: string;
  issue_date: string;
  valid_until: string | null;
  job_id: string | null;
  sent_at: string | null;
  responded_at: string | null;
  responder_name: string | null;
  response_note: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  token: string;
  number: string;
  status: InvoiceStatus;
  quote_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  lines: DocLine[];
  vat_mode: VatMode;
  notes: string;
  issue_date: string;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  qbo_id: string | null;
  qbo_doc: string | null;
  qbo_exported_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Business details as the customer sees them on a quote or invoice. */
export interface Business {
  name: string;
  address: string;
  email: string;
  phone: string;
  vat_number: string;
  logo: string | null;
  terms?: string;
  bank?: string;
}

/** Everything the customer-facing document needs. Used for the preview and for the public link. */
export interface DocData {
  kind: 'quote' | 'invoice';
  number: string;
  status: string;
  issue_date: string;
  /** Quote: valid until. Invoice: due date. */
  end_date: string | null;
  customer_name: string;
  customer_address: string;
  title: string;
  lines: DocLine[];
  vat_mode: VatMode;
  notes: string;
  business: Business;
}

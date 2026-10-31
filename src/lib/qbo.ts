import { supabase } from './supabase';

export interface QboStatus {
  /** The site has QuickBooks keys set. */
  configured: boolean;
  connected: boolean;
  env?: 'sandbox' | 'production';
  company_name?: string | null;
  realm_id?: string;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase is not set up.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('No connection. Check your signal and try again.');
  }
  let body: (T & { error?: string }) | null = null;
  try {
    body = (await res.json()) as T & { error?: string };
  } catch {
    body = null;
  }
  if (!body) throw new Error('QuickBooks only works on the live site, not when the app is run on a computer for testing.');
  if (!res.ok) throw new Error(body.error || `QuickBooks request failed (${res.status}).`);
  return body;
}

export const qboStatus = () => call<QboStatus>('/api/qbo/status');
export const qboAuthorize = (state: string) => call<{ url: string }>(`/api/qbo/authorize?state=${encodeURIComponent(state)}`);
export const qboExchange = (code: string, realmId: string) =>
  call<{ company_name: string | null }>('/api/qbo/exchange', { method: 'POST', body: { code, realmId } });
export const qboSendInvoice = (invoiceId: string) =>
  call<{ id: string; doc: string; exported_at: string }>('/api/qbo/invoice', { method: 'POST', body: { invoiceId } });
export const qboDisconnect = () => call<{ ok: true }>('/api/qbo/disconnect', { method: 'POST' });

const STATE_KEY = 'jmc.qbo.state';

/** The random value we send to Intuit and check when they send the person back. */
export function newOauthState(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  try {
    sessionStorage.setItem(STATE_KEY, s);
  } catch {
    /* the check below then simply fails and asks them to try again */
  }
  return s;
}

export function checkOauthState(state: string): boolean {
  try {
    const ok = sessionStorage.getItem(STATE_KEY) === state && state.length >= 16;
    sessionStorage.removeItem(STATE_KEY);
    return ok;
  } catch {
    return false;
  }
}

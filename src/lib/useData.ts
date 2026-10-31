import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultSettings, pad } from './docs';
import { supabase } from './supabase';
import type { Invoice, Quote, Settings } from './types';

type Table = 'jmc_quotes' | 'jmc_invoices';

export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (/row-level security|permission denied/i.test(m)) return 'This login has not been given access to the app yet. Ask Abacus to add it.';
  if (/fetch|network|failed to load/i.test(m)) return 'No connection. Check your signal and try again.';
  return m || 'Something went wrong.';
}

/** Quotes or invoices, always read from Supabase. They change when a customer answers, so there is no offline copy. */
export function useRows<T extends { id: string }>(table: Table) {
  const [rows, setRows] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.from(table).select('*').order('updated_at', { ascending: false });
    if (!alive.current) return;
    if (err) setError(errorText(err));
    else {
      setError('');
      setRows(data as unknown as T[]);
    }
    setLoaded(true);
  }, [table]);

  useEffect(() => {
    alive.current = true;
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const tick = window.setInterval(onVisible, 30000);
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(tick);
      window.removeEventListener('online', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const insert = useCallback(
    async (row: Partial<T>): Promise<T> => {
      if (!supabase) throw new Error('Supabase is not set up.');
      const { data, error: err } = await supabase.from(table).insert(row as never).select().single();
      if (err) throw err;
      const saved = data as unknown as T;
      setRows((r) => [saved, ...r]);
      return saved;
    },
    [table],
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>): Promise<T> => {
      if (!supabase) throw new Error('Supabase is not set up.');
      const { data, error: err } = await supabase.from(table).update(patch as never).eq('id', id).select().single();
      if (err) throw err;
      const saved = data as unknown as T;
      setRows((r) => r.map((x) => (x.id === id ? saved : x)));
      return saved;
    },
    [table],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!supabase) throw new Error('Supabase is not set up.');
      const { error: err } = await supabase.from(table).delete().eq('id', id);
      if (err) throw err;
      setRows((r) => r.filter((x) => x.id !== id));
    },
    [table],
  );

  return { rows, loaded, error, refresh: load, insert, update, remove };
}

export const useQuotes = () => useRows<Quote>('jmc_quotes');
export const useInvoices = () => useRows<Invoice>('jmc_invoices');

/** The business details and numbering. Always returns a usable value, even before the first save. */
export function useSettings(userId: string) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const exists = useRef(false);

  const fetchRow = useCallback(async (): Promise<Settings> => {
    if (!supabase) return defaultSettings;
    const { data, error: err } = await supabase.from('jmc_settings').select('*').maybeSingle();
    if (err) throw err;
    exists.current = !!data;
    return { ...defaultSettings, ...((data as Partial<Settings> | null) ?? {}) };
  }, []);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchRow());
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
    setLoaded(true);
  }, [fetchRow]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Write only what changed, so the logo is not sent again on every edit. The first save creates the row. */
  const write = useCallback(
    async (base: Settings, patch: Partial<Settings>) => {
      if (!supabase) throw new Error('Supabase is not set up.');
      const { error: err } = exists.current
        ? await supabase.from('jmc_settings').update(patch).eq('owner_id', userId)
        : await supabase.from('jmc_settings').upsert({ owner_id: userId, ...base, ...patch }, { onConflict: 'owner_id' });
      if (err) throw err;
      exists.current = true;
    },
    [userId],
  );

  const save = useCallback(
    async (patch: Partial<Settings>): Promise<void> => {
      await write(settings, patch);
      setSettings((s) => ({ ...s, ...patch }));
    },
    [settings, write],
  );

  /** Reserve the next quote or invoice number. Reads fresh from the database so two phones never clash. */
  const takeNumber = useCallback(
    async (kind: 'quote' | 'invoice', skip = 0): Promise<string> => {
      const fresh = await fetchRow();
      const n = (kind === 'quote' ? fresh.next_quote_no : fresh.next_invoice_no) + skip;
      const patch = kind === 'quote' ? { next_quote_no: n + 1 } : { next_invoice_no: n + 1 };
      await write(fresh, patch);
      setSettings({ ...fresh, ...patch });
      return pad(kind === 'quote' ? fresh.quote_prefix : fresh.invoice_prefix, n);
    },
    [fetchRow, write],
  );

  return { settings, loaded, error, save, takeNumber, refresh: load };
}

/** Anonymous calls the customer's link makes. Only the private token is needed. */
export async function fetchPublicDoc(kind: 'quote' | 'invoice', token: string): Promise<Record<string, unknown> | null> {
  if (!supabase) throw new Error('Supabase is not set up.');
  const { data, error } = await supabase.rpc(kind === 'quote' ? 'jmc_public_quote' : 'jmc_public_invoice', { p_token: token });
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

export async function respondToQuote(
  token: string,
  accept: boolean,
  name: string,
  note: string,
): Promise<{ ok: boolean; error?: string; status?: string }> {
  if (!supabase) throw new Error('Supabase is not set up.');
  const { data, error } = await supabase.rpc('jmc_respond_quote', { p_token: token, p_accept: accept, p_name: name, p_note: note });
  if (error) throw error;
  return data as { ok: boolean; error?: string; status?: string };
}

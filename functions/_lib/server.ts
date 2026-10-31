/* Shared helpers for the QuickBooks functions. Runs on Cloudflare Pages, never in the browser. */
import { qboFault } from '../../src/lib/qboPayload';

export interface Env {
  QBO_CLIENT_ID?: string;
  QBO_CLIENT_SECRET?: string;
  /** "sandbox" (default) or "production". */
  QBO_ENV?: string;
  /** Optional QuickBooks tax code ids, if the names are not found automatically. */
  QBO_TAXCODE_STD?: string;
  QBO_TAXCODE_RC?: string;
  QBO_TAXCODE_NONE?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface Ctx {
  request: Request;
  env: Env;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Intuit puts a transaction id on every reply. Quoting it lets Intuit support trace a call. */
export const intuitTid = (res: Response): string => res.headers.get('intuit_tid') ?? '';

/** Written to the Cloudflare logs. Never includes tokens or customer details. */
function logFault(what: string, res: Response, detail = ''): void {
  console.error(`[qbo] ${what} status=${res.status} intuit_tid=${intuitTid(res) || 'none'}${detail ? ` ${detail}` : ''}`);
}

const withRef = (message: string, res: Response): string => {
  const tid = intuitTid(res);
  return tid ? `${message} (Intuit reference ${tid})` : message;
};

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Run a handler and turn any HttpError into a JSON error the app can show. */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: 'Something went wrong on the server. Please try again.' }, 500);
  }
}

export const configured = (env: Env): boolean => !!(env.QBO_CLIENT_ID && env.QBO_CLIENT_SECRET && env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

export function requireConfigured(env: Env): void {
  if (!configured(env)) throw new HttpError(503, 'QuickBooks has not been set up on this site yet. Abacus needs to add the QuickBooks keys.');
}

export const isSandbox = (env: Env): boolean => (env.QBO_ENV ?? 'sandbox').toLowerCase() !== 'production';
const apiBase = (env: Env) => (isSandbox(env) ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com');
const MINOR = '75';

/* ---------- Who is calling: the signed-in person's Supabase login ---------- */

export interface Caller {
  id: string;
  token: string;
}

export async function caller(request: Request, env: Env): Promise<Caller> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please sign in again.');
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, 'Please sign in again.');
  const user = (await res.json()) as { id?: string };
  if (!user.id) throw new HttpError(401, 'Please sign in again.');
  return { id: user.id, token };
}

/** Talk to the database as the signed-in person, so the same row rules apply as in the app. */
export async function db<T>(env: Env, who: Caller, path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: env.SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${who.token}`,
      'Content-Type': 'application/json',
      Prefer: init.prefer ?? 'return=representation',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (/row-level security|permission denied/i.test(text)) throw new HttpError(403, 'This login has not been given access to the app yet.');
    throw new HttpError(502, 'Could not reach the database. Please try again.');
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ---------- Keeping the QuickBooks tokens private: encrypted before they are saved ---------- */

const b64 = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Array.from(atob(s), (c) => c.charCodeAt(0)));

async function aesKey(env: Env): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(`${env.QBO_CLIENT_SECRET}:job-margin-checker:tokens`);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(env: Env, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text));
  return `${b64(iv)}.${b64(out)}`;
}

export async function unseal(env: Env, sealed: string): Promise<string> {
  const [iv, data] = sealed.split('.');
  try {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(data));
    return new TextDecoder().decode(out);
  } catch {
    throw new HttpError(409, 'The saved QuickBooks connection can no longer be read. Please connect QuickBooks again in Settings.');
  }
}

/* ---------- Intuit OAuth ---------- */

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

export const redirectUri = (request: Request): string => `${new URL(request.url).origin}/`;

const basic = (env: Env) => `Basic ${btoa(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`)}`;

interface TokenReply {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}

export async function tokenRequest(env: Env, form: Record<string, string>): Promise<TokenReply> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basic(env), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) {
    logFault('token request failed', res);
    throw new HttpError(
      res.status === 400 || res.status === 401 ? 409 : 502,
      withRef('QuickBooks did not accept the connection. Please try connecting again in Settings.', res),
    );
  }
  return (await res.json()) as TokenReply;
}

export async function revoke(env: Env, refreshToken: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basic(env), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: refreshToken }),
    });
  } catch {
    /* disconnecting here still works even if Intuit cannot be reached */
  }
}

export interface Connection {
  realm_id: string;
  env: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string;
  company_name: string | null;
}

export const expiryIso = (seconds: number): string => new Date(Date.now() + seconds * 1000).toISOString();

export async function saveConnection(env: Env, who: Caller, realmId: string, t: TokenReply, companyName: string | null): Promise<void> {
  await db(env, who, 'jmc_qbo_connections?on_conflict=owner_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      owner_id: who.id,
      realm_id: realmId,
      env: isSandbox(env) ? 'sandbox' : 'production',
      access_token: await seal(env, t.access_token),
      refresh_token: await seal(env, t.refresh_token),
      access_expires_at: expiryIso(t.expires_in),
      refresh_expires_at: expiryIso(t.x_refresh_token_expires_in),
      company_name: companyName,
    },
  });
}

/** The saved connection with a working access token, refreshing it first if it is about to expire. */
export async function liveConnection(env: Env, who: Caller): Promise<{ realm: string; access: string }> {
  const rows = await db<Connection[]>(env, who, 'jmc_qbo_connections?select=*');
  const c = rows[0];
  if (!c) throw new HttpError(409, 'QuickBooks is not connected yet. Connect it in Settings first.');
  if ((c.env === 'sandbox') !== isSandbox(env)) {
    throw new HttpError(409, 'The saved QuickBooks connection is for a different QuickBooks setup. Please connect again in Settings.');
  }
  if (Date.parse(c.access_expires_at) - Date.now() > 60_000) return { realm: c.realm_id, access: await unseal(env, c.access_token) };
  if (Date.parse(c.refresh_expires_at) <= Date.now()) {
    throw new HttpError(409, 'The QuickBooks connection has expired. Please connect again in Settings.');
  }
  const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: await unseal(env, c.refresh_token) });
  await saveConnection(env, who, c.realm_id, t, c.company_name);
  return { realm: c.realm_id, access: t.access_token };
}

/* ---------- Calling QuickBooks ---------- */

export async function qbo<T>(env: Env, conn: { realm: string; access: string }, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${apiBase(env)}/v3/company/${conn.realm}/${path}${sep}minorversion=${MINOR}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${conn.access}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const why = qboFault(body);
    logFault(`${init.method ?? 'GET'} ${path.split('?')[0]} failed`, res, why ? `reason="${why.slice(0, 300)}"` : '');
    if (res.status === 401) {
      throw new HttpError(409, withRef('QuickBooks no longer accepts this connection. Please connect again in Settings.', res));
    }
    throw new HttpError(502, withRef(why ? `QuickBooks said: ${why}` : 'QuickBooks could not create the invoice. Please try again.', res));
  }
  return body as T;
}

export async function qboQuery<T>(env: Env, conn: { realm: string; access: string }, select: string): Promise<T[]> {
  const r = await qbo<{ QueryResponse?: Record<string, T[]> }>(env, conn, `query?query=${encodeURIComponent(select)}`);
  const first = Object.values(r.QueryResponse ?? {}).find(Array.isArray);
  return (first as T[] | undefined) ?? [];
}

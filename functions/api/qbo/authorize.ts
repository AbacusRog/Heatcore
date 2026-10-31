import { caller, configured, guard, json, redirectUri, requireConfigured } from '../../_lib/server';
import type { Ctx } from '../../_lib/server';

/** Gives the app the address on Intuit's site where the person approves the connection. */
export const onRequestGet = ({ request, env }: Ctx): Promise<Response> =>
  guard(async () => {
    requireConfigured(env);
    await caller(request, env);
    const state = new URL(request.url).searchParams.get('state') ?? '';
    if (!/^[a-f0-9]{16,64}$/.test(state)) return json({ error: 'Bad request.' }, 400);
    const q = new URLSearchParams({
      client_id: env.QBO_CLIENT_ID ?? '',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: redirectUri(request),
      response_type: 'code',
      state,
    });
    return json({ url: `https://appcenter.intuit.com/connect/oauth2?${q.toString()}`, configured: configured(env) });
  });

import { caller, guard, HttpError, json, qbo, redirectUri, requireConfigured, saveConnection, tokenRequest } from '../../_lib/server';
import type { Ctx } from '../../_lib/server';

/** Trades the one-time code from Intuit for tokens and saves them, encrypted, against this login. */
export const onRequestPost = ({ request, env }: Ctx): Promise<Response> =>
  guard(async () => {
    requireConfigured(env);
    const who = await caller(request, env);
    const { code, realmId } = (await request.json().catch(() => ({}))) as { code?: string; realmId?: string };
    if (!code || !realmId || !/^[0-9]{5,30}$/.test(realmId)) throw new HttpError(400, 'The QuickBooks reply was incomplete. Please try again.');

    const tokens = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(request) });
    let company: string | null = null;
    try {
      const info = await qbo<{ CompanyInfo?: { CompanyName?: string } }>(env, { realm: realmId, access: tokens.access_token }, `companyinfo/${realmId}`);
      company = info.CompanyInfo?.CompanyName ?? null;
    } catch {
      company = null;
    }
    await saveConnection(env, who, realmId, tokens, company);
    return json({ company_name: company });
  });

import { caller, configured, db, guard, isSandbox, json } from '../../_lib/server';
import type { Ctx } from '../../_lib/server';

export const onRequestGet = ({ request, env }: Ctx): Promise<Response> =>
  guard(async () => {
    if (!configured(env)) return json({ configured: false, connected: false });
    const who = await caller(request, env);
    const rows = await db<Array<{ realm_id: string; company_name: string | null }>>(env, who, 'jmc_qbo_connections?select=realm_id,company_name');
    const c = rows[0];
    return json({
      configured: true,
      connected: !!c,
      env: isSandbox(env) ? 'sandbox' : 'production',
      company_name: c?.company_name ?? null,
      realm_id: c?.realm_id,
    });
  });

import { caller, db, guard, json, requireConfigured, revoke, unseal } from '../../_lib/server';
import type { Ctx } from '../../_lib/server';

export const onRequestPost = ({ request, env }: Ctx): Promise<Response> =>
  guard(async () => {
    requireConfigured(env);
    const who = await caller(request, env);
    const rows = await db<Array<{ refresh_token: string }>>(env, who, 'jmc_qbo_connections?select=refresh_token');
    if (rows[0]) {
      try {
        await revoke(env, await unseal(env, rows[0].refresh_token));
      } catch {
        /* removing our copy is what matters */
      }
    }
    await db(env, who, `jmc_qbo_connections?owner_id=eq.${who.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    return json({ ok: true });
  });

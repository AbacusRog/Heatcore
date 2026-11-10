import { mapCustomer, mapInvoice, isVoided, uniqueNumbers } from '../../../src/lib/qboImport';
import type { QboCustomer, QboInvoice } from '../../../src/lib/qboImport';
import { caller, db, guard, HttpError, json, liveConnection, qboQuery, requireConfigured } from '../../_lib/server';
import type { Ctx } from '../../_lib/server';

/* Copies customers and invoices out of QuickBooks into the app. Read only: nothing is changed in QuickBooks.
   One page of 100 per call so each call stays well inside the host's limits; the app keeps calling until done. */

const PAGE = 100;
const quoted = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export const onRequestPost = ({ request, env }: Ctx): Promise<Response> =>
  guard(async () => {
    requireConfigured(env);
    const who = await caller(request, env);
    let body: { stage?: string; start?: number } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    const stage = body.stage;
    const start = Number.isInteger(body.start) && (body.start as number) >= 1 ? (body.start as number) : 1;
    if (stage !== 'customers' && stage !== 'invoices') throw new HttpError(400, 'Unknown import step.');
    const conn = await liveConnection(env, who);

    if (stage === 'customers') {
      const list = await qboQuery<QboCustomer>(env, conn, `select * from Customer orderby Id startposition ${start} maxresults ${PAGE}`);
      const rows = list.map(mapCustomer).filter((r): r is NonNullable<typeof r> => !!r);
      let added = 0;
      if (rows.length) {
        // Same name twice in one page would be rejected; keep the first.
        const seen = new Set<string>();
        const unique = rows.filter((r) => !seen.has(r.name.toLowerCase().trim()) && !!seen.add(r.name.toLowerCase().trim()));
        const saved = await db<Array<{ id: string }>>(env, who, 'jmc_customers?on_conflict=owner_id,name_key&select=id', {
          method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=representation',
          body: unique,
        });
        added = saved?.length ?? 0;
      }
      return json({ fetched: list.length, added, next: list.length === PAGE ? start + PAGE : null });
    }

    const list = await qboQuery<QboInvoice>(env, conn, `select * from Invoice orderby Id startposition ${start} maxresults ${PAGE}`);
    const mapped = list.filter((i) => !isVoided(i)).map((i) => mapInvoice(i, () => crypto.randomUUID()));
    let added = 0;
    if (mapped.length) {
      const nums = [...new Set(mapped.map((r) => r.number))];
      const taken = await db<Array<{ number: string; qbo_id: string | null }>>(
        env,
        who,
        `jmc_invoices?select=number,qbo_id&number=in.(${nums.map(quoted).join(',')})`,
      );
      const alreadyIds = new Set(
        (await db<Array<{ qbo_id: string }>>(env, who, `jmc_invoices?select=qbo_id&qbo_id=in.(${mapped.map((r) => quoted(r.qbo_id)).join(',')})`)).map((r) => r.qbo_id),
      );
      const fresh = mapped.filter((r) => !alreadyIds.has(r.qbo_id));
      const rows = uniqueNumbers(fresh, new Set(taken.map((t) => t.number)));
      if (rows.length) {
        const saved = await db<Array<{ id: string }>>(env, who, 'jmc_invoices?on_conflict=owner_id,qbo_id&select=id', {
          method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=representation',
          body: rows,
        });
        added = saved?.length ?? 0;
      }
    }
    return json({ fetched: list.length, added, next: list.length === PAGE ? start + PAGE : null });
  });

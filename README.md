# Job Margin Checker

Phone-first web app that works out profit and cashflow for each job from materials, labour, CIS, VAT and extra costs.

Stack: React + Vite + TypeScript + Tailwind CSS + Supabase. Installable to the home screen and works offline (service worker via `vite-plugin-pwa`).

## Where the data lives

Jobs are saved to the `jmc_jobs` table in the **Clients** Supabase project (public schema), one row per job with the full job in a `data` jsonb column. This app is the only thing that uses `jmc_jobs` and `jmc_users`; no other app or table is touched.

Sign-in is Supabase email and password. There is no sign-up screen. A login only sees its own jobs (row level security on `owner_id`), and only logins listed in `jmc_users` can save or read anything. A login that exists in Clients for another app gets nothing here until it is added.

Edits are written to the phone first and saved to Supabase in the background. Offline, they wait and are sent when the phone reconnects. The badge at the top of each screen shows Saved, Saving or Offline.

## Giving a client a login

1. Supabase, Clients project, Authentication, Users, Add user, Create new user. Enter their email and a password and tick Auto Confirm User.
2. SQL Editor, run (with their email):

```sql
insert into public.jmc_users (user_id, note)
select id, 'Client name' from auth.users where email = 'client@example.com';
```

To stop a login using the app, delete its row from `jmc_users`.

## Run it

```bash
npm install
cp .env.example .env.local   # Supabase URL and publishable key
npm run dev
npm test                     # calculation and sync-merge tests
npm run build                # type check + production build into dist/
```

## Deploy on Cloudflare Pages

Connect the GitHub repo, then set:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `NODE_VERSION` = `20`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (values are in `.env.example`, pointing at the Clients project)

In Supabase, add the deployed address under Authentication, URL Configuration, if you ever add email links or password resets.

## How the figures are worked out

All the maths lives in `src/lib/calc.ts`, with tests in `src/lib/calc.test.ts`.

- Profit = invoice ex VAT − materials cost − extra costs − your labour cost. VAT is neither income nor cost.
- CIS is deducted from the labour charge only (not materials, not VAT). It is a tax credit: it reduces cash now, not profit.
- Net cash = cash received (after CIS) + VAT reclaimed on purchases − VAT due on the invoice (zero under reverse charge) − everything paid out including VAT.
- Net cash + CIS credit always equals profit.

## Database setup

Two tables, `jmc_users` (approved logins) and `jmc_jobs` (jobs), each with row level security on and no access for anonymous visitors. The policy on `jmc_jobs` allows a row only when `owner_id` is the signed-in user and that user is listed in `jmc_users`. The SQL is in `supabase/job_margin_checker.sql`.

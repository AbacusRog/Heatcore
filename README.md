# Job Margin Checker

Phone-first web app that works out profit and cashflow for each job from materials, labour, CIS, VAT and extra costs.

Stack: React + Vite + TypeScript + Tailwind CSS + Supabase. Installable to the home screen and works offline (service worker via `vite-plugin-pwa`).

## Where the data lives

Jobs are saved to the `jmc_jobs` table in the **Abacus** Supabase project (public schema), one row per job with the full job in a `data` jsonb column. Sign-in is Supabase email and password, using the same staff check (`is_staff()`) as the other Abacus apps. Row level security means a login only ever sees its own jobs, and logins that are not staff see nothing.

Edits are written to the phone first and saved to Supabase in the background. Offline, they wait and are sent when the phone reconnects. The badge at the top of each screen shows Saved, Saving or Offline.

There is no sign-up screen. Use the login you already have in the Abacus project.

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
- Environment variables: `NODE_VERSION` = `20`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (values are in `.env.example`)

In Supabase, add the deployed address under Authentication, URL Configuration, if you ever add email links or password resets.

## How the figures are worked out

All the maths lives in `src/lib/calc.ts`, with tests in `src/lib/calc.test.ts`.

- Profit = invoice ex VAT − materials cost − extra costs − your labour cost. VAT is neither income nor cost.
- CIS is deducted from the labour charge only (not materials, not VAT). It is a tax credit: it reduces cash now, not profit.
- Net cash = cash received (after CIS) + VAT reclaimed on purchases − VAT due on the invoice (zero under reverse charge) − everything paid out including VAT.
- Net cash + CIS credit always equals profit.

## Moving the table

The table, index and policy are one migration. To move the app to another Supabase project, run the same SQL there (it needs a function like `is_staff()`, or change the policy to `owner_id = auth.uid()` only), then change the two environment variables.

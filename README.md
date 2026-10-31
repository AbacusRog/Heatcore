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

## Quotes, invoices and the customer link

Tabs along the bottom: Jobs, Quotes, Invoices, Settings.

- **Settings**: business name, address, VAT number, logo (resized on the phone and saved with the settings), numbering, payment details, terms.
- **Quotes**: start one from the Quotes tab, or from a job (Results, Create a quote from this job). The quote shows line items and totals only. A job's costs and margin never go on it.
- **Email to customer** marks the quote as sent and opens the phone's email app with the message and the customer's private link ready. There is no sending service: Stuart presses Send in his own mail app. The link looks like `https://<site>/#/q/<long random code>`.
- **Customer**: opens the link, no login, reads the quote and types their name to **Accept**, or **Declines**. The answer shows in the app (Quotes tab, with a badge for accepted quotes waiting).
- **Turn into an invoice** copies an accepted quote into a draft invoice with the next invoice number.
- **Invoices**: email a copy (same link method, `#/i/<code>`), print or save as PDF, mark paid, send to QuickBooks.

Quotes and invoices are always read from the database (they change when a customer answers), so they need a signal. Jobs still work offline.

## QuickBooks (live send)

The app creates the invoice in the connected QuickBooks Online company. It runs from Cloudflare Pages Functions in `functions/`, because the QuickBooks keys must stay on the server.

1. In the Intuit Developer portal, make an app with the **Accounting** scope. Add the redirect URI `https://<your site>/` (the address with a trailing slash, nothing after it). Use the Development (sandbox) keys first.
2. In Cloudflare Pages, Settings, Variables and Secrets, add:
   - `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` (make the secret an encrypted secret)
   - `QBO_ENV` = `sandbox` (change to `production` once Intuit has approved production keys)
   - `SUPABASE_URL` = the Clients project URL, and `SUPABASE_ANON_KEY` = its publishable key (the same two values as in `.env.example`)
   - Optional, only if the tax codes are not found by name: `QBO_TAXCODE_STD`, `QBO_TAXCODE_RC`, `QBO_TAXCODE_NONE` (the QuickBooks tax code ids)
3. Redeploy, sign in, Settings, **Connect QuickBooks**.

Notes:
- Sandbox keys connect to Intuit's test company only. Production keys need Intuit's app review. Until then nothing reaches the client's real books.
- QuickBooks needs a Service item to put the lines on. It uses one called "Services", or the first Service item it finds.
- The customer is matched by name, or created. Lines go in ex VAT with the 20% VAT, 20% reverse charge or No VAT tax code matched by name. If a code cannot be found the app says which, and lists the codes it can see.
- The invoice number is left for QuickBooks to assign. The app's own number is put in the QuickBooks private note.
- The access and refresh tokens are encrypted before they are saved, using the QuickBooks secret, and are only read by these functions.

## Run it

```bash
npm install
cp .env.example .env.local   # Supabase URL and publishable key
npm run dev
npm test                     # calculation and sync-merge tests
npm run build                # type check (app and functions) + production build into dist/
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

Run `supabase/job_margin_checker.sql` first, then `supabase/job_margin_checker_quotes.sql`. Tables: `jmc_users` (approved logins), `jmc_jobs`, `jmc_settings`, `jmc_quotes`, `jmc_invoices`, `jmc_qbo_connections`. Every table has row level security on, no access for anonymous visitors, and a policy that allows a row only when `owner_id` is the signed-in user and that user is listed in `jmc_users`.

Customers have no login. Three small functions (`jmc_public_quote`, `jmc_public_invoice`, `jmc_respond_quote`) let someone holding the long private link read that one quote or invoice and answer a quote once. They are the only things an anonymous visitor can run, and Supabase's advisor will list them as "callable without signing in" on purpose.

-- Job Margin Checker: saved customers and invoices imported from QuickBooks.
-- Run once in the Clients project, after job_margin_checker_quotes.sql. Touches only jmc_* objects.

create table public.jmc_customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- One customer per name (ignoring case and spaces). The QuickBooks import relies on this to skip ones already here.
  name_key text generated always as (lower(btrim(name))) stored,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  source text not null default 'app' check (source in ('app', 'quickbooks')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name_key)
);

create trigger jmc_customers_touch before update on public.jmc_customers for each row execute function public.jmc_touch();

alter table public.jmc_customers enable row level security;
revoke all on public.jmc_customers from anon;
create policy "own rows for approved logins" on public.jmc_customers for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.jmc_users u where u.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.jmc_users u where u.user_id = (select auth.uid())));

-- Invoices copied in from QuickBooks are records only. Their totals come from QuickBooks, not from our lines.
alter table public.jmc_invoices
  add column imported boolean not null default false,
  add column imported_totals jsonb,
  add constraint jmc_invoices_owner_qbo_key unique (owner_id, qbo_id);

-- The customer link page needs the imported totals too.
create or replace function public.jmc_public_invoice(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', i.number, 'status', i.status, 'customer_name', i.customer_name,
    'customer_address', i.customer_address, 'title', i.title, 'lines', i.lines,
    'vat_mode', i.vat_mode, 'notes', i.notes, 'issue_date', i.issue_date, 'due_date', i.due_date,
    'imported_totals', i.imported_totals,
    'business', jsonb_build_object('name', s.business_name, 'address', s.address, 'email', s.email,
      'phone', s.phone, 'vat_number', s.vat_number, 'logo', s.logo, 'bank', s.bank_details, 'terms', s.invoice_terms))
  from public.jmc_invoices i
  left join public.jmc_settings s on s.owner_id = i.owner_id
  where length(coalesce(p_token, '')) >= 32 and i.token = p_token and i.status <> 'draft'
$$;

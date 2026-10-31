-- Job Margin Checker: quotes, invoices, business settings and QuickBooks connection.
-- Run once in the Clients project, after job_margin_checker.sql. Touches only jmc_* objects.

create or replace function public.jmc_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Business details shown on quotes and invoices, one row per login.
create table public.jmc_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  business_name text not null default '',
  address text not null default '',
  email text not null default '',
  phone text not null default '',
  vat_number text not null default '',
  logo text,
  quote_prefix text not null default 'Q-',
  invoice_prefix text not null default 'INV-',
  next_quote_no int not null default 1,
  next_invoice_no int not null default 1,
  payment_days int not null default 14,
  quote_valid_days int not null default 30,
  bank_details text not null default '',
  quote_terms text not null default '',
  invoice_terms text not null default '',
  default_vat text not null default 'std' check (default_vat in ('std', 'rc', 'none')),
  updated_at timestamptz not null default now()
);

create table public.jmc_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'invoiced')),
  customer_name text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  title text not null default '',
  lines jsonb not null default '[]',
  vat_mode text not null default 'std' check (vat_mode in ('std', 'rc', 'none')),
  notes text not null default '',
  issue_date date not null default current_date,
  valid_until date,
  job_id uuid,
  sent_at timestamptz,
  responded_at timestamptz,
  responder_name text,
  response_note text,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, number)
);
create index jmc_quotes_owner_idx on public.jmc_quotes (owner_id, updated_at desc);

create table public.jmc_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  quote_id uuid,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  title text not null default '',
  lines jsonb not null default '[]',
  vat_mode text not null default 'std' check (vat_mode in ('std', 'rc', 'none')),
  notes text not null default '',
  issue_date date not null default current_date,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  qbo_id text,
  qbo_doc text,
  qbo_exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, number)
);
create index jmc_invoices_owner_idx on public.jmc_invoices (owner_id, updated_at desc);

-- QuickBooks connection. The app encrypts both tokens before saving them.
create table public.jmc_qbo_connections (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  realm_id text not null,
  env text not null default 'sandbox',
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  company_name text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger jmc_settings_touch before update on public.jmc_settings for each row execute function public.jmc_touch();
create trigger jmc_quotes_touch before update on public.jmc_quotes for each row execute function public.jmc_touch();
create trigger jmc_invoices_touch before update on public.jmc_invoices for each row execute function public.jmc_touch();
create trigger jmc_qbo_touch before update on public.jmc_qbo_connections for each row execute function public.jmc_touch();

-- Same rule as jmc_jobs: your own rows, and only for logins listed in jmc_users.
do $$
declare t text;
begin
  foreach t in array array['jmc_settings', 'jmc_quotes', 'jmc_invoices', 'jmc_qbo_connections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "own rows for approved logins" on public.%I for all to authenticated
         using (owner_id = (select auth.uid()) and exists (select 1 from public.jmc_users u where u.user_id = (select auth.uid())))
         with check (owner_id = (select auth.uid()) and exists (select 1 from public.jmc_users u where u.user_id = (select auth.uid())))',
      t);
  end loop;
end $$;

-- What a customer sees when they open the emailed link. Needs the long private token; drafts are never shown.
create function public.jmc_public_quote(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', q.number, 'status', q.status, 'customer_name', q.customer_name,
    'customer_address', q.customer_address, 'title', q.title, 'lines', q.lines,
    'vat_mode', q.vat_mode, 'notes', q.notes, 'issue_date', q.issue_date,
    'valid_until', q.valid_until, 'responded_at', q.responded_at, 'responder_name', q.responder_name,
    'business', jsonb_build_object('name', s.business_name, 'address', s.address, 'email', s.email,
      'phone', s.phone, 'vat_number', s.vat_number, 'logo', s.logo, 'terms', s.quote_terms))
  from public.jmc_quotes q
  left join public.jmc_settings s on s.owner_id = q.owner_id
  where length(coalesce(p_token, '')) >= 32 and q.token = p_token and q.status <> 'draft'
$$;

create function public.jmc_public_invoice(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', i.number, 'status', i.status, 'customer_name', i.customer_name,
    'customer_address', i.customer_address, 'title', i.title, 'lines', i.lines,
    'vat_mode', i.vat_mode, 'notes', i.notes, 'issue_date', i.issue_date, 'due_date', i.due_date,
    'business', jsonb_build_object('name', s.business_name, 'address', s.address, 'email', s.email,
      'phone', s.phone, 'vat_number', s.vat_number, 'logo', s.logo, 'bank', s.bank_details, 'terms', s.invoice_terms))
  from public.jmc_invoices i
  left join public.jmc_settings s on s.owner_id = i.owner_id
  where length(coalesce(p_token, '')) >= 32 and i.token = p_token and i.status <> 'draft'
$$;

-- The customer accepts or declines. Only a quote that is still waiting can be answered, once.
create function public.jmc_respond_quote(p_token text, p_accept boolean, p_name text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.jmc_quotes;
begin
  if length(coalesce(p_token, '')) < 32 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into q from public.jmc_quotes where token = p_token for update;
  if not found or q.status = 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if q.status <> 'sent' then
    return jsonb_build_object('ok', false, 'error', 'already_answered', 'status', q.status);
  end if;
  if p_accept and q.valid_until is not null and q.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if p_accept and length(btrim(coalesce(p_name, ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  update public.jmc_quotes
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now(),
         responder_name = nullif(left(btrim(coalesce(p_name, '')), 120), ''),
         response_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = q.id;
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'accepted' else 'declined' end);
end $$;

revoke execute on function public.jmc_public_quote(text), public.jmc_public_invoice(text),
  public.jmc_respond_quote(text, boolean, text, text), public.jmc_touch() from public;
grant execute on function public.jmc_public_quote(text), public.jmc_public_invoice(text),
  public.jmc_respond_quote(text, boolean, text, text) to anon, authenticated;

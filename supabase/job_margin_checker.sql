-- Job Margin Checker tables. Run once in the Clients project (already applied).
create table public.jmc_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.jmc_users enable row level security;
revoke all on public.jmc_users from anon;
create policy "read own access row" on public.jmc_users
  for select to authenticated using (user_id = (select auth.uid()));

create table public.jmc_jobs (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ref text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jmc_jobs_owner_updated_idx on public.jmc_jobs (owner_id, updated_at desc);
alter table public.jmc_jobs enable row level security;
revoke all on public.jmc_jobs from anon;
create policy "own jobs for approved logins" on public.jmc_jobs
  for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.jmc_users u where u.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.jmc_users u where u.user_id = (select auth.uid())));

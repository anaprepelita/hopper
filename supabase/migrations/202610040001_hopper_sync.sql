-- Run in the Supabase SQL editor for the project configured in .env.local.
create table if not exists public.hopper_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint snapshot_object check (jsonb_typeof(data) = 'object'),
  constraint snapshot_size check (octet_length(data::text) <= 2097152),
  constraint no_local_credentials check (not (data ?| array['password', 'profilePhoto', 'email', 'cloudAccountId', 'cloudProject']))
);
alter table public.hopper_accounts enable row level security;
revoke all on public.hopper_accounts from anon;
grant select, insert, update on public.hopper_accounts to authenticated;
drop policy if exists hopper_owner_select on public.hopper_accounts;
create policy hopper_owner_select on public.hopper_accounts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists hopper_owner_insert on public.hopper_accounts;
create policy hopper_owner_insert on public.hopper_accounts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists hopper_owner_update on public.hopper_accounts;
create policy hopper_owner_update on public.hopper_accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Compare-and-swap prevents a delayed phone upload from replacing a newer revision.
create or replace function public.hopper_save_snapshot(expected_revision bigint, snapshot jsonb)
returns setof public.hopper_accounts
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if expected_revision = 0 then
    return query insert into public.hopper_accounts(user_id, data, revision)
      values(auth.uid(), snapshot, 1)
      on conflict (user_id) do nothing returning *;
  else
    return query update public.hopper_accounts set data = snapshot,
      revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision returning *;
  end if;
end;
$$;
revoke all on function public.hopper_save_snapshot(bigint, jsonb) from public, anon;
grant execute on function public.hopper_save_snapshot(bigint, jsonb) to authenticated;

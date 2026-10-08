begin;
drop policy if exists hopper_require_mfa on public.hopper_accounts;
drop policy if exists hopper_require_email_code on public.hopper_accounts;
drop policy if exists hopper_require_verified_auth on public.hopper_accounts;
create policy hopper_require_verified_auth
on public.hopper_accounts
as restrictive
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and nullif((select auth.jwt()->>'email'), '') is not null
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
  and (
    (select auth.jwt()->'amr') @> '[{"method":"password"}]'::jsonb
    or (select auth.jwt()->'amr') @> '[{"method":"otp"}]'::jsonb
    or (select auth.jwt()->'amr') @> '[{"method":"email/signup"}]'::jsonb
  )
)
with check (
  (select auth.uid()) = user_id
  and nullif((select auth.jwt()->>'email'), '') is not null
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
  and (
    (select auth.jwt()->'amr') @> '[{"method":"password"}]'::jsonb
    or (select auth.jwt()->'amr') @> '[{"method":"otp"}]'::jsonb
    or (select auth.jwt()->'amr') @> '[{"method":"email/signup"}]'::jsonb
  )
);
commit;

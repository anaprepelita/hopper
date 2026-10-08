-- Require MFA for every read and write, including the existing snapshot RPC.
drop policy if exists hopper_require_mfa on public.hopper_accounts;
create policy hopper_require_mfa
on public.hopper_accounts
as restrictive
for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

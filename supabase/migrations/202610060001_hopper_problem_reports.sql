-- Private reports/evidence: no client SELECT/INSERT policies or public file access.
create table if not exists public.hopper_problem_reports (
  id uuid primary key,
  fingerprint text not null,
  summary text not null check (char_length(summary) between 1 and 120),
  description text not null check (char_length(description) between 1 and 2000),
  version text not null default '',
  build text not null default '',
  state text not null default 'sending' check (state in ('sending','sent','failed')),
  attempts integer not null default 1,
  lease_until timestamptz not null default now()+interval '2 minutes',
  email_payload jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.hopper_problem_reports enable row level security;
revoke all on public.hopper_problem_reports from public, anon, authenticated;
grant all on public.hopper_problem_reports to service_role;

create table if not exists public.hopper_report_limits (
  key text primary key,
  requests integer not null default 0,
  expires_at timestamptz not null
);
alter table public.hopper_report_limits enable row level security;
revoke all on public.hopper_report_limits from public, anon, authenticated;
grant all on public.hopper_report_limits to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hopper-problem-evidence','hopper-problem-evidence',false,15728640,
array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No storage.objects client policies are added. Only service_role uploads/creates signed URLs.

create or replace function public.hopper_reserve_report(
  report_id uuid, report_fingerprint text, client_hash text,
  report_summary text, report_description text, report_version text, report_build text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  existing public.hopper_problem_reports;
  ip_key text := 'ip:'||client_hash||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD-HH24');
  day_key text := 'global:'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
begin
  perform pg_catalog.pg_advisory_xact_lock(732164920);
  select * into existing from public.hopper_problem_reports where id=report_id;
  if found then
    if existing.fingerprint<>report_fingerprint then return jsonb_build_object('state','conflict'); end if;
    if existing.state='sent' then return jsonb_build_object('state','sent'); end if;
    if existing.created_at<now()-interval '23 hours' or existing.attempts>=5 then return jsonb_build_object('state','expired'); end if;
    if existing.state='sending' and existing.lease_until>now() then return jsonb_build_object('state','busy'); end if;
  end if;
  delete from public.hopper_report_limits where expires_at<now();
  if coalesce((select requests from public.hopper_report_limits where key=ip_key),0)>=5
    or coalesce((select requests from public.hopper_report_limits where key=day_key),0)>=100
    then return jsonb_build_object('state','rate_limited'); end if;
  insert into public.hopper_report_limits(key,requests,expires_at) values(ip_key,1,now()+interval '2 hours'),(day_key,1,now()+interval '2 days')
    on conflict(key) do update set requests=public.hopper_report_limits.requests+1;
  if existing.id is not null then
    update public.hopper_problem_reports set state='sending',lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=report_id;
    return jsonb_build_object('state','retry','payload',existing.email_payload);
  end if;
  insert into public.hopper_problem_reports(id,fingerprint,summary,description,version,build)
    values(report_id,report_fingerprint,report_summary,report_description,report_version,report_build);
  return jsonb_build_object('state','new');
end;
$$;
revoke all on function public.hopper_reserve_report(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hopper_reserve_report(uuid,text,text,text,text,text,text) to service_role;

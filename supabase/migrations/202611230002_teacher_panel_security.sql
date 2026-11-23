-- A teacher may read profiles for staff verification, but must never be able
-- to promote their own profile to admin through the dashboard.
drop policy if exists "staff manage profiles" on public.profiles;

create table if not exists public.staff_request_events (
  id bigint generated always as identity primary key,
  staff_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('enroll','scan','template_list','template_delete')),
  created_at timestamptz not null default now()
);
create index if not exists staff_request_events_limit_idx on public.staff_request_events(staff_id,event_type,created_at desc);
alter table public.staff_request_events enable row level security;
revoke all on public.staff_request_events from anon, authenticated;

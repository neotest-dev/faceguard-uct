create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  role text not null default 'teacher' check (role in ('teacher','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique check (student_code ~ '^[A-Za-z0-9_-]{2,32}$'),
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_at timestamptz not null default now()
);
create table if not exists public.laboratories (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  location text, status text not null default 'active' check (status in ('active','inactive'))
);
create table if not exists public.biometric_consents (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  consent_version text not null, accepted_at timestamptz not null default now(), revoked_at timestamptz,
  unique (student_id, consent_version, accepted_at)
);
create table if not exists public.biometric_templates (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  encrypted_descriptor text not null, model_version text not null, consent_reference uuid not null references public.biometric_consents(id),
  created_at timestamptz not null default now()
);
create index if not exists biometric_templates_student_idx on public.biometric_templates(student_id);
create table if not exists public.access_permissions (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  valid_from date not null, valid_until date not null, allowed_days smallint not null check (allowed_days between 1 and 127),
  start_time time not null, end_time time not null, status text not null default 'active' check (status in ('active','revoked','expired')),
  check (valid_until >= valid_from), check (end_time > start_time)
);
create index if not exists access_permissions_lookup_idx on public.access_permissions(student_id, laboratory_id, status, valid_from, valid_until);
create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(), student_id uuid references public.students(id) on delete set null,
  laboratory_id uuid references public.laboratories(id) on delete set null,
  result text not null check (result in ('authorized','denied','unknown','additional_check')),
  reason text not null, created_at timestamptz not null default now()
);
create index if not exists access_logs_created_idx on public.access_logs(created_at desc);

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('teacher','admin'));
$$;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.laboratories enable row level security;
alter table public.biometric_consents enable row level security;
alter table public.biometric_templates enable row level security;
alter table public.access_permissions enable row level security;
alter table public.access_logs enable row level security;
create policy "staff read profiles" on public.profiles for select to authenticated using (public.is_staff());
create policy "staff manage profiles" on public.profiles for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff manage students" on public.students for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "public active labs" on public.laboratories for select to anon, authenticated using (status = 'active');
create policy "staff manage labs" on public.laboratories for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff manage consents" on public.biometric_consents for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff manage permissions" on public.access_permissions for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff view logs" on public.access_logs for select to authenticated using (public.is_staff());
create policy "staff insert logs" on public.access_logs for insert to authenticated with check (public.is_staff());
-- No client policy on biometric_templates: only the Edge Function's service role can read/write ciphertext.
revoke all on public.biometric_templates from anon, authenticated;

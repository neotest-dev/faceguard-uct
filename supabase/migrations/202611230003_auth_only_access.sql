-- Authentication-only staff model: Supabase Auth accounts are provisioned by
-- an administrator; public sign-up must remain disabled in Auth settings.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select (select auth.uid()) is not null;
$function$;
grant execute on function public.is_staff() to authenticated;

-- Profiles are intentionally not part of the authorization or app flow.
drop policy if exists "staff read profiles" on public.profiles;
drop policy if exists "staff manage profiles" on public.profiles;
revoke all on public.profiles from anon, authenticated;

-- Supabase Data API grants are separate from RLS policies.
grant select on public.laboratories to anon, authenticated;
grant insert, update on public.laboratories to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.access_permissions to authenticated;
grant select, insert on public.access_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

notify pgrst, 'reload schema';

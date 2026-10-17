alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Profiles are visible to own organization" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Organization managers can update staff profiles" on public.profiles;

create policy "Profiles are visible to own organization"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or private.is_global_admin(auth.uid())
  or exists (
    select 1
    from public.organization_members viewer
    join public.organization_members target
      on target.organization_id = viewer.organization_id
    where viewer.user_id = auth.uid()
      and target.user_id = profiles.id
  )
);

create policy "Users can create own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Organization managers can update staff profiles"
on public.profiles for update
to authenticated
using (
  private.is_global_admin(auth.uid())
  or exists (
    select 1
    from public.organization_members manager
    join public.organization_members target
      on target.organization_id = manager.organization_id
    where manager.user_id = auth.uid()
      and manager.role in ('owner', 'admin', 'project_manager')
      and target.user_id = profiles.id
  )
)
with check (
  private.is_global_admin(auth.uid())
  or exists (
    select 1
    from public.organization_members manager
    join public.organization_members target
      on target.organization_id = manager.organization_id
    where manager.user_id = auth.uid()
      and manager.role in ('owner', 'admin', 'project_manager')
      and target.user_id = profiles.id
  )
);

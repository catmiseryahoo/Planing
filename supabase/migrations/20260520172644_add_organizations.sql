create table if not exists public.organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.organization_members (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (organization_id, user_id)
);

alter table public.profiles
add column if not exists is_super_admin boolean not null default false;

alter table public.projects
add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_global_admin(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.is_super_admin = true
  );
$$;

create or replace function private.organization_role(target_organization_id uuid, target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select om.role
  from public.organization_members om
  where om.organization_id = target_organization_id
    and om.user_id = target_user_id
  limit 1;
$$;

revoke all on function private.is_global_admin(uuid) from public;
revoke all on function private.organization_role(uuid, uuid) from public;
grant execute on function private.is_global_admin(uuid) to authenticated;
grant execute on function private.organization_role(uuid, uuid) to authenticated;

insert into public.organizations (name, owner_id)
select
  'Основная организация',
  (select p.id from public.profiles p where p.role = 'Администратор' order by p.created_at nulls last limit 1)
where not exists (select 1 from public.organizations);

insert into public.organization_members (organization_id, user_id, role)
select
  o.id,
  p.id,
  case
    when p.id = o.owner_id then 'owner'
    when p.role = 'Администратор' then 'admin'
    when p.role = 'Менеджер проектов' then 'project_manager'
    else 'member'
  end
from public.organizations o
cross join public.profiles p
where o.name = 'Основная организация'
on conflict (organization_id, user_id) do nothing;

update public.projects
set organization_id = (select id from public.organizations order by created_at limit 1)
where organization_id is null;

alter table public.projects
alter column organization_id set not null;

drop policy if exists "Organization members can read organizations" on public.organizations;
drop policy if exists "Admins can create organizations" on public.organizations;
drop policy if exists "Organization admins can update organizations" on public.organizations;
drop policy if exists "Organization members can read organization members" on public.organization_members;
drop policy if exists "Admins can manage organization members" on public.organization_members;

create policy "Organization members can read organizations"
on public.organizations for select
to authenticated
using (
  private.organization_role(organizations.id, auth.uid()) is not null
  or private.is_global_admin(auth.uid())
);

create policy "Admins can create organizations"
on public.organizations for insert
to authenticated
with check (
  owner_id = auth.uid()
  and private.is_global_admin(auth.uid())
);

create policy "Organization admins can update organizations"
on public.organizations for update
to authenticated
using (
  private.organization_role(organizations.id, auth.uid()) in ('owner', 'admin')
  or private.is_global_admin(auth.uid())
)
with check (
  private.organization_role(organizations.id, auth.uid()) in ('owner', 'admin')
  or private.is_global_admin(auth.uid())
);

create policy "Organization members can read organization members"
on public.organization_members for select
to authenticated
using (
  user_id = auth.uid()
  or private.organization_role(organization_members.organization_id, auth.uid()) is not null
  or private.is_global_admin(auth.uid())
);

create policy "Admins can manage organization members"
on public.organization_members for all
to authenticated
using (
  private.organization_role(organization_members.organization_id, auth.uid()) in ('owner', 'admin')
  or private.is_global_admin(auth.uid())
)
with check (
  private.organization_role(organization_members.organization_id, auth.uid()) in ('owner', 'admin')
  or private.is_global_admin(auth.uid())
);

create index if not exists organizations_owner_idx
on public.organizations (owner_id);

create index if not exists organization_members_user_idx
on public.organization_members (user_id);

create index if not exists organization_members_org_role_idx
on public.organization_members (organization_id, role);

create index if not exists projects_organization_idx
on public.projects (organization_id);

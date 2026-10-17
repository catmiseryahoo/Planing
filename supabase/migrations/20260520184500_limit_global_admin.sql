alter table public.profiles
add column if not exists is_super_admin boolean not null default false;

update public.profiles
set is_super_admin = true
where id = coalesce(
  (
    select o.owner_id
    from public.organizations o
    where o.owner_id is not null
    order by o.created_at
    limit 1
  ),
  (
    select p.id
    from public.profiles p
    where p.role = 'Администратор'
    order by p.created_at nulls last
    limit 1
  )
)
and not exists (
  select 1
  from public.profiles p
  where p.is_super_admin = true
);

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

revoke all on function private.is_global_admin(uuid) from public;
grant execute on function private.is_global_admin(uuid) to authenticated;

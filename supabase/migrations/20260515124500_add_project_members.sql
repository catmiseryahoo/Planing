create table if not exists public.project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'Участник',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (project_id, user_id)
);

alter table public.project_members enable row level security;

drop policy if exists "Authenticated users can read project members" on public.project_members;
drop policy if exists "Admins and project leads can create project members" on public.project_members;
drop policy if exists "Admins and project leads can update project members" on public.project_members;
drop policy if exists "Admins and project leads can delete project members" on public.project_members;

create policy "Authenticated users can read project members"
on public.project_members for select
to authenticated
using (true);

create policy "Admins and project leads can create project members"
on public.project_members for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Администратор'
  )
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'Руководитель проекта'
  )
);

create policy "Admins and project leads can update project members"
on public.project_members for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Администратор'
  )
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'Руководитель проекта'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Администратор'
  )
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'Руководитель проекта'
  )
);

create policy "Admins and project leads can delete project members"
on public.project_members for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Администратор'
  )
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'Руководитель проекта'
  )
);

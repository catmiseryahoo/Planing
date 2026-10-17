create table if not exists public.project_logs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  details jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.project_logs enable row level security;

drop policy if exists "Authenticated users can read project logs" on public.project_logs;
drop policy if exists "Authenticated users can create project logs" on public.project_logs;

create policy "Authenticated users can read project logs"
on public.project_logs for select
to authenticated
using (true);

create policy "Authenticated users can create project logs"
on public.project_logs for insert
to authenticated
with check (actor_id = auth.uid());

create index if not exists project_logs_project_created_idx
on public.project_logs (project_id, created_at desc);

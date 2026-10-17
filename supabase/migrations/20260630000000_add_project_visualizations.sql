create table public.project_visualizations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  content text default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.project_visualizations enable row level security;

create policy "Project participants can read visualizations"
on public.project_visualizations for select
to authenticated
using (private.can_read_project(project_id, auth.uid()));

create policy "Project participants can create visualizations"
on public.project_visualizations for insert
to authenticated
with check (private.can_manage_tasks_in_project(project_id, auth.uid()));

create policy "Project participants can update visualizations"
on public.project_visualizations for update
to authenticated
using (private.can_manage_tasks_in_project(project_id, auth.uid()))
with check (private.can_manage_tasks_in_project(project_id, auth.uid()));

create policy "Project participants can delete visualizations"
on public.project_visualizations for delete
to authenticated
using (private.can_manage_tasks_in_project(project_id, auth.uid()));

grant select, insert, update, delete on public.project_visualizations to authenticated;

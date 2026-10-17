-- Fix SELECT RLS policy for public.tasks to prevent RLS violations during insert ... returning
create or replace function private.can_read_task_by_stage(target_stage_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.can_read_project(private.stage_project_id(target_stage_id), target_user_id);
$$;

drop policy if exists "Project readers can read tasks" on public.tasks;
create policy "Project readers can read tasks"
on public.tasks for select
to authenticated
using (private.can_read_task_by_stage(stage_id, auth.uid()));

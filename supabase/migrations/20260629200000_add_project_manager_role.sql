create or replace function private.can_manage_tasks_in_project(target_project_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.can_manage_project(target_project_id, target_user_id)
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = target_user_id
        and pm.role = 'Менеджер проекта'
    );
$$;

create or replace function private.can_manage_task(target_task_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.can_manage_tasks_in_project(private.task_project_id(target_task_id), target_user_id);
$$;

revoke all on function private.can_manage_tasks_in_project(uuid, uuid) from public;

drop policy if exists "Project managers can create tasks" on public.tasks;
create policy "Project managers can create tasks"
on public.tasks for insert
to authenticated
with check (private.can_manage_tasks_in_project(private.stage_project_id(stage_id), auth.uid()));

drop policy if exists "Project managers can update tasks" on public.tasks;
create policy "Project managers can update tasks"
on public.tasks for update
to authenticated
using (private.can_manage_task(id, auth.uid()))
with check (private.can_manage_tasks_in_project(private.stage_project_id(stage_id), auth.uid()));

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

create or replace function private.project_organization_id(target_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.projects p
  where p.id = target_project_id
  limit 1;
$$;

create or replace function private.task_project_id(target_task_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.project_id
  from public.tasks t
  join public.stages s on s.id = t.stage_id
  where t.id = target_task_id
  limit 1;
$$;

create or replace function private.stage_project_id(target_stage_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.project_id
  from public.stages s
  where s.id = target_stage_id
  limit 1;
$$;

create or replace function private.can_read_project(target_project_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_global_admin(target_user_id)
    or private.organization_role(private.project_organization_id(target_project_id), target_user_id) is not null
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = target_user_id
    );
$$;

create or replace function private.can_manage_project(target_project_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_global_admin(target_user_id)
    or private.organization_role(private.project_organization_id(target_project_id), target_user_id) in ('owner', 'admin', 'project_manager')
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = target_user_id
        and pm.role = 'Руководитель проекта'
    );
$$;

create or replace function private.can_read_task(target_task_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.can_read_project(private.task_project_id(target_task_id), target_user_id);
$$;

create or replace function private.can_manage_task(target_task_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.can_manage_project(private.task_project_id(target_task_id), target_user_id);
$$;

revoke all on function private.is_global_admin(uuid) from public;
revoke all on function private.organization_role(uuid, uuid) from public;
revoke all on function private.project_organization_id(uuid) from public;
revoke all on function private.task_project_id(uuid) from public;
revoke all on function private.stage_project_id(uuid) from public;
revoke all on function private.can_read_project(uuid, uuid) from public;
revoke all on function private.can_manage_project(uuid, uuid) from public;
revoke all on function private.can_read_task(uuid, uuid) from public;
revoke all on function private.can_manage_task(uuid, uuid) from public;

grant execute on function private.is_global_admin(uuid) to authenticated;
grant execute on function private.organization_role(uuid, uuid) to authenticated;
grant execute on function private.project_organization_id(uuid) to authenticated;
grant execute on function private.task_project_id(uuid) to authenticated;
grant execute on function private.stage_project_id(uuid) to authenticated;
grant execute on function private.can_read_project(uuid, uuid) to authenticated;
grant execute on function private.can_manage_project(uuid, uuid) to authenticated;
grant execute on function private.can_read_task(uuid, uuid) to authenticated;
grant execute on function private.can_manage_task(uuid, uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.stages enable row level security;
alter table public.tasks enable row level security;
alter table public.project_members enable row level security;
alter table public.project_logs enable row level security;
alter table public.site_messages enable row level security;
alter table public.subtasks enable row level security;
alter table public.comments enable row level security;
alter table public.task_files enable row level security;

alter table public.site_messages
add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.site_messages sm
set organization_id = p.organization_id
from public.projects p
where sm.project_id = p.id
  and sm.organization_id is null;

update public.site_messages
set organization_id = (select id from public.organizations order by created_at limit 1)
where organization_id is null;

alter table public.site_messages
alter column organization_id set not null;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.stages to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert on public.project_logs to authenticated;
grant select, insert on public.site_messages to authenticated;
grant select, insert, update, delete on public.subtasks to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, delete on public.task_files to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'projects',
        'stages',
        'tasks',
        'project_members',
        'project_logs',
        'site_messages',
        'subtasks',
        'comments',
        'task_files'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

create policy "Organization members can read projects"
on public.projects for select
to authenticated
using (private.can_read_project(id, auth.uid()));

create policy "Organization managers can create projects"
on public.projects for insert
to authenticated
with check (
  private.is_global_admin(auth.uid())
  or private.organization_role(organization_id, auth.uid()) in ('owner', 'admin', 'project_manager')
);

create policy "Organization managers and project leads can update projects"
on public.projects for update
to authenticated
using (private.can_manage_project(id, auth.uid()))
with check (
  private.is_global_admin(auth.uid())
  or private.organization_role(organization_id, auth.uid()) in ('owner', 'admin', 'project_manager')
);

create policy "Organization managers can delete projects"
on public.projects for delete
to authenticated
using (
  private.is_global_admin(auth.uid())
  or private.organization_role(organization_id, auth.uid()) in ('owner', 'admin')
);

create policy "Project readers can read stages"
on public.stages for select
to authenticated
using (private.can_read_project(project_id, auth.uid()));

create policy "Project managers can create stages"
on public.stages for insert
to authenticated
with check (private.can_manage_project(project_id, auth.uid()));

create policy "Project managers can update stages"
on public.stages for update
to authenticated
using (private.can_manage_project(project_id, auth.uid()))
with check (private.can_manage_project(project_id, auth.uid()));

create policy "Project managers can delete stages"
on public.stages for delete
to authenticated
using (private.can_manage_project(project_id, auth.uid()));

create policy "Project readers can read tasks"
on public.tasks for select
to authenticated
using (private.can_read_task(id, auth.uid()));

create policy "Project managers can create tasks"
on public.tasks for insert
to authenticated
with check (private.can_manage_project(private.stage_project_id(stage_id), auth.uid()));

create policy "Project managers can update tasks"
on public.tasks for update
to authenticated
using (private.can_manage_task(id, auth.uid()))
with check (private.can_manage_project(private.stage_project_id(stage_id), auth.uid()));

create policy "Project managers can delete tasks"
on public.tasks for delete
to authenticated
using (private.can_manage_task(id, auth.uid()));

create policy "Project readers can read project members"
on public.project_members for select
to authenticated
using (private.can_read_project(project_id, auth.uid()));

create policy "Project managers can create project members"
on public.project_members for insert
to authenticated
with check (
  private.can_manage_project(project_id, auth.uid())
  and (
    private.is_global_admin(user_id)
    or private.organization_role(private.project_organization_id(project_id), user_id) is not null
  )
);

create policy "Project managers can update project members"
on public.project_members for update
to authenticated
using (private.can_manage_project(project_id, auth.uid()))
with check (
  private.can_manage_project(project_id, auth.uid())
  and (
    private.is_global_admin(user_id)
    or private.organization_role(private.project_organization_id(project_id), user_id) is not null
  )
);

create policy "Project managers can delete project members"
on public.project_members for delete
to authenticated
using (private.can_manage_project(project_id, auth.uid()));

create policy "Project readers can read project logs"
on public.project_logs for select
to authenticated
using (private.can_read_project(project_id, auth.uid()));

create policy "Project readers can create project logs"
on public.project_logs for insert
to authenticated
with check (
  actor_id = auth.uid()
  and private.can_read_project(project_id, auth.uid())
);

create policy "Organization members can read site messages"
on public.site_messages for select
to authenticated
using (
  (
    cardinality(recipient_ids) > 0
    and organization_id is not null
    and private.organization_role(organization_id, auth.uid()) is not null
    and (
      author_id = auth.uid()
      or auth.uid() = any(recipient_ids)
    )
  )
  or (
    cardinality(recipient_ids) = 0
    and project_id is not null
    and private.can_read_project(project_id, auth.uid())
  )
);

create policy "Organization members can create site messages"
on public.site_messages for insert
to authenticated
with check (
  author_id = auth.uid()
  and not (auth.uid() = any(recipient_ids))
  and private.organization_role(organization_id, auth.uid()) is not null
  and not exists (
    select 1
    from unnest(recipient_ids) recipient_id
    where private.organization_role(organization_id, recipient_id) is null
      and not private.is_global_admin(recipient_id)
  )
  and (
    (
      cardinality(recipient_ids) > 0
      and project_id is null
    )
    or (
      cardinality(recipient_ids) = 0
      and project_id is not null
      and private.project_organization_id(project_id) = organization_id
      and private.can_read_project(project_id, auth.uid())
    )
  )
);

create policy "Project readers can read subtasks"
on public.subtasks for select
to authenticated
using (private.can_read_task(task_id, auth.uid()));

create policy "Project managers can create subtasks"
on public.subtasks for insert
to authenticated
with check (private.can_manage_task(task_id, auth.uid()));

create policy "Project managers can update subtasks"
on public.subtasks for update
to authenticated
using (private.can_manage_task(task_id, auth.uid()))
with check (private.can_manage_task(task_id, auth.uid()));

create policy "Project managers can delete subtasks"
on public.subtasks for delete
to authenticated
using (private.can_manage_task(task_id, auth.uid()));

create policy "Project readers can read comments"
on public.comments for select
to authenticated
using (private.can_read_task(task_id, auth.uid()));

create policy "Project readers can create comments"
on public.comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.can_read_task(task_id, auth.uid())
);

create policy "Comment authors can update own comments"
on public.comments for update
to authenticated
using (
  author_id = auth.uid()
  and private.can_read_task(task_id, auth.uid())
)
with check (
  author_id = auth.uid()
  and private.can_read_task(task_id, auth.uid())
);

create policy "Comment authors can delete own comments"
on public.comments for delete
to authenticated
using (
  author_id = auth.uid()
  and private.can_read_task(task_id, auth.uid())
);

create policy "Project readers can read task files"
on public.task_files for select
to authenticated
using (private.can_read_task(task_id, auth.uid()));

create policy "Project readers can create task files"
on public.task_files for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and private.can_read_task(task_id, auth.uid())
);

create policy "Task file uploaders can delete own task files"
on public.task_files for delete
to authenticated
using (
  uploader_id = auth.uid()
  and private.can_read_task(task_id, auth.uid())
);

create index if not exists site_messages_organization_created_idx
on public.site_messages (organization_id, created_at desc);

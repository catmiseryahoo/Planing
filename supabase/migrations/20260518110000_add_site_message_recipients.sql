alter table public.site_messages
add column if not exists recipient_ids uuid[] not null default '{}';

alter table public.site_messages
add column if not exists project_id uuid references public.projects(id) on delete cascade;

drop policy if exists "Authenticated users can read site messages" on public.site_messages;
drop policy if exists "Authenticated users can create own site messages" on public.site_messages;

create policy "Authenticated users can read site messages"
on public.site_messages for select
to authenticated
using (
  author_id = auth.uid()
  or auth.uid() = any(recipient_ids)
  or (
    cardinality(recipient_ids) = 0
    and project_id is not null
    and (
      exists (
        select 1 from public.project_members pm
        where pm.project_id = site_messages.project_id
          and pm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('Администратор', 'Менеджер проектов')
      )
    )
  )
);

create policy "Authenticated users can create own site messages"
on public.site_messages for insert
to authenticated
with check (
  author_id = auth.uid()
  and not (auth.uid() = any(recipient_ids))
  and (
    cardinality(recipient_ids) > 0
    or (
      project_id is not null
      and (
        exists (
          select 1 from public.project_members pm
          where pm.project_id = site_messages.project_id
            and pm.user_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('Администратор', 'Менеджер проектов')
        )
      )
    )
  )
);

create index if not exists site_messages_recipients_idx
on public.site_messages using gin (recipient_ids);

create index if not exists site_messages_project_created_idx
on public.site_messages (project_id, created_at desc);

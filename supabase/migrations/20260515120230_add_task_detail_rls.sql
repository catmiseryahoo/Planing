insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', true)
on conflict (id) do update set public = excluded.public;

alter table public.subtasks enable row level security;
alter table public.comments enable row level security;
alter table public.task_files enable row level security;

drop policy if exists "Authenticated users can read subtasks" on public.subtasks;
drop policy if exists "Authenticated users can create subtasks" on public.subtasks;
drop policy if exists "Authenticated users can update subtasks" on public.subtasks;
drop policy if exists "Authenticated users can delete subtasks" on public.subtasks;

create policy "Authenticated users can read subtasks"
on public.subtasks for select
to authenticated
using (true);

create policy "Authenticated users can create subtasks"
on public.subtasks for insert
to authenticated
with check (true);

create policy "Authenticated users can update subtasks"
on public.subtasks for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete subtasks"
on public.subtasks for delete
to authenticated
using (true);

drop policy if exists "Authenticated users can read comments" on public.comments;
drop policy if exists "Authenticated users can create comments" on public.comments;
drop policy if exists "Authenticated users can update own comments" on public.comments;
drop policy if exists "Authenticated users can delete own comments" on public.comments;

create policy "Authenticated users can read comments"
on public.comments for select
to authenticated
using (true);

create policy "Authenticated users can create comments"
on public.comments for insert
to authenticated
with check (author_id = auth.uid());

create policy "Authenticated users can update own comments"
on public.comments for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Authenticated users can delete own comments"
on public.comments for delete
to authenticated
using (author_id = auth.uid());

drop policy if exists "Authenticated users can read task files" on public.task_files;
drop policy if exists "Authenticated users can create task files" on public.task_files;
drop policy if exists "Authenticated users can delete own task files" on public.task_files;

create policy "Authenticated users can read task files"
on public.task_files for select
to authenticated
using (true);

create policy "Authenticated users can create task files"
on public.task_files for insert
to authenticated
with check (uploader_id = auth.uid());

create policy "Authenticated users can delete own task files"
on public.task_files for delete
to authenticated
using (uploader_id = auth.uid());

drop policy if exists "Authenticated users can upload task files" on storage.objects;
drop policy if exists "Authenticated users can read task files bucket" on storage.objects;
drop policy if exists "Authenticated users can update task files" on storage.objects;
drop policy if exists "Authenticated users can delete task files" on storage.objects;

create policy "Authenticated users can upload task files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'task-files');

create policy "Authenticated users can read task files bucket"
on storage.objects for select
to authenticated
using (bucket_id = 'task-files');

create policy "Authenticated users can update task files"
on storage.objects for update
to authenticated
using (bucket_id = 'task-files')
with check (bucket_id = 'task-files');

create policy "Authenticated users can delete task files"
on storage.objects for delete
to authenticated
using (bucket_id = 'task-files');

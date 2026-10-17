create table if not exists public.site_messages (
  id uuid default gen_random_uuid() primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.site_messages enable row level security;

drop policy if exists "Authenticated users can read site messages" on public.site_messages;
drop policy if exists "Authenticated users can create own site messages" on public.site_messages;

create policy "Authenticated users can read site messages"
on public.site_messages for select
to authenticated
using (true);

create policy "Authenticated users can create own site messages"
on public.site_messages for insert
to authenticated
with check (author_id = auth.uid());

create index if not exists site_messages_created_idx
on public.site_messages (created_at desc);

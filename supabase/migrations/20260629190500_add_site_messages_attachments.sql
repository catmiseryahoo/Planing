-- Alter table site_messages to add attachment columns
alter table public.site_messages
add column if not exists file_url text,
add column if not exists file_name text,
add column if not exists file_size bigint;

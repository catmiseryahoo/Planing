alter table public.projects
add column if not exists color text not null default '#3b82f6';

update public.projects
set color = '#3b82f6'
where color is null;

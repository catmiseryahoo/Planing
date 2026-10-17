alter table public.profiles
add column if not exists notification_channels jsonb not null default '{"telegram": false, "whatsapp": false, "email": false}'::jsonb;

update public.profiles
set notification_channels = '{"telegram": false, "whatsapp": false, "email": false}'::jsonb
where notification_channels is null;

comment on column public.profiles.notification_channels is
'Corporate messenger external notification channel flags managed by project/organization managers.';

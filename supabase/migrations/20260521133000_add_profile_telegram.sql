alter table public.profiles
add column if not exists telegram text;

comment on column public.profiles.telegram is
  'Telegram username for employee profile display and notification routing.';

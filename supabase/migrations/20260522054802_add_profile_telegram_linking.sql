alter table public.profiles
add column if not exists telegram_chat_id text,
add column if not exists telegram_link_code text,
add column if not exists telegram_link_code_expires_at timestamptz,
add column if not exists telegram_linked_at timestamptz;

create unique index if not exists profiles_telegram_chat_id_idx
on public.profiles (telegram_chat_id)
where telegram_chat_id is not null;

create unique index if not exists profiles_telegram_link_code_idx
on public.profiles (telegram_link_code)
where telegram_link_code is not null;

comment on column public.profiles.telegram_chat_id is
  'Telegram chat id confirmed by the user through the bot linking flow.';

comment on column public.profiles.telegram_link_code is
  'Temporary one-time code used to link a Telegram account.';

comment on column public.profiles.telegram_link_code_expires_at is
  'Expiration timestamp for the temporary Telegram linking code.';

comment on column public.profiles.telegram_linked_at is
  'Timestamp when the Telegram chat id was linked to the profile.';

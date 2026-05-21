alter table public.organizations
add column if not exists notification_channels jsonb not null default
'{
  "telegram": {"enabled": false, "sender": "", "destination": ""},
  "whatsapp": {"enabled": false, "sender": "", "phone": ""},
  "email": {"enabled": false, "fromName": "", "fromEmail": "", "replyTo": ""}
}'::jsonb;

update public.organizations
set notification_channels =
'{
  "telegram": {"enabled": false, "sender": "", "destination": ""},
  "whatsapp": {"enabled": false, "sender": "", "phone": ""},
  "email": {"enabled": false, "fromName": "", "fromEmail": "", "replyTo": ""}
}'::jsonb
where notification_channels is null;

drop policy if exists "Organization admins can update organizations" on public.organizations;

create policy "Organization managers can update organizations"
on public.organizations for update
to authenticated
using (
  private.organization_role(organizations.id, auth.uid()) in ('owner', 'admin', 'project_manager')
  or private.is_global_admin(auth.uid())
)
with check (
  private.organization_role(organizations.id, auth.uid()) in ('owner', 'admin', 'project_manager')
  or private.is_global_admin(auth.uid())
);

comment on column public.organizations.notification_channels is
'Organization-level sender settings for external corporate messenger notifications. Secrets must live in Edge Function environment variables, not here.';

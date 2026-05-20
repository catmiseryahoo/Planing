drop policy if exists "Admins can manage organization members" on public.organization_members;
drop policy if exists "Organization admins can create organization members" on public.organization_members;
drop policy if exists "Organization admins can update organization members" on public.organization_members;
drop policy if exists "Organization managers can dismiss organization members" on public.organization_members;

create policy "Organization admins can create organization members"
on public.organization_members for insert
to authenticated
with check (
  private.is_global_admin(auth.uid())
  or private.organization_role(organization_id, auth.uid()) in ('owner', 'admin')
);

create policy "Organization admins can update organization members"
on public.organization_members for update
to authenticated
using (
  private.is_global_admin(auth.uid())
  or private.organization_role(organization_members.organization_id, auth.uid()) in ('owner', 'admin')
)
with check (
  private.is_global_admin(auth.uid())
  or private.organization_role(organization_members.organization_id, auth.uid()) in ('owner', 'admin')
);

create policy "Organization managers can dismiss organization members"
on public.organization_members for delete
to authenticated
using (
  (
    private.is_global_admin(auth.uid())
    or private.organization_role(organization_members.organization_id, auth.uid()) in ('owner', 'admin', 'project_manager')
  )
  and user_id <> auth.uid()
  and role not in ('owner', 'admin')
  and not private.is_global_admin(user_id)
);

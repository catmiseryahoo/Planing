-- Create role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    role text NOT NULL,
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id, role)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "Members can view role permissions" ON public.role_permissions;
CREATE POLICY "Members can view role permissions" ON public.role_permissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = role_permissions.organization_id
              AND om.user_id = auth.uid()
        )
    );

-- Manage policy
DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage role permissions" ON public.role_permissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = role_permissions.organization_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner', 'admin', 'project_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = role_permissions.organization_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner', 'admin', 'project_manager')
        )
    );

-- Insert default permissions for all existing organizations
INSERT INTO public.role_permissions (organization_id, role, permissions)
SELECT o.id, r.role, r.perms::jsonb
FROM public.organizations o
CROSS JOIN (
  VALUES 
    ('Администратор', '{"create_projects": true, "manage_projects": true, "manage_staff": true, "manage_stages": true, "manage_tasks": true, "manage_visualizations": true}'),
    ('Менеджер проектов', '{"create_projects": true, "manage_projects": true, "manage_staff": true, "manage_stages": true, "manage_tasks": true, "manage_visualizations": true}'),
    ('Дизайнер', '{"create_projects": false, "manage_projects": false, "manage_staff": false, "manage_stages": false, "manage_tasks": true, "manage_visualizations": false}'),
    ('Разработчик', '{"create_projects": false, "manage_projects": false, "manage_staff": false, "manage_stages": false, "manage_tasks": true, "manage_visualizations": false}'),
    ('Сотрудник', '{"create_projects": false, "manage_projects": false, "manage_staff": false, "manage_stages": false, "manage_tasks": true, "manage_visualizations": false}')
) AS r(role, perms)
ON CONFLICT (organization_id, role) DO NOTHING;

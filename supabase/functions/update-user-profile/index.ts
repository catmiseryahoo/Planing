import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type UpdateUserProfilePayload = {
  userId?: string;
  name?: string;
  phone?: string;
  role?: string;
  avatar_color?: string;
  avatar_url?: string;
  notification_channels?: Record<string, boolean>;
};

const allowedRoles = new Set([
  'Администратор',
  'Менеджер проектов',
  'Дизайнер',
  'Разработчик',
  'Сотрудник',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const canManageTargetUser = async (
  adminClient: ReturnType<typeof createClient>,
  actorUserId: string,
  targetUserId: string,
) => {
  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', targetUserId)
    .single();

  if (targetProfileError || targetProfile?.is_super_admin) return false;

  const { data, error } = await adminClient
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', actorUserId)
    .in('role', ['owner', 'admin', 'project_manager']);

  if (error || !data?.length) return false;

  const organizationIds = data.map((member) => member.organization_id);
  const { data: targetMembership, error: targetMembershipError } = await adminClient
    .from('organization_members')
    .select('id')
    .eq('user_id', targetUserId)
    .in('organization_id', organizationIds)
    .limit(1);

  return !targetMembershipError && Boolean(targetMembership?.length);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json({ error: 'Supabase environment variables are not configured' }, 500);
  }

  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const payload = (await req.json()) as UpdateUserProfilePayload;
  const targetUserId = payload.userId || user.id;

  if (!targetUserId || !payload.role || !allowedRoles.has(payload.role)) {
    return json({ error: 'Invalid profile data' }, 400);
  }

  const { data: currentProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  const isSuperAdmin = Boolean(currentProfile?.is_super_admin);
  const isSelf = targetUserId === user.id;
  const canManageTarget = !isSelf && await canManageTargetUser(adminClient, user.id, targetUserId);

  if (!isSuperAdmin && !isSelf && !canManageTarget) {
    return json({ error: 'Forbidden' }, 403);
  }

  const updates: Record<string, unknown> = {
    name: payload.name?.trim() || null,
    phone: payload.phone?.trim() || null,
    role: payload.role,
    avatar_color: payload.avatar_color || null,
    avatar_url: payload.avatar_url || null,
  };

  if (payload.notification_channels) {
    updates.notification_channels = payload.notification_channels;
  }

  const { data, error } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', targetUserId)
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ profile: data });
});

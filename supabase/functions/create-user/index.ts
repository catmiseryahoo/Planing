import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CreateUserPayload = {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
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

  const { data: currentProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  if (!currentProfile?.is_super_admin) {
    return json({ error: 'Forbidden' }, 403);
  }

  const payload = (await req.json()) as CreateUserPayload;
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password;
  const name = payload.name?.trim();
  const role = payload.role || 'Сотрудник';

  if (!email || !password || password.length < 6 || !name || !allowedRoles.has(role)) {
    return json({ error: 'Invalid user data' }, 400);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ name, role })
    .eq('id', data.user.id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({ user: data.user }, 201);
});

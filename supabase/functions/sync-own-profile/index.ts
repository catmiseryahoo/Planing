import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  const email = user.email?.trim().toLowerCase() || '';
  const fallbackName = user.user_metadata?.name || user.user_metadata?.full_name || email || 'Пользователь';

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfileError) {
    return json({ error: existingProfileError.message }, 500);
  }

  if (existingProfile) {
    return json({ profile: existingProfile, created: false });
  }

  const { data: createdProfile, error: createProfileError } = await adminClient
    .from('profiles')
    .insert({
      id: user.id,
      email,
      name: fallbackName,
      role: 'Сотрудник',
    })
    .select()
    .single();

  if (createProfileError) {
    return json({ error: createProfileError.message }, 500);
  }

  return json({ profile: createdProfile, created: true });
});

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

const createLinkCode = () => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes).reduce((acc, byte) => (acc << 8) + byte, 0);
  return String(value % 1000000).padStart(6, '0');
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

  let code = createLinkCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data } = await adminClient
      .from('profiles')
      .select('id')
      .eq('telegram_link_code', code)
      .maybeSingle();

    if (!data) break;
    code = createLinkCode();
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await adminClient
    .from('profiles')
    .update({
      telegram_link_code: code,
      telegram_link_code_expires_at: expiresAt,
    })
    .eq('id', user.id)
    .select('telegram, telegram_chat_id, telegram_link_code, telegram_link_code_expires_at, telegram_linked_at')
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({
    code,
    expiresAt,
    profile: data,
  });
});

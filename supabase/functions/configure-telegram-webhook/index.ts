const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const setupSecret = req.headers.get('x-setup-secret') || '';

  if (!token || !webhookSecret || !supabaseUrl) {
    return json({ error: 'Telegram webhook environment variables are not configured' }, 500);
  }

  if (setupSecret !== webhookSecret) {
    return json({ error: 'Forbidden' }, 403);
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${supabaseUrl}/functions/v1/telegram-webhook`,
      secret_token: webhookSecret,
      allowed_updates: ['message'],
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.ok === false) {
    return json({ error: 'Telegram webhook setup failed', result }, 500);
  }

  return json({ ok: true, result });
});

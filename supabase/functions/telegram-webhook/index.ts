import { createClient } from 'npm:@supabase/supabase-js@2';

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number | string;
      type?: string;
      username?: string;
    };
    from?: {
      username?: string;
    };
    text?: string;
  };
};

const sendTelegramMessage = async (token: string, chatId: string, text: string) => {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
};

const extractCode = (text = '') => {
  const trimmed = text.trim();
  const startMatch = trimmed.match(/^\/start(?:@\w+)?\s+([0-9]{6})$/i);
  if (startMatch) return startMatch[1];
  const plainMatch = trimmed.match(/^[0-9]{6}$/);
  return plainMatch ? plainMatch[0] : '';
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('ok');
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (webhookSecret && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
    return new Response('forbidden', { status: 403 });
  }

  if (!token || !supabaseUrl || !supabaseServiceRoleKey) {
    return new Response('not configured', { status: 500 });
  }

  const update = await req.json().catch(() => ({})) as TelegramUpdate;
  const chatId = update.message?.chat?.id ? String(update.message.chat.id) : '';
  const code = extractCode(update.message?.text);

  if (!chatId) {
    return new Response('ok');
  }

  if (!code) {
    await sendTelegramMessage(
      token,
      chatId,
      'Чтобы привязать Telegram к Orbita, откройте личный кабинет, получите код и отправьте сюда команду /start КОД.',
    );
    return new Response('ok');
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, telegram_link_code_expires_at')
    .eq('telegram_link_code', code)
    .maybeSingle();

  if (profileError || !profile) {
    await sendTelegramMessage(token, chatId, 'Код не найден. Получите новый код в личном кабинете Orbita.');
    return new Response('ok');
  }

  if (new Date(profile.telegram_link_code_expires_at).getTime() < Date.now()) {
    await sendTelegramMessage(token, chatId, 'Срок действия кода истёк. Получите новый код в личном кабинете Orbita.');
    return new Response('ok');
  }

  const username = update.message?.from?.username || update.message?.chat?.username || '';
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({
      telegram: username || null,
      telegram_chat_id: chatId,
      telegram_link_code: null,
      telegram_link_code_expires_at: null,
      telegram_linked_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (updateError) {
    await sendTelegramMessage(token, chatId, 'Не удалось привязать Telegram. Попробуйте получить новый код.');
    return new Response('ok');
  }

  await sendTelegramMessage(token, chatId, 'Telegram привязан к Orbita. Теперь сюда могут приходить уведомления.');
  return new Response('ok');
});

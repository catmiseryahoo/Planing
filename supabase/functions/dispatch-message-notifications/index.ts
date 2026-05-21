import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SiteMessage = {
  id: string;
  author_id: string;
  recipient_ids: string[] | null;
  project_id: string | null;
  organization_id: string;
  body: string;
  created_at: string;
};

type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  telegram: string | null;
  notification_channels: Record<string, boolean> | null;
};

type Organization = {
  id: string;
  name: string | null;
  notification_channels: {
    telegram?: {
      enabled?: boolean;
      sender?: string;
      destination?: string;
    };
    email?: {
      enabled?: boolean;
      fromName?: string;
      fromEmail?: string;
      replyTo?: string;
    };
  } | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const truncate = (value: string, limit = 900) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

const normalizeRecipientIds = async (
  adminClient: ReturnType<typeof createClient>,
  message: SiteMessage,
) => {
  const explicitRecipients = message.recipient_ids?.filter(Boolean) || [];
  if (explicitRecipients.length > 0) {
    return Array.from(new Set(explicitRecipients.filter((id) => id !== message.author_id)));
  }

  if (message.project_id) {
    const { data, error } = await adminClient
      .from('project_members')
      .select('user_id')
      .eq('project_id', message.project_id);

    if (error) throw error;
    return Array.from(new Set((data || []).map((item) => item.user_id).filter((id) => id !== message.author_id)));
  }

  const { data, error } = await adminClient
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', message.organization_id);

  if (error) throw error;
  return Array.from(new Set((data || []).map((item) => item.user_id).filter((id) => id !== message.author_id)));
};

const sendTelegramNotification = async ({
  token,
  chatId,
  text,
}: {
  token: string;
  chatId: string;
  text: string;
}) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram error ${response.status}: ${errorText}`);
  }

  return response.json();
};

const sendEmailNotification = async ({
  apiKey,
  from,
  replyTo,
  to,
  subject,
  text,
  html,
  idempotencyKey,
}: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email error ${response.status}: ${errorText}`);
  }

  return response.json();
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
  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const fallbackEmailFrom = Deno.env.get('EMAIL_FROM') || 'Orbita <onboarding@resend.dev>';
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

  const payload = await req.json().catch(() => ({}));
  const messageId = String(payload.messageId || '');
  if (!messageId) {
    return json({ error: 'messageId is required' }, 400);
  }

  const { data: message, error: messageError } = await adminClient
    .from('site_messages')
    .select('*')
    .eq('id', messageId)
    .single<SiteMessage>();

  if (messageError || !message) {
    return json({ error: messageError?.message || 'Message not found' }, 404);
  }

  if (message.author_id !== user.id) {
    return json({ error: 'Forbidden' }, 403);
  }

  const [{ data: organization, error: organizationError }, { data: author, error: authorError }] = await Promise.all([
    adminClient
      .from('organizations')
      .select('id, name, notification_channels')
      .eq('id', message.organization_id)
      .single<Organization>(),
    adminClient
      .from('profiles')
      .select('id, email, name, telegram, notification_channels')
      .eq('id', message.author_id)
      .single<Profile>(),
  ]);

  if (organizationError || !organization) {
    return json({ error: organizationError?.message || 'Organization not found' }, 404);
  }

  if (authorError || !author) {
    return json({ error: authorError?.message || 'Author not found' }, 404);
  }

  const recipientIds = await normalizeRecipientIds(adminClient, message);
  const { data: recipients, error: recipientsError } = recipientIds.length
    ? await adminClient
      .from('profiles')
      .select('id, email, name, telegram, notification_channels')
      .in('id', recipientIds)
      .returns<Profile[]>()
    : { data: [], error: null };

  if (recipientsError) {
    return json({ error: recipientsError.message }, 500);
  }

  const channels = organization.notification_channels || {};
  const authorName = author.name || author.email || 'Сотрудник';
  const organizationName = organization.name || 'Организация';
  const recipientNames = (recipients || []).map((recipient) => recipient.name || recipient.email).filter(Boolean);
  const messageText = truncate(message.body);
  const text = [
    `Новое сообщение в ${organizationName}`,
    `От: ${authorName}`,
    recipientNames.length ? `Кому: ${recipientNames.join(', ')}` : '',
    '',
    messageText,
  ].filter(Boolean).join('\n');
  const subject = `Новое сообщение: ${organizationName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">Новое сообщение в ${escapeHtml(organizationName)}</h2>
      <p style="margin: 0 0 8px;"><strong>От:</strong> ${escapeHtml(authorName)}</p>
      ${recipientNames.length ? `<p style="margin: 0 0 16px;"><strong>Кому:</strong> ${escapeHtml(recipientNames.join(', '))}</p>` : ''}
      <div style="padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
        ${escapeHtml(messageText).replaceAll('\n', '<br>')}
      </div>
    </div>
  `;

  const results: Record<string, unknown> = {};

  const telegramChannel = channels.telegram || {};
  const telegramDestination = String(telegramChannel.destination || '').trim();
  if (telegramChannel.enabled && telegramDestination) {
    if (!telegramBotToken) {
      results.telegram = { status: 'skipped', reason: 'TELEGRAM_BOT_TOKEN is not configured' };
    } else {
      try {
        await sendTelegramNotification({
          token: telegramBotToken,
          chatId: telegramDestination,
          text,
        });
        results.telegram = { status: 'sent', destination: telegramDestination };
      } catch (error) {
        results.telegram = { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
      }
    }
  } else {
    results.telegram = { status: 'skipped', reason: 'Telegram channel is disabled or destination is empty' };
  }

  const emailChannel = channels.email || {};
  const emailRecipients = (recipients || [])
    .filter((recipient) => Boolean(recipient.notification_channels?.email))
    .map((recipient) => recipient.email)
    .filter((email): email is string => Boolean(email));

  if (emailChannel.enabled && emailRecipients.length > 0) {
    if (!resendApiKey) {
      results.email = { status: 'skipped', reason: 'RESEND_API_KEY is not configured' };
    } else {
      const fromEmail = String(emailChannel.fromEmail || '').trim();
      const fromName = String(emailChannel.fromName || '').trim();
      const from = fromEmail
        ? `${fromName || organizationName} <${fromEmail}>`
        : fallbackEmailFrom;
      const replyTo = String(emailChannel.replyTo || '').trim();

      try {
        await sendEmailNotification({
          apiKey: resendApiKey,
          from,
          replyTo: replyTo || undefined,
          to: emailRecipients.slice(0, 50),
          subject,
          text,
          html,
          idempotencyKey: `site-message-${message.id}`,
        });
        results.email = { status: 'sent', count: Math.min(emailRecipients.length, 50) };
      } catch (error) {
        results.email = { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
      }
    }
  } else {
    results.email = { status: 'skipped', reason: 'Email channel is disabled or recipients are empty' };
  }

  return json({ ok: true, results });
});

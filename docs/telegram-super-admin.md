# Супер-администратор: Telegram-интеграция

Эта инструкция для супер-администратора или технического администратора, у которого есть доступ к Supabase и деплою Edge Functions.

Администратор организации эту инструкцию не выполняет.

## Что настраивает супер-администратор

- Telegram-бота через `@BotFather`.
- Secret с токеном бота в Supabase.
- Secret для Telegram webhook.
- Supabase Edge Functions.
- Webhook, через который Telegram отправляет `/start код` в Orbita.

## Первичная настройка бота

1. Откройте Telegram и найдите `@BotFather`.
2. Отправьте команду `/newbot`.
3. Задайте название бота, например `Orbita Planner`.
4. Задайте username бота. Он должен заканчиваться на `bot`, например `OrbitePlaner_bot`.
5. Сохраните токен, который выдаст `@BotFather`.
6. Добавьте secrets в Supabase:

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN="токен_бота"
npx supabase secrets set TELEGRAM_WEBHOOK_SECRET="случайная_длинная_строка"
```

## Деплой функций

```bash
npx supabase functions deploy create-telegram-link-code
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy configure-telegram-webhook --no-verify-jwt
npx supabase functions deploy dispatch-message-notifications
```

## Подключение webhook

Подключите webhook бота к Supabase Function, не раскрывая токен бота локально:

```bash
curl -X POST "https://wqfpksyemvaxncsqwuzm.supabase.co/functions/v1/configure-telegram-webhook" \
  -H "x-setup-secret: $TELEGRAM_WEBHOOK_SECRET"
```

Успешный ответ Telegram выглядит так:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "result": true,
    "description": "Webhook was set"
  }
}
```

## Что передать администратору организации

Передайте администратору организации:

- username бота, например `@OrbitePlaner_bot`;
- информацию, что Telegram-интеграция технически подключена;
- ссылку на инструкцию [Администратор организации: Telegram-бот и канал](telegram-organization-admin.md).

Если организация хочет использовать приватный Telegram-канал, помогите получить `chat_id` канала и передайте его администратору организации.

## Важное ограничение Telegram

Бот не может первым написать человеку. Пользователь должен сам открыть бота и отправить `/start код`.

Именно поэтому в Orbita есть процедура привязки личного Telegram через одноразовый код.

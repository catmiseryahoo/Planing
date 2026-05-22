# Привязка личного Telegram к Orbita

## Для пользователя

1. Откройте Orbita.
2. Перейдите в личный кабинет.
3. В блоке Telegram нажмите `Получить код`.
4. Откройте корпоративного Telegram-бота.
5. Отправьте боту команду из личного кабинета в формате `/start 123456`.
6. Дождитесь ответа бота: `Telegram привязан к Orbita`.
7. В личном кабинете включите канал `Telegram`, если руководитель разрешил отправку уведомлений.

Код действует 15 минут. Если срок истёк, получите новый код в личном кабинете.

## Для администратора

1. Создайте бота через `@BotFather`.
2. Добавьте secret в Supabase:

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN="токен_бота"
npx supabase secrets set TELEGRAM_WEBHOOK_SECRET="случайная_длинная_строка"
```

3. Разверните функции:

```bash
npx supabase functions deploy create-telegram-link-code
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy configure-telegram-webhook --no-verify-jwt
npx supabase functions deploy dispatch-message-notifications
```

4. Подключите webhook бота к Supabase Function, не раскрывая токен бота локально:

```bash
curl -X POST "https://wqfpksyemvaxncsqwuzm.supabase.co/functions/v1/configure-telegram-webhook" \
  -H "x-setup-secret: $TELEGRAM_WEBHOOK_SECRET"
```

5. В настройках организации включите Telegram-канал.
6. Для корпоративного канала укажите `@channel` или `chat_id`, если уведомления должны дополнительно уходить в общий канал.

Важно: бот не может первым написать человеку. Пользователь должен сам открыть бота и отправить `/start код`.

# Hostland deployment state

Дата фиксации: 2026-06-27
Домен: https://plan.goplaytennis.ru/

## Текущее состояние

- Проект `Planing` перенесён на Hostland как отдельное Node.js-приложение для субдомена `plan.goplaytennis.ru`.
- DNS `plan.goplaytennis.ru` указывает на Hostland IP `185.26.122.79`.
- Субдомен в Hostland должен существовать именно как отдельный сайт/Node.js-приложение. Одной A-записи недостаточно: Hostland должен знать virtual host и папку приложения.
- На момент фиксации URL `https://plan.goplaytennis.ru/` отвечает `200 OK`.
- Тестовый файл `https://plan.goplaytennis.ru/hostland-check.txt` отвечает `200 OK` и содержит marker `Build: landscape-header-fix`.
- Supabase для production теперь доступен через same-origin proxy `/supabase`, чтобы iPad/устройства без VPN не ходили напрямую на `*.supabase.co`.

## FTP / Hostland структура

FTP-пользователь, использованный при переносе: `host1846065_plan`.

Важное: пароль FTP был временно передан в чат во время настройки. После завершения работ его нужно сменить в панели Hostland.

Основные папки на FTP:

```text
/
├── goplaytennis.ru/
├── host1846065.hostland.pro/
├── public_html/
└── plan.goplaytennis.ru/
    ├── htdocs/
    ├── logs/
    ├── node/
    └── projects/
        └── Plan/
            ├── server.js
            ├── package.json
            ├── app.js
            ├── tmp/
            │   └── restart.txt
            └── dist/
                ├── index.html
                ├── assets/
                ├── favicon.svg
                ├── icons.svg
                └── hostland-check.txt
```

Реальный Node.js application root Hostland:

```text
/home/host1846065/plan.goplaytennis.ru/projects/Plan
```

Startup file Hostland ожидает как:

```text
server.js
```

Важно: после первичной настройки Node.js панель Hostland может перезаписать `projects/Plan/server.js` шаблоном:

```text
Поздравляем Вас! Nodejs настроен, отредактируйте файл server.js для запуска своего проекта
```

Если это произошло, нужно повторно залить наши `server.js`, `package.json` и `dist/`, затем сделать restart приложения.

## Что было сделано

### 1. Проверка и настройка Hostland

- Создан маленький тестовый файл `/tmp/hostland-check.txt`.
- Файл сначала был загружен в `/public_html/hostland-check.txt`, но `https://plan.goplaytennis.ru/hostland-check.txt` отдавал `404`.
- Затем проверена FTP-структура и обнаружено, что Hostland создал отдельный каталог:

```text
/plan.goplaytennis.ru
```

- Для Node.js приложения найдена папка:

```text
/plan.goplaytennis.ru/projects/Plan
```

### 2. Node.js wrapper

Для Hostland создан простой Node.js сервер без внешних зависимостей:

- раздаёт `dist/` как статические файлы;
- возвращает `dist/index.html` для внутренних SPA-маршрутов;
- проксирует Supabase через `/supabase/*` на `https://wqfpksyemvaxncsqwuzm.supabase.co/*`;
- слушает `process.env.PORT || 3000`, что совместимо с Passenger/Hostland.

Текущий серверный файл на Hostland:

```text
/plan.goplaytennis.ru/projects/Plan/server.js
```

Локальный источник последней версии сервера во время настройки был подготовлен как:

```text
/tmp/hostland-server.js
```

При следующем обновлении лучше перенести этот серверный файл в репозиторий, например в `hostland/server.js`, чтобы не зависеть от `/tmp`.

### 3. Supabase proxy

Раньше production frontend ходил напрямую на:

```text
https://wqfpksyemvaxncsqwuzm.supabase.co
```

На iPad без VPN это ломалось. Поэтому `frontend/src/supabaseClient.js` изменён так:

- если `VITE_SUPABASE_URL` задан — используется он;
- если production и `VITE_SUPABASE_URL` не задан — используется `${window.location.origin}/supabase`;
- в dev-режиме остаётся прямой Supabase URL.

Файл:

```text
frontend/src/supabaseClient.js
```

Сборка для Hostland выполнялась так, чтобы `VITE_SUPABASE_URL` был пустым:

```bash
cd frontend
VITE_SUPABASE_URL= npm run build
```

Проверка proxy:

```bash
ANON=$(awk -F= '/^VITE_SUPABASE_ANON_KEY=/{print $2}' frontend/.env)
curl -i \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  'https://plan.goplaytennis.ru/supabase/rest/v1/profiles?select=id&limit=1'
```

Ожидаемый результат: `200 OK`.

### 4. Кеширование

Изначально для проверки использовался URL:

```text
https://plan.goplaytennis.ru/?v=proxy1
```

Это был только cache-bust для Safari/iPad. После обновления `server.js` можно открывать обычный адрес:

```text
https://plan.goplaytennis.ru/
```

В `server.js` настроено:

- `.html`, `.js`, `.css` отдаются с `Cache-Control: no-cache, no-store, must-revalidate`;
- остальные файлы отдаются с `Cache-Control: public, max-age=3600`.

### 5. iPad landscape fix

На iPad в альбомной ориентации верхняя панель обрезалась сверху/не помещалась. В `frontend/src/index.css` добавлены точечные правки:

- `.topbar` и `.topbar-actions` получили `min-width: 0`, корректный flex и gap;
- имя/роль пользователя ограничены через ellipsis;
- добавлен media query:

```css
@media (orientation: landscape) and (max-height: 620px) { ... }
```

В этом режиме шапка становится компактнее и при переполнении прокручивается по горизонтали.

## Текущие локальные изменения

На момент фиксации есть незакоммиченные изменения:

```text
frontend/src/App.jsx
frontend/src/index.css
frontend/src/supabaseClient.js
```

`frontend/src/App.jsx` содержит ранее сделанные правки по устойчивости Supabase/Auth:

- `withTimeout` и `runSupabaseRequest`;
- загрузка workspace data с частичным fallback;
- `dataLoadError` banner;
- локальный logout даже если Supabase signOut зависает;
- кнопки `Повторить` и `Выйти` при частичной ошибке загрузки.

`frontend/src/index.css` содержит:

- стили `workspace-error-banner`;
- правки верхней панели;
- iPad landscape media query.

`frontend/src/supabaseClient.js` содержит production fallback на `/supabase`.

## Команда обновления Hostland

Ниже схема ручного обновления. Не хранить FTP-пароль в репозитории.

```bash
cd /Users/koshkin/SynologyDrive/Orbite/ProjectsWEB/Planing

# Production build через same-origin Supabase proxy
cd frontend
VITE_SUPABASE_URL= npm run build
cd ..

# Подготовить пакет
BUNDLE=/tmp/plan-hostland-node
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
cp -R frontend/dist "$BUNDLE/dist"
cp /path/to/hostland/server.js "$BUNDLE/server.js"
cp /path/to/hostland/server.js "$BUNDLE/app.js"
cat > "$BUNDLE/package.json" <<'JSON'
{
  "name": "planing-hostland",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  }
}
JSON
```

Загрузка по FTP выполнялась через `curl` в passive mode:

```bash
FTP_PASS='...'
BASE='ftp://plan.goplaytennis.ru/plan.goplaytennis.ru/projects/Plan'
LOCAL='/tmp/plan-hostland-node'

find "$LOCAL" -type d | while read -r dir; do
  rel="${dir#$LOCAL}"
  [ -z "$rel" ] && continue
  curl -sS --ftp-pasv --ftp-create-dirs \
    -u "host1846065_plan:${FTP_PASS}" \
    "$BASE$rel/" >/dev/null || true
done

find "$LOCAL" -type f | while read -r file; do
  rel="${file#$LOCAL/}"
  curl --fail --show-error --silent --ftp-pasv --ftp-create-dirs \
    --connect-timeout 20 --max-time 120 \
    -T "$file" \
    -u "host1846065_plan:${FTP_PASS}" \
    "$BASE/$rel"
done

printf 'restart %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /tmp/hostland-restart.txt
curl --fail --show-error --silent --ftp-pasv --ftp-create-dirs \
  --connect-timeout 20 --max-time 60 \
  -T /tmp/hostland-restart.txt \
  -u "host1846065_plan:${FTP_PASS}" \
  "$BASE/tmp/restart.txt"
```

После загрузки проверить:

```bash
curl -i https://plan.goplaytennis.ru/
curl -i https://plan.goplaytennis.ru/hostland-check.txt
ANON=$(awk -F= '/^VITE_SUPABASE_ANON_KEY=/{print $2}' frontend/.env)
curl -i \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  'https://plan.goplaytennis.ru/supabase/rest/v1/profiles?select=id&limit=1'
```

## Что важно помнить

- Не нажимать в Hostland действия, которые заново инициализируют Node.js проект, иначе `server.js` может снова стать шаблонным.
- Для применения новой версии обычно достаточно перезалить файлы и сделать restart приложения в панели Hostland.
- Если iPad снова показывает старую версию, закрыть вкладку Safari полностью или очистить данные сайта `plan.goplaytennis.ru`.
- Realtime/WebSocket Supabase отдельно не проксировался. В текущем коде активно используются REST/Auth/Functions/Storage, они идут через `/supabase`.

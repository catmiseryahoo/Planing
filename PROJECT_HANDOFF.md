# Orbite Planing - Handoff Notes

Этот файл нужен, чтобы другой LLM или разработчик мог быстро продолжить работу без восстановления контекста по переписке.

## Проект

- Рабочая папка: `/Users/koshkin/SynologyDrive/Orbite/ProjectsWEB/Planing`
- Frontend: Vite + React, папка `frontend`
- Основной файл приложения: `frontend/src/App.jsx`
- Основные стили: `frontend/src/index.css`
- Supabase client: `frontend/src/supabaseClient.js`
- Supabase project ref: `wqfpksyemvaxncsqwuzm`
- Git branch: `main`

## Важные правила работы

- Не трогать `.DS_Store`.
- Не учитывать соседние папки за пределами проекта.
- Перед пушем запускать:

```bash
cd frontend
npm run build
```

- Для ручных правок использовать `apply_patch`.
- Supabase DDL держать в `supabase/migrations`.

## Supabase MCP

Добавлен MCP-сервер:

```bash
codex mcp add supabase --url 'https://mcp.supabase.com/mcp?project_ref=wqfpksyemvaxncsqwuzm&features=account%2Cdatabase%2Cdebugging%2Cfunctions%2Cdevelopment%2Cdocs%2Cstorage%2Cbranching'
```

Авторизация выполнена через:

```bash
codex mcp login supabase
```

После tool discovery доступен namespace `mcp__supabase__` с `apply_migration` и `execute_sql`.

## Что уже реализовано

### Безопасное создание пользователей

- `service_role` убран из браузерного фронтенда.
- Создание пользователей вынесено в Supabase Edge Function:
  - `supabase/functions/create-user/index.ts`
- Админ-панель вызывает Edge Function через `supabase.functions.invoke('create-user', ...)`.

### Задачи и свойства задачи

- Исправлен date picker в панели свойств задачи.
- Панель свойств задачи можно перетаскивать.
- Цвет панели свойств задачи наследует цвет этапа.
- Администратор может удалять задачи и этапы.
- Перетаскивание этапов сохранено.
- В свойствах задачи работают:
  - подзадачи;
  - комментарии;
  - загрузка файлов и медиа;
  - удаление файлов.
- Увеличена кнопка закрытия панели.

Ключевой компонент:

- `frontend/src/components/Task/TaskSidebar.jsx`

### Диаграмма Ганта

- Добавлен горизонтальный zoom через `Option + scroll`.
- Исправлялось поведение, когда свойства задачи были закреплены, а этапы уезжали.

Ключевые файлы:

- `frontend/src/components/Map/GanttChart.jsx`
- `frontend/src/components/Map/GanttChart.css`

### Индикаторы на карточках задач

На карточках задач есть индикаторы:

- вложения;
- подзадачи;
- комментарии;
- измененность задачи.

### Project Overview

Добавлен блок состояния проекта:

- общий прогресс;
- плановый прогресс на сегодня;
- отставание;
- просроченные задачи;
- текущий этап;
- health badge.

Логика расчета:

- `getProjectMetrics(...)` в `frontend/src/App.jsx`

### Вкладки проекта

В проект добавлены вкладки:

- `Канбан (Карта)`
- `Диаграмма Ганта`
- `Файлы`
- `Сотрудники`
- `Logs`

### Файлы проекта

- Вкладка `Файлы` показывает все файлы задач проекта.
- Вид сделан карточками, не строками на всю ширину.
- Для изображений используется preview.

### Сотрудники проекта

- Вкладка `Сотрудники` показывает участников проекта карточками.
- Добавлять участников могут:
  - `Администратор`;
  - `Руководитель проекта`.
- В карточке сотрудника:
  - крупное фото/аватар;
  - имя;
  - роль в проекте;
  - email;
  - телефон;
  - Telegram;
  - системная роль;
  - ближайший срок;
  - статистика задач;
  - круговые проценты по статистике;
  - прогресс выполнения;
  - загрузка.
- Текстовые маркеры заменены на SVG-иконки.

Важно: Telegram уже сохраняется в профиле через `frontend/src/components/Profile/ProfilePanel.jsx` как поле `telegram`.

### Логи проекта

Вкладка `Logs` фиксирует изменения участников по проекту.

Сейчас логируются:

- создание/удаление/изменение этапов;
- создание/удаление/изменение задач;
- добавление/изменение/удаление подзадач;
- добавление комментариев;
- добавление/удаление файлов;
- добавление/изменение/удаление участников проекта;
- изменение цвета проекта.

Формат важных изменений:

```js
details: {
  changes: [
    { field: '...', label: '...', from: '...', to: '...' }
  ]
}
```

Не нужно писать `Не было` для добавлений. Для добавления/удаления лучше делать отдельный action и `entity_name`.

### Цвет проекта

- В `projects` добавлено поле `color`.
- В списке проектов оставлена только боковая цветовая полоса.
- Клик по боковой полосе открывает выбор цвета.
- Лишние цветные точки/круги были убраны.
- Новые проекты создаются с `color: '#3b82f6'`.

Миграция:

- `supabase/migrations/20260518100000_add_project_color.sql`

### Внутрисайтовый мессенджер

Мессенджер находится во всплывающем окне.

- Кнопка мессенджера рядом с личным кабинетом.
- Кнопка зеленая.
- При новом входящем сообщении, когда окно закрыто, кнопка медленно мигает.
- Отправка:
  - `Enter` отправляет;
  - `Shift + Enter` переносит строку.
- Сообщения автообновляются polling-ом каждые 5 секунд.

Диалоги:

- `Общий чат проекта`:
  - привязан к активному проекту через `site_messages.project_id`;
  - доступен только участникам активного проекта, `Администратору` и `Менеджеру проектов`;
  - при отправке общего сообщения `recipient_ids = '{}'`, `project_id = activeProjectId`.
- Личная/групповая переписка:
  - выбирается один или несколько сотрудников;
  - не зависит от проекта;
  - `project_id = null`;
  - `recipient_ids` содержит выбранных пользователей;
  - сообщение видит автор и выбранные получатели.

Ключевая логика:

- состояния `siteMessages`, `isMessengerOpen`, `messengerText`, `selectedMessengerUserIds`, `hasUnreadMessages`;
- `fetchSiteMessages`;
- `handleSendSiteMessage`;
- `conversationMessages`;
- UI `messenger-popover`.

Все находится в `frontend/src/App.jsx`, стили в `frontend/src/index.css`.

## Supabase migrations

Уже есть и применялись:

- `20260515120230_add_task_detail_rls.sql`
  - RLS для `subtasks`, `comments`, `task_files`;
  - Storage bucket/policies для `task-files`.
- `20260515124500_add_project_members.sql`
  - таблица `project_members`;
  - роли участников проекта;
  - RLS для участников проекта.
- `20260515130000_add_project_logs.sql`
  - таблица `project_logs`;
  - RLS для чтения/создания логов.
- `20260518100000_add_project_color.sql`
  - `projects.color`.
- `20260518103000_add_site_messages.sql`
  - базовая таблица `site_messages`;
  - общий чат для авторизованных.
- `20260518110000_add_site_message_recipients.sql`
  - `site_messages.recipient_ids`;
  - `site_messages.project_id`;
  - RLS для проектного общего чата и личных/групповых сообщений.

Последняя миграция `20260518110000_add_site_message_recipients.sql` применена через Supabase MCP, проверено:

- `recipient_ids` существует;
- `project_id` существует;
- политики `SELECT` и `INSERT` пересозданы.

## Важные SQL/RLS нюансы мессенджера

Таблица `site_messages`:

```sql
author_id uuid not null references public.profiles(id) on delete cascade
recipient_ids uuid[] not null default '{}'
project_id uuid references public.projects(id) on delete cascade
body text not null
created_at timestamptz
```

Чтение:

- автор всегда видит свое сообщение;
- выбранные получатели видят личные/групповые сообщения;
- проектный общий чат видят участники проекта, администраторы и менеджеры проектов.

Вставка:

- `author_id = auth.uid()`;
- нельзя добавлять себя в `recipient_ids`;
- если `recipient_ids` пустой, нужен `project_id` и право на проектный чат.

## Потенциальные следующие задачи

- Сделать полноценные диалоги/список бесед вместо фильтра чипами.
- Добавить счетчик непрочитанных сообщений по беседам.
- Перейти с polling на Supabase Realtime.
- Добавить вложения в мессенджер.
- Добавить удаление/редактирование сообщений.
- Вынести мессенджер из `App.jsx` в отдельный компонент.

## Проверка перед продолжением

Быстрая проверка фронта:

```bash
cd /Users/koshkin/SynologyDrive/Orbite/ProjectsWEB/Planing/frontend
npm run build
```

Проверка структуры `site_messages` через Supabase MCP:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'site_messages'
order by ordinal_position;
```

Ожидаемые колонки:

- `id`
- `author_id`
- `body`
- `created_at`
- `recipient_ids`
- `project_id`

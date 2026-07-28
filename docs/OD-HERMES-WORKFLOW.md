# Open Design + Hermes: автономный preview Vite/React

Этот проект уже является Vite/React-приложением. Hermes должен показывать в
Open Design настоящий интерфейс приложения, а не `index.html` как исходный текст,
не landing mockup и не результат работы стороннего агента.

## Основной путь: штатный powered-preview OD

OD имеет встроенный Vite-мост в маршруте `/api/projects/<id>/powered/...`:

1. Он распознаёт обычный Vite entry с модульным скриптом `/src/...`.
2. Для `frontend/index.html` подставляет `frontend/dist/index.html`.
3. Переписывает ссылки `/assets/...` на `dist/assets/...`.
4. Загружает собранные JS/CSS в изолированный preview iframe.

Поэтому Hermes должен выполнить в Beelink checkout:

```bash
cd /home/catmiser/projects/Planing/frontend
/home/catmiser/.hermes/node/bin/node scripts/build-od-native-preview.mjs
/home/catmiser/.hermes/node/bin/node scripts/verify-od-native-preview.mjs
```

Затем в Open Design открыть или обновить файл `frontend/index.html` и проверить
сам canvas. Открытие через `file://`, `npm run dev` или внешний браузер не
является preview OD.

## Почему preview не требует Supabase

Native preview build компилируется с `VITE_OD_PREVIEW=true`. В этом режиме:

- `App.jsx` выбирает `OD_PREVIEW_SESSION` и `OD_PREVIEW_DATA`;
- запросы к Supabase для загрузки рабочей области не запускаются;
- отображаются реальные компоненты Kanban/Gantt/проектной области;
- live data и production credentials остаются вне preview.

Hermes не должен просить логин пользователя только для визуальной проверки.

## Обязательная проверка перед сообщением «готово»

- verifier завершился без ошибок;
- в OD выбран именно `frontend/index.html`, а не исходник/старый artifact;
- canvas показывает интерфейс приложения;
- нет blank frame, source text, старого скриншота или landing mockup;
- после изменения CSS/компонентов выполнена новая native preview build;
- Hermes сообщает, какие файлы изменены и что проверено визуально.

## Fallback

Если приложение использует конструкцию, которую native powered-preview OD не может
загрузить, разрешён fallback `build-od-preview.mjs` + `verify-od-preview.mjs` с
артефактом `frontend/od-preview-built.html`. Это исключение, а не основной путь.

## Типовые ошибки

| Симптом | Проверка |
|---|---|
| Пустой canvas | Не открыт ли `file://`; есть ли `dist/index.html`; выполнена ли native build |
| Исходный Vite HTML | В OD выбран `frontend/index.html`, затем выполнен Refresh Preview |
| Старый дизайн | Повторить build + verifier и обновить выбранный файл в OD |
| Supabase/auth error | Проверить, что native build использует `VITE_OD_PREVIEW=true` |
| Broken assets | Не запускать dev server; проверить, что в `dist/index.html` есть `/assets/` и OD powered route |

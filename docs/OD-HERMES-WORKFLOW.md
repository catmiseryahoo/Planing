# Open Design + Hermes: автономный preview Vite/React

Этот проект уже является Vite/React-приложением. Hermes должен показывать в
Open Design настоящий интерфейс приложения, а не `index.html` как исходный текст,
не landing mockup и не результат работы стороннего агента.

## ⚠️ CRITICAL: Изоляция OD-preview от production

**OD-preview и production — это два разных режима сборки. Они никогда не должны пересекаться.**

| Аспект | OD-preview | Production |
|--------|-----------|------------|
| Entrypoint | `frontend/index.html` (через OD native Vite bridge) | `frontend/index.html` (чистый, без флагов) |
| Флаг preview | `VITE_OD_PREVIEW=true` (через `define` в Vite config) | Отсутствует |
| `window.__OD_PREVIEW__` | Не используется (compile-time) | Не используется |
| Данные | `OD_PREVIEW_DATA` из `odPreviewData.js` | Настоящий Supabase Auth |
| Supabase | Не требуется | `VITE_SUPABASE_URL=` (same-origin proxy) |
| Build команда | `build-od-native-preview.mjs` | `VITE_SUPABASE_URL= npm run build` |
| Tree-shaking моков | Моки в бандле (VITE_OD_PREVIEW=true) | Моки удалены (VITE_OD_PREVIEW undefined) |

### Гарантии изоляции

1. `IS_OD_PREVIEW` — compile-time константа: `import.meta.env.VITE_OD_PREVIEW === 'true'`.
   Никакого `window.__OD_PREVIEW__`.
2. В production `VITE_OD_PREVIEW` не определён → `IS_OD_PREVIEW = false` → tree-shaking удаляет все мок-данные.
3. `od-preview.vite.config.js` и `od-native-preview.vite.config.js` определяют `VITE_OD_PREVIEW=true` через `define`.
4. `frontend/index.html` НЕ содержит `window.__OD_PREVIEW__`.
5. `scripts/verify-production-safe.mjs` проверяет `frontend/dist/` перед каждым деплоем.

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

## Полный workflow: дизайн → production

### Шаг 1. Редактирование
Редактировать только файлы в `frontend/src/`. Не трогать `frontend/index.html`,
`od-preview.html`, сборки в `od-preview-build/`, `od-dist/`, `dist/`.

### Шаг 2. Проверка в OD preview
```bash
cd /home/catmiser/projects/Planing/frontend
/home/catmiser/.hermes/node/bin/node scripts/build-od-native-preview.mjs
/home/catmiser/.hermes/node/bin/node scripts/verify-od-native-preview.mjs
```
Визуально проверить в OD через `frontend/index.html`.

### Шаг 3. Production guard
```bash
# Убедиться, что frontend/index.html не содержит preview-флаг
grep -q '__OD_PREVIEW__' frontend/index.html && echo "FAIL" || echo "PASS"

# Собрать production
VITE_SUPABASE_URL= npm run build

# Запустить production guard
/home/catmiser/.hermes/node/bin/node scripts/verify-production-safe.mjs
```
Guard проверяет:
- `dist/index.html` не содержит `__OD_PREVIEW__`
- `dist/assets/index-*.js` не содержит `design-preview@example.local`
- `dist/assets/index-*.js` не содержит `OD_PREVIEW_SESSION`
- `dist/assets/index-*.js` содержит `signInWithPassword`

### Шаг 4. Деплой
```bash
cd /home/catmiser/projects/Planing
./deploy.sh
```

### Шаг 5. Проверка прода
```bash
curl -s https://plan.goplaytennis.ru/?v=cache-bust | grep -q '__OD_PREVIEW__' && echo "FAIL" || echo "PASS"
```

## Обязательная проверка перед сообщением «готово»

- verifier завершился без ошибок;
- в OD выбран именно `frontend/index.html`, а не исходник/старый artifact;
- canvas показывает интерфейс приложения;
- нет blank frame, source text, старого скриншота или landing mockup;
- после изменения CSS/компонентов выполнена новая native preview build;
- Hermes сообщает, какие файлы изменены и что проверено визуально;
- production guard пройден перед любым деплоем.

## Fallback

Если приложение использует конструкцию, которую native powered-preview OD не может
загрузить, разрешён fallback `build-od-preview.mjs` + `verify-od-preview.mjs` с
артефактом `frontend/od-preview-built.html`. Это исключение, а не основной путь.

**Fallback НЕ является production entrypoint.** `od-preview-built.html` никогда
не должен использоваться для production деплоя.

## Типовые ошибки

| Симптом | Проверка |
|---------|----------|
| Пустой canvas | Не открыт ли `file://`; есть ли `dist/index.html`; выполнена ли native build |
| Исходный Vite HTML | В OD выбран `frontend/index.html`, затем выполнен Refresh Preview |
| Старый дизайн | Повторить build + verifier и обновить выбранный файл в OD |
| Supabase/auth error | Проверить, что native build использует `VITE_OD_PREVIEW=true` |
| Broken assets | Не запускать dev server; проверить, что в `dist/index.html` есть `/assets/` и OD powered route |
| **Production показывает тестового пользователя** | **Немедленно проверить `frontend/index.html` на `__OD_PREVIEW__`, запустить `verify-production-safe.mjs`, пересобрать** |

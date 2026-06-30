#!/bin/bash
set -e

# Переходим в директорию скрипта
cd "$(dirname "$0")"

# Загружаем переменные из .env.local
if [ -f .env.local ]; then
  # Читаем только непустые строки без комментариев и экспортируем их
  export $(grep -v '^#' .env.local | grep -v '^[[:space:]]*$' | xargs)
fi

if [ -z "$FTP_USER" ] || [ -z "$FTP_PASS" ]; then
  echo "Ошибка: FTP_USER или FTP_PASS не заданы в .env.local"
  echo "Создайте файл .env.local на основе .env.local.example и заполните учетные данные FTP."
  exit 1
fi

echo "=== 1. Сборка фронтенда ==="
cd frontend
VITE_SUPABASE_URL= npm run build
cd ..

echo "=== 2. Подготовка пакета ==="
BUNDLE="/tmp/plan-hostland-node"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
cp -R frontend/dist "$BUNDLE/dist"
cp hostland/server.js "$BUNDLE/server.js"
cp hostland/server.js "$BUNDLE/app.js"

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

echo "=== 3. Загрузка файлов по FTP на Hostland ==="
BASE="ftp://plan.goplaytennis.ru/plan.goplaytennis.ru/projects/Plan"

# Создаем папки
find "$BUNDLE" -type d | while read -r dir; do
  rel="${dir#$BUNDLE}"
  [ -z "$rel" ] && continue
  curl -sS --ftp-pasv --ftp-create-dirs \
    -u "${FTP_USER}:${FTP_PASS}" \
    "$BASE$rel/" >/dev/null || true
done

# Загружаем файлы
find "$BUNDLE" -type f | while read -r file; do
  rel="${file#$BUNDLE/}"
  curl --fail --show-error --silent --ftp-pasv --ftp-create-dirs \
    --connect-timeout 20 --max-time 120 \
    -T "$file" \
    -u "${FTP_USER}:${FTP_PASS}" \
    "$BASE/$rel"
done

echo "=== 4. Перезапуск Node.js приложения ==="
printf 'restart %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /tmp/hostland-restart.txt
curl --fail --show-error --silent --ftp-pasv --ftp-create-dirs \
  --connect-timeout 20 --max-time 60 \
  -T /tmp/hostland-restart.txt \
  -u "${FTP_USER}:${FTP_PASS}" \
  "$BASE/tmp/restart.txt"

echo "=== Деплой успешно завершен! ==="

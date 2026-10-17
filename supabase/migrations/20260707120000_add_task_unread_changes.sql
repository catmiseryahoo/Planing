-- Добавляем колонку has_unread_changes для отслеживания изменений, которые еще не посмотрел ответственный
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS has_unread_changes BOOLEAN DEFAULT false;

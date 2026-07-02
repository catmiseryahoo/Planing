-- Добавление новых полей в профиль пользователя
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS messenger TEXT;

-- Функция-обработчик регистрации нового пользователя
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org_name TEXT;
  org_id UUID;
BEGIN
  -- Читаем название организации из метаданных (которые передаем с фронтенда)
  org_name := NEW.raw_user_meta_data->>'organization';

  -- 1. Проверяем уникальность названия организации (если оно передано)
  IF org_name IS NOT NULL AND TRIM(org_name) != '' THEN
    IF EXISTS (SELECT 1 FROM public.organizations WHERE name = TRIM(org_name)) THEN
      RAISE EXCEPTION 'Организация с именем "%" уже существует', TRIM(org_name);
    END IF;
  END IF;

  -- 2. Создаем или обновляем профиль пользователя
  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    last_name, 
    phone, 
    messenger, 
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'messenger',
    'Администратор'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role = 'Администратор',
    name = COALESCE(NEW.raw_user_meta_data->>'name', public.profiles.name),
    last_name = COALESCE(NEW.raw_user_meta_data->>'last_name', public.profiles.last_name),
    phone = COALESCE(NEW.raw_user_meta_data->>'phone', public.profiles.phone),
    messenger = COALESCE(NEW.raw_user_meta_data->>'messenger', public.profiles.messenger);

  -- 3. Создаем организацию, если имя было передано
  IF org_name IS NOT NULL AND TRIM(org_name) != '' THEN
    -- Вставляем запись в организации и получаем её ID
    INSERT INTO public.organizations (name, owner_id)
    VALUES (TRIM(org_name), NEW.id)
    RETURNING id INTO org_id;

    -- Создаем связь пользователя как администратора организации
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (org_id, NEW.id, 'owner');
    
    -- Создаем дефолтный проект для новой организации, чтобы рабочее место не было пустым
    INSERT INTO public.projects (name, status, color, organization_id)
    VALUES ('Первый проект', 'В работе', '#3b82f6', org_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Сбрасываем триггер, если он уже существовал, и создаем заново
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

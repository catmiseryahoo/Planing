const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Example: DATABASE_URL=postgresql://... node setup-db.cjs');
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Supabase DB");
    
    // 1. Создаем таблицу профилей, если ее нет
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        telegram TEXT,
        telegram_chat_id TEXT,
        telegram_link_code TEXT,
        telegram_link_code_expires_at TIMESTAMP WITH TIME ZONE,
        telegram_linked_at TIMESTAMP WITH TIME ZONE,
        role TEXT DEFAULT 'Сотрудник', 
        is_super_admin BOOLEAN NOT NULL DEFAULT false,
        avatar_color TEXT DEFAULT '#3b82f6',
        avatar_url TEXT,
        notification_channels JSONB NOT NULL DEFAULT '{"telegram": false, "whatsapp": false, "email": false}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS notification_channels JSONB NOT NULL DEFAULT '{"telegram": false, "whatsapp": false, "email": false}'::jsonb;

      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS telegram TEXT;

      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
      ADD COLUMN IF NOT EXISTS telegram_link_code TEXT,
      ADD COLUMN IF NOT EXISTS telegram_link_code_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP WITH TIME ZONE;

      ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

      CREATE OR REPLACE FUNCTION public.handle_new_user() 
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO public.profiles (id, email)
        VALUES (new.id, new.email);
        RETURN new;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    `);

    await client.query(`
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    `);

    // 2. Добавляем текущих пользователей в профили
    await client.query(`
      INSERT INTO public.profiles (id, email, role, is_super_admin, name)
      SELECT id, email, 'Администратор', true, email
      FROM auth.users
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log("Profiles table and trigger setup done.");

    // 3. Создаем таблицы для новых сущностей
    await client.query(`
      -- Организации
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Основная организация',
        owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        notification_channels JSONB NOT NULL DEFAULT '{"telegram":{"enabled":false,"sender":"","destination":""},"whatsapp":{"enabled":false,"sender":"","phone":""},"email":{"enabled":false,"fromName":"","fromEmail":"","replyTo":""}}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS notification_channels JSONB NOT NULL DEFAULT '{"telegram":{"enabled":false,"sender":"","destination":""},"whatsapp":{"enabled":false,"sender":"","phone":""},"email":{"enabled":false,"fromName":"","fromEmail":"","replyTo":""}}'::jsonb;

      -- Проекты
      CREATE TABLE IF NOT EXISTS projects (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        start_date DATE,
        end_date DATE,
        status TEXT DEFAULT 'Планируется',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

      -- Этапы (Stages)
      CREATE TABLE IF NOT EXISTS stages (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        order_index INTEGER DEFAULT 0,
        start_date DATE,
        end_date DATE,
        status TEXT DEFAULT 'Планируется',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      -- Задачи
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
        stage_id UUID REFERENCES public.stages(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        start_date DATE,
        due_date DATE,
        status TEXT DEFAULT 'Запланировано',
        priority TEXT DEFAULT 'Средний',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      -- Подзадачи (Subtasks)
      CREATE TABLE IF NOT EXISTS subtasks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        is_completed BOOLEAN DEFAULT false,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      -- Связи задач (Для Диаграммы Ганта)
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
        depends_on_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
        dependency_type TEXT DEFAULT 'finish_to_start',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      -- Комментарии
      CREATE TABLE IF NOT EXISTS comments (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
        author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      -- Файлы к задачам
      CREATE TABLE IF NOT EXISTS task_files (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
        uploader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

      -- Учет времени
      CREATE TABLE IF NOT EXISTS time_logs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
        user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
        hours NUMERIC(5, 2) NOT NULL,
        log_date DATE NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );
    `);

    console.log("All necessary tables created successfully!");

  } catch (err) {
    console.error("Error setting up DB:", err);
  } finally {
    await client.end();
  }
}

run();

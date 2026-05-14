const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:sakwym-mEmpap-6zazca@db.wqfpksyemvaxncsqwuzm.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Supabase DB");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        role TEXT DEFAULT 'Сотрудник', 
        avatar_color TEXT DEFAULT '#3b82f6',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
      );

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

    // Drop the trigger if it exists first
    await client.query(`
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    `);

    await client.query(`
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    `);
    
    // Also, let's insert the current user into the profiles table if they aren't already there
    await client.query(`
      INSERT INTO public.profiles (id, email, role, name)
      SELECT id, email, 'Администратор', email
      FROM auth.users
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log("Profiles table and trigger created successfully.");
  } catch (err) {
    console.error("Error setting up DB:", err);
  } finally {
    await client.end();
  }
}
run();

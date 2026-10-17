import { createClient } from '@supabase/supabase-js';

const defaultSupabaseUrl = 'https://wqfpksyemvaxncsqwuzm.supabase.co';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (
  import.meta.env.PROD ? `${window.location.origin}/supabase` : defaultSupabaseUrl
);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZnBrc3llbXZheG5jc3F3dXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDUyNTIsImV4cCI6MjA5MzYyMTI1Mn0.J1C1b0uw2PGJMWu-zh-CJ3xdKtWOYb6XNJH4-4nTzcQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

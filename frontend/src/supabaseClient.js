import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wqfpksyemvaxncsqwuzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZnBrc3llbXZheG5jc3F3dXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDUyNTIsImV4cCI6MjA5MzYyMTI1Mn0.J1C1b0uw2PGJMWu-zh-CJ3xdKtWOYb6XNJH4-4nTzcQ';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZnBrc3llbXZheG5jc3F3dXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA0NTI1MiwiZXhwIjoyMDkzNjIxMjUyfQ.sDIeIT4ndken6-XeA_VzR2eM0Do9W9EpfggLnL5IPcU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

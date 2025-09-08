const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ymjnholeztepjnbcbjcr.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment');

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'public' },
  global: { headers: { 'x-client-info': 'digitizerx-server' } },
});

module.exports = { supabaseAdmin, supabaseUrl };

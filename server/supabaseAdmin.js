import { createClient } from '@supabase/supabase-js';

/**
 * Server/admin client — DO NOT ship to the browser.
 * Reads the service role key from your server environment.
 * The service role key bypasses RLS; keep it secret.
 */
export const supabaseUrl = 'https://ymjnholeztepjnbcbjcr.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,   // server processes don't need local session
    autoRefreshToken: false, // tokens are static on the server
  },
  db: { schema: 'public' },
  global: { headers: { 'x-client-info': 'digitizerx-server' } },
});

export default supabaseAdmin;

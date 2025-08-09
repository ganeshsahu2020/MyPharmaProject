import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Supabase env variables are missing. Check your .env file.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Optional debug logs (remove in production)
console.log('✅ Supabase URL:', SUPABASE_URL);
console.log('✅ Supabase Key Loaded:', !!SUPABASE_ANON_KEY);

// ✅ Optional app version (from .env)
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'v1.0.0';

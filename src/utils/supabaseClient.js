// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Debugging: Log environment variables (remove in production)
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Supabase Key:', import.meta.env.VITE_SUPABASE_ANON_KEY?.substring(0, 10) + '...');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(`
    Missing Supabase configuration!
    Received:
    - VITE_SUPABASE_URL: ${supabaseUrl ? '***' : 'MISSING'}
    - VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '***' : 'MISSING'}
    
    Please ensure your .env file contains:
    VITE_SUPABASE_URL=your-project-url
    VITE_SUPABASE_ANON_KEY=your-anon-key
  `);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
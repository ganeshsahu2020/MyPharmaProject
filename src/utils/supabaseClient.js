// src/utils/supabaseClient.js
import {createClient} from '@supabase/supabase-js';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey=import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug only (won't run on Netlify build)
if(import.meta.env.DEV){
  console.log('Supabase URL:',supabaseUrl);
  console.log('Supabase Key:',(supabaseAnonKey||'').substring(0,10)+'...');
}

if(!supabaseUrl||!supabaseAnonKey){
  throw new Error(`
Missing Supabase configuration!
Received:
- VITE_SUPABASE_URL: ${supabaseUrl?'***':'MISSING'}
- VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey?'***':'MISSING'}
`);
}

export const supabase=createClient(supabaseUrl,supabaseAnonKey,{
  auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
});

import { createClient } from '@supabase/supabase-js';

/**
 * Frontend/browser client — safe to ship.
 * Uses env first, then falls back to your known project constants.
 */
export const supabaseUrl =
  import.meta?.env?.VITE_SUPABASE_URL ||
  'https://ymjnholeztepjnbcbjcr.supabase.co';

export const supabaseAnonKey =
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltam5ob2xlenRlcGpuYmNiamNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NjE3MDgsImV4cCI6MjA3MDAzNzcwOH0.AJ4Duoe0Pfv6PrqMl183-i5ZGymKhj1QjzcMAEU1eG8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'digitizerx.auth',
  },
  db: { schema: 'public' },
  global: { headers: { 'x-client-info': 'digitizerx-web' } },
  realtime: { params: { eventsPerSecond: 5 } },
});

export default supabase;

// Optional: tiny dev trace
if (import.meta?.env?.DEV) {
  console.log('[supabase] URL:', supabaseUrl);
  console.log('[supabase] ANON key prefix:', supabaseAnonKey.slice(0, 10) + '...');
  supabase.auth.onAuthStateChange((evt, session) =>
    console.log('[supabase.auth]', evt, 'user:', session?.user?.id || null)
  );
}

/* ---------- optional helpers ---------- */
export async function supabaseHealthcheck() {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey },
    });
    return {
      ok: res.ok,
      status: res.status,
      corsOrigin: res.headers.get('access-control-allow-origin'),
      supabaseApiVersion: res.headers.get('x-supabase-api-version'),
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Bare REST helper that adds apikey and (if signed in) the access token. */
export async function restFetch(path, init = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const headers = new Headers(init.headers || {});
  headers.set('apikey', supabaseAnonKey);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${supabaseUrl}${path}`, { ...init, headers });
}

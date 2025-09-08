// supabase/functions/avatar-stream/index.js
// Deno (Supabase Edge Functions)

const DID_API = 'https://api.d-id.com';

function withCORS(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'authorization,content-type');
  return new Response(res.body, { status: res.status, headers: h });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return withCORS(new Response(null, { status: 204 }));
  }

  // Everything after /functions/v1/avatar-stream… becomes the D-ID API path
  const url = new URL(req.url);
  const path =
    url.pathname.replace('/functions/v1/avatar-stream', '') || '/talks/streams';

  const DID_KEY = Deno.env.get('DID_API_KEY') ?? '';
  if (!DID_KEY) {
    return withCORS(
      new Response(
        JSON.stringify({ error: 'DID_API_KEY not set in Supabase secrets' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
    );
  }

  const headers = new Headers({
    'content-type': 'application/json',
    // Accept either raw API key or pre-prefixed "Basic ..." from secrets:
    authorization: DID_KEY.startsWith('Basic ') ? DID_KEY : `Basic ${DID_KEY}`,
  });

  let bodyText = '';
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    bodyText = await req.text();
  }

  const isCreate = req.method === 'POST' && path === '/talks/streams';

  // If creating a stream and no source_url provided, inject from env
  if (isCreate) {
    const data = bodyText ? JSON.parse(bodyText) : {};
    if (!data.source_url) {
      const img = Deno.env.get('DID_AVATAR_IMG') || '';
      if (img) data.source_url = img;
    }
    bodyText = JSON.stringify(data);
  }

  const upstream = await fetch(`${DID_API}${path}`, {
    method: req.method,
    headers,
    body:
      req.method === 'GET' || req.method === 'DELETE' ? undefined : bodyText,
  });

  // Pass through body and headers; ensure content-type exists
  const respHeaders = new Headers(upstream.headers);
  if (!respHeaders.get('content-type')) {
    respHeaders.set('content-type', 'application/json');
  }

  const resp = new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });

  return withCORS(resp);
});

// supabase/functions/heygen-clip/index.js
// Deno Edge Function: generate a short HeyGen clip and return its MP4 URL
// Auth: expects Supabase ANON or user JWT in Authorization: Bearer <token>

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function maybeDecodeBase64(s) {
  if (!s) return undefined;
  try {
    // If it looks base64 (ends with = or ==), try to decode; otherwise return as-is
    if (/[=]{1,2}$/.test(String(s).trim())) {
      const decoded = atob(String(s).trim());
      // very loose sanity check: decoded should be mostly printable
      if (decoded && /[A-Za-z0-9_\-\.]{10,}/.test(decoded)) return decoded;
    }
  } catch {
    /* ignore */
  }
  return s;
}

async function pickDefaultVoice(key) {
  // GET https://api.heygen.com/v2/voices  (X-Api-Key: KEY)
  const r = await fetch('https://api.heygen.com/v2/voices', {
    headers: { 'X-Api-Key': key },
  });
  const j = await r.json().catch(() => ({}));
  // Try to pick an English voice; otherwise first
  const voices = j?.data?.voices || j?.voices || [];
  const en = voices.find((v) =>
    (v?.language_code || v?.locale || '').toLowerCase().startsWith('en')
  );
  return en?.voice_id || voices?.[0]?.voice_id || '';
}

async function createVideo(key, avatarId, voiceId, text, width = 1280, height = 720) {
  // POST https://api.heygen.com/v2/video/generate
  const body = {
    caption: false,
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
        voice: { type: 'text', input_text: text, voice_id: voiceId, speed: 1, pitch: 0 },
        background: { type: 'color', value: '#000000' },
      },
    ],
    dimension: { width, height },
  };

  const r = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`HeyGen generate failed ${r.status}: ${JSON.stringify(j)}`);
  }

  const videoId = j?.data?.video_id || j?.video_id;
  if (!videoId) throw new Error(`No video_id from HeyGen: ${JSON.stringify(j)}`);
  return videoId;
}

async function pollStatus(key, videoId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(
      videoId
    )}`;
    const r = await fetch(url, { headers: { 'X-Api-Key': key } });
    const j = await r.json().catch(() => ({}));
    // Examples: { status: "completed", video_url: "...", data: { result_url: "..." } }
    const status = j?.data?.status || j?.status;
    const result =
      j?.data?.video_url ||
      j?.data?.result_url ||
      j?.video_url ||
      j?.result_url;

    if (status === 'completed' && result) return result;
    if (status === 'failed') {
      throw new Error(`HeyGen status failed: ${JSON.stringify(j)}`);
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('Timed out waiting for HeyGen video');
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Use POST { text }' }), {
        status: 405,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const envKeyRaw = Deno.env.get('HEYGEN_API_KEY');
    const envAvatar = Deno.env.get('HEYGEN_AVATAR_ID') || '';
    const heygenKey = maybeDecodeBase64(envKeyRaw);

    if (!heygenKey) {
      return new Response(
        JSON.stringify({ error: 'HEYGEN_API_KEY is not set in Supabase secrets' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "Missing 'text' in body" }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const avatarId = String(body.avatar_id || envAvatar || '').trim();
    if (!avatarId) {
      return new Response(
        JSON.stringify({
          error: 'Missing avatar_id (set HEYGEN_AVATAR_ID secret or pass in body)',
        }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    let voiceId = String(body.voice_id || '').trim();
    if (!voiceId) voiceId = await pickDefaultVoice(heygenKey);
    if (!voiceId) {
      return new Response(
        JSON.stringify({ error: 'Could not resolve a default voice_id from HeyGen' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const videoId = await createVideo(
      heygenKey,
      avatarId,
      voiceId,
      text,
      body.width || 1280,
      body.height || 720
    );
    const mp4 = await pollStatus(heygenKey, videoId, 60000);

    return new Response(JSON.stringify({ url: mp4, video_id: videoId }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e?.message || String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

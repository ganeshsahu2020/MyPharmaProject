// src/utils/askVoice.js
const AI_BASE = import.meta.env.VITE_SUPABASE_URL || "";
const AI_ENDPOINT = AI_BASE + (import.meta.env.VITE_AI_ENDPOINT || "/functions/v1/ai-ask");

const getBearer = async () => {
  let bearer = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  try {
    const { supabase } = await import("./supabaseClient.js");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) bearer = session.access_token;
  } catch {
    /* ignore */
  }
  return bearer;
};

const isRagBackendMissing = (msg = "") =>
  /match_documents/i.test(msg) ||
  /schema cache/i.test(msg) ||
  /42P01/i.test(msg) ||           // undefined table/function
  /function .* does not exist/i.test(msg);

const callEdge = async (bearer, body, { timeoutMs = 30000 } = {}) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);

  let res;
  let text = "";
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    text = await res.text();
  } finally {
    clearTimeout(t);
  }

  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { error: text || "Server error" }; }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
};

export const ask = async (text, opts = {}) => {
  if (!AI_BASE) throw new Error("VITE_SUPABASE_URL is not set");

  const query = String(text || "").trim();
  if (!query) throw new Error("Empty query");

  const initialMode = opts.mode ?? "rag";
  const body = {
    query,
    mode: initialMode,
    topK: Number.isFinite(opts.topK) ? opts.topK : (initialMode === "rag" ? 12 : 0),
    minSim: typeof opts.minSim === "number" ? opts.minSim : 0.35,
    // These are optional; send only if provided
    schemas: opts.schemas || undefined,
    module: opts.module || undefined,
    submodule: opts.submodule || undefined,
  };

  const bearer = await getBearer();

  let data;
  try {
    data = await callEdge(bearer, body);
  } catch (err) {
    const msg = String(err?.message || err || "");
    // If RAG infra isn't ready, transparently retry in GEN
    if (initialMode === "rag" && isRagBackendMissing(msg)) {
      const fallback = { ...body, mode: "gen", topK: 0, minSim: 0 };
      data = await callEdge(bearer, fallback).catch((e2) => {
        throw new Error(`RAG unavailable; GEN fallback also failed: ${e2?.message || e2}`);
      });
    } else {
      throw new Error(msg);
    }
  }

  // Optional TTS (same behavior you had)
  if (
    opts.speak !== false &&
    typeof window !== "undefined" &&
    window.speechSynthesis &&
    data?.answer
  ) {
    try {
      const u = new SpeechSynthesisUtterance(data.answer);
      u.lang = opts.lang || "en-IN";
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      const voices = window.speechSynthesis.getVoices?.() || [];
      if (opts.voiceName) {
        u.voice = voices.find((v) => v.name === opts.voiceName) || null;
      }
      try { window.speechSynthesis.cancel(); } catch {}
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  return data; // { answer, sources?, cost?, usage? }
};

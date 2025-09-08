// src/utils/aiSuggest.js
const AI_BASE = import.meta.env.VITE_SUPABASE_URL || "";
const AI_ENDPOINT = AI_BASE + (import.meta.env.VITE_AI_ENDPOINT || "/functions/v1/ai-ask");

const getBearer = async () => {
  // Prefer logged-in user; fall back to anon
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

export const aiSuggest = async (prompt) => {
  if (!AI_BASE) throw new Error("VITE_SUPABASE_URL is not set");
  const body = {
    query: String(prompt || "").trim(),
    mode: "gen",   // suggestions don't need RAG; avoids match_documents
    topK: 0,
    minSim: 0,
  };

  const bearer = await getBearer();

  // Small timeout guard
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);

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

  return data?.answer ?? "";
};

// src/utils/aiSuggest.js
export const aiSuggest = async (prompt) => {
  const r = await fetch(
    import.meta.env.VITE_SUPABASE_URL + '/functions/v1/ai-ask',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: prompt, topK: 0, minSim: 0 }),
    }
  );

  const j = await r.json();
  if (!r.ok) {
    throw new Error(j.error || 'AI call failed');
  }
  return j.answer;
};

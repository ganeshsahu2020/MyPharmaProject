// Deno Deploy / Supabase Edge Function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.60.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

// ------------ Config (NO SUPABASE_* names here) ------------
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const CHAT_MODEL = Deno.env.get("AI_CHAT_MODEL") || "gpt-4o-mini";
const EMB_MODEL = Deno.env.get("AI_EMBED_MODEL") || "text-embedding-3-small";

// Either supply PROJECT_URL via secrets OR we fall back to your project URL
const PROJECT_URL =
  Deno.env.get("PROJECT_URL") || "https://ymjnholeztepjnbcbjcr.supabase.co";

// SERVICE_ROLE_KEY is the only key we need for server-side Supabase
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || // fallback if you ever set it in Dashboard
  "";

// Pricing per 1k tokens
const PRICING = {
  chat_in: Number(Deno.env.get("PRICE_CHAT_IN_PER_1K") ?? 0.00015),
  chat_out: Number(Deno.env.get("PRICE_CHAT_OUT_PER_1K") ?? 0.0006),
  embed: Number(Deno.env.get("PRICE_EMB_PER_1K") ?? 0.00002),
};

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

// ------------ Types ------------
type DocRow = {
  id: string;
  content: string;
  page?: number | null;
  section?: string | null;
  source: string;
  sim?: number;
};
type AskPayload = {
  query: string;
  mode?: "rag" | "gen" | "ops";
  topK?: number;
  minSim?: number;
  equipment?: string;
  module?: string | null;
  submodule?: string | null;
  schemas?: string[];
  entity?: string | null;
  key?: string | null;
  userId?: string | null;
};

// ------------ Helpers ------------
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return h.toString(36);
};
const jaccard = (a: string, b: string) => {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const u = A.size + B.size - inter;
  return u ? inter / u : 0;
};
const mmrSelect = (rows: Array<Required<DocRow>>, k: number) => {
  const picked: Array<Required<DocRow>> = [];
  const used = new Set<number>();
  while (picked.length < k && picked.length < rows.length) {
    let best = -1, bestScore = -1;
    for (let i = 0; i < rows.length; i++) {
      if (used.has(i)) continue;
      const cand = rows[i];
      const penalty = picked
        .reduce((acc, r) => acc + jaccard(r.content, cand.content), 0) /
        Math.max(1, picked.length);
      const score = 0.75 * (cand.sim ?? 0) - 0.25 * penalty;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best === -1) break;
    used.add(best);
    picked.push(rows[best]);
  }
  return picked;
};
const addUsage = (acc: any, usage: any, kind: "chat" | "embed") => {
  if (!usage) return;
  if (kind === "chat") {
    acc.prompt_tokens += usage.prompt_tokens || 0;
    acc.completion_tokens += usage.completion_tokens || 0;
  } else {
    acc.embedding_tokens += usage.prompt_tokens || 0;
  }
  acc.total_tokens =
    acc.prompt_tokens + acc.completion_tokens + acc.embedding_tokens;
};
const estimateCost = (usage: any) => {
  const inCost = (usage.prompt_tokens / 1000) * PRICING.chat_in;
  const outCost = (usage.completion_tokens / 1000) * PRICING.chat_out;
  const embCost = (usage.embedding_tokens / 1000) * PRICING.embed;
  const total = inCost + outCost + embCost;
  return {
    currency: "USD",
    model: CHAT_MODEL,
    embed_model: EMB_MODEL,
    pricing_per_1k: {
      chat_in: PRICING.chat_in,
      chat_out: PRICING.chat_out,
      embed: PRICING.embed,
    },
    input: inCost, output: outCost, embedding: embCost, total
  };
};
const cors = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
});
const json = (obj: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json", ...cors() },
    ...init,
  });

// Intent detector
const detect = (q: string) => {
  const s = q.toLowerCase();
  if (/\b(modules?|submodules?)\b/.test(s)) return "catalog";
  if (/\b(schema|tables?|columns?|datatype|structure|view|matview)\b/.test(s)) return "schema";
  if (/\b(who|when|status|count|how many|open|closed|created|updated|by whom|owner)\b/.test(s)) return "entity";
  return "rag";
};

// OpenAI helpers
const getRewrites = async (q: string) => {
  const c = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: "Rewrite the user question into 3 diverse search queries (short). Return as lines." },
      { role: "user", content: q },
    ],
  });
  const text = c.choices?.[0]?.message?.content || "";
  const list = text.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 3);
  return { rewrites: list, usage: c.usage };
};
const embedAll = async (texts: string[]) => {
  const e = await openai.embeddings.create({ model: EMB_MODEL, input: texts });
  return { embeddings: e.data.map(d => d.embedding as number[]), usage: e.usage };
};

// Vector search
const vectorSearch = async (
  emb: number[], limit: number, minSim: number, mod?: string | null, sub?: string | null
): Promise<Required<DocRow>[]> => {
  try {
    const { data, error } = await supabase.rpc("rag_search", {
      qe: `[${emb.join(",")}]`, in_module: mod ?? null, in_sub: sub ?? null,
      topk: limit, minsim: minSim,
    });
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) {
      return data.map((r: any) => ({
        id: r.id,
        content: r.content,
        page: r.page ?? null,
        section: r.section ?? null,
        source: r.source,
        sim: typeof r.sim === "number" ? r.sim : (r.similarity ?? 0),
      })) as Required<DocRow>[];
    }
  } catch { /* fall through */ }

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: emb,
    match_count: limit,
    similarity_threshold: minSim,
    in_module: mod ?? null,
    in_sub: sub ?? null,
  } as any);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    content: r.content,
    page: r.page ?? null,
    section: r.section ?? null,
    source: r.source,
    sim: typeof r.similarity === "number" ? r.similarity : (r.score ?? 0),
  })) as Required<DocRow>[];
};

// Build LLM context
const buildContext = (rows: Required<DocRow>[]) =>
  rows.map((r, i) => `[#${i + 1}] (src: ${r.source}${r.page ? ` p.${r.page}` : ""})\n${r.content}`).join("\n\n");

// Catalog (prefer ai_docs_compat; fallback to RPC)
const getCatalog = async () => {
  // 1) try row with matching title
  try {
    const { data, error } = await supabase
      .from("ai_docs_compat")
      .select("content")
      .eq("title", "DigitizerX Modules Catalog")
      .limit(1)
      .maybeSingle();
    if (!error && data?.content) return data.content as string;
  } catch {}

  // 2) try just the first row if title column isn’t present in the view exposure
  try {
    const { data, error } = await supabase
      .from("ai_docs_compat")
      .select("content")
      .limit(1)
      .maybeSingle();
    if (!error && data?.content) return data.content as string;
  } catch {}

  // 3) fallback RPC
  try {
    const { data: rpc, error: rpcErr } = await supabase.rpc("fn_get_catalog_text");
    if (!rpcErr && typeof rpc === "string" && rpc) return rpc as string;
  } catch {}

  return null;
};

// Schema RPC
const getSchema = async (q: string | null, schemas: string[] = ["public"]) => {
  const { data, error } = await supabase.rpc("fn_ai_schema", {
    q: q, schemas: schemas, include_views: true
  });
  if (error) throw error;
  return data;
};

// Entity RPCs
const lookupEntity = async (entity: string, key: string) => {
  const { data, error } = await supabase.rpc("fn_ai_entity_lookup", {
    p_entity: entity, p_key: key
  });
  if (error) throw error;
  return data;
};
const countStatus = async (table: string, statusCol: string, value: string) => {
  const { data, error } = await supabase.rpc("fn_ai_counts", {
    p_table: table, p_status_col: statusCol, p_status_value: value
  });
  if (error) throw error;
  return data as number | null;
};

// ------------ Main ------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors() });

  try {
    const payload = await req.json() as AskPayload;
    const mode = (payload.mode || "rag") as "rag" | "gen" | "ops";
    const usage = { prompt_tokens: 0, completion_tokens: 0, embedding_tokens: 0, total_tokens: 0 };

    // GEN
    if (mode === "gen") {
      const sys = "You are a helpful assistant for GMP-friendly drafts and professional writing.";
      const c = await openai.chat.completions.create({
        model: CHAT_MODEL, temperature: 0.4,
        messages: [{ role: "system", content: sys }, { role: "user", content: payload.query }]
      });
      addUsage(usage, c.usage, "chat");
      const answer = c.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response.";
      return json({ answer, sources: [], usage, cost: estimateCost(usage) });
    }

    // OPS
    if (mode === "ops") {
      const sys = "You are an operations assistant. If real data is missing, explain what would be needed and suggest next steps.";
      const userMsg = [payload.equipment ? `Equipment: ${payload.equipment}` : null, payload.query].filter(Boolean).join("\n\n");
      const c = await openai.chat.completions.create({
        model: CHAT_MODEL, temperature: 0.2,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }]
      });
      addUsage(usage, c.usage, "chat");
      const answer = c.choices?.[0]?.message?.content?.trim() ||
        "OPS mode is not yet connected to live data in this environment.";
      return json({ answer, sources: [], usage, cost: estimateCost(usage) });
    }

    // Intent
    const intent = detect(payload.query);

    // Catalog
    if (intent === "catalog") {
      const catalog = await getCatalog();
      const answer = catalog || "Catalog not found. Seed ai_docs_compat('DigitizerX Modules Catalog') or publish via fn_get_catalog_text().";
      return json({ answer, source: "catalog", usage, cost: estimateCost(usage) });
    }

    // Schema
    if (intent === "schema") {
      const term = (payload.query.match(/of\s+([A-Za-z0-9_]+)/i)?.[1]) || null;
      const schemas = payload.schemas?.length ? payload.schemas : ["public"];
      const data = await getSchema(term, schemas);
      const answer = data && data.length ? data : "No matching tables/columns.";
      return json({ answer, source: "schema", term, usage, cost: estimateCost(usage) });
    }

    // Entity
    if (intent === "entity") {
      const ent = (payload.entity || payload.query.match(/vendor|user|breakdown|pm work ?order|pm_work_order/i)?.[0]?.replace(/\s+/g, "_") || "").toLowerCase();
      const k = (payload.key || payload.query.match(/["'`](.+?)["'`]/)?.[1] || payload.query.split(/\s/).pop() || "").trim();
      if (ent && k) {
        const row = await lookupEntity(ent, k);
        if (row && Object.keys(row).length) return json({ answer: row, source: "entity", entity: ent, key: k, usage, cost: estimateCost(usage) });
      }
      const m = payload.query.match(/how many (\w+) .* (open|closed|active|inactive)/i);
      if (m) {
        const table = m[1]; const status = m[2];
        const n = await countStatus(table, "status", status);
        return json({ answer: { table, status, count: n ?? 0 }, source: "entity-count", usage, cost: estimateCost(usage) });
      }
      return json({ answer: "No matching record found.", source: "entity", usage, cost: estimateCost(usage) });
    }

    // RAG default
    const topK = Math.max(1, Math.min(50, Number(payload.topK ?? 12)));
    const minSim = Math.max(0, Math.min(0.99, Number(payload.minSim ?? 0.35)));

    const { rewrites, usage: rwUsage } = await getRewrites(payload.query); addUsage(usage, rwUsage, "chat");
    const queries = [payload.query, ...rewrites];

    const { embeddings, usage: embUsage } = await embedAll(queries); addUsage(usage, embUsage, "embed");

    const candidates: Required<DocRow>[] = []; const seen = new Set<string>();
    for (const emb of embeddings) {
      const rows = await vectorSearch(emb, Math.max(topK * 2, 24), minSim, payload.module ?? null, payload.submodule ?? null);
      for (const r of rows) {
        if ((r.sim ?? 0) >= minSim) {
          const key = `${r.source}|${r.page}|${hash(r.content)}`;
          if (!seen.has(key)) { seen.add(key); candidates.push(r); }
        }
      }
    }
    if (candidates.length < Math.max(6, topK / 2)) {
      const rows = await vectorSearch(embeddings[0], Math.max(topK * 2, 24), Math.max(0, minSim - 0.1), payload.module ?? null, payload.submodule ?? null);
      for (const r of rows) {
        const key = `${r.source}|${r.page}|${hash(r.content)}`;
        if (!seen.has(key)) { seen.add(key); candidates.push(r); }
      }
    }

    const selected = mmrSelect(candidates, topK);
    const context = buildContext(selected);

    const systemMsg = "You are a meticulous document assistant. Answer ONLY using the provided context. If missing, say you couldn't find it. Always cite like [#1], [#2] using the ids from the context blocks.";
    const prompt = [
      "User question:", payload.query, "",
      "Context (numbered):", context || "(no relevant context found)", "",
      "Answer with citations:"
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL, messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }], temperature: 0.2
    });
    addUsage(usage, completion.usage, "chat");

    const answer = completion.choices?.[0]?.message?.content?.trim() || "I couldn’t find this in the document.";
    const sources = selected.map((r, i) => ({ id: i + 1, source: `${r.source}${r.page ? ` p.${r.page}` : ""}`, similarity: r.sim ?? 0 }));
    return json({ answer, sources, usage, cost: estimateCost(usage) });

  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: cors() });
  }
}, { onListen: () => console.log("ai-ask function ready") });

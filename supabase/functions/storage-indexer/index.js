// supabase/functions/storage-indexer/index.js
// Deno runtime (Supabase Edge) – Storage PDF indexer with dryRun + diagnostics

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// pdf.js (legacy build) — works on Deno/Edge without a worker file
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.4.168/legacy/build/pdf.mjs";

// Turn off the worker on Edge (guard in case props are missing)
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = undefined;
  pdfjsLib.GlobalWorkerOptions.workerPort = null;
} catch { /* noop */ }

/* -------------------- ENV -------------------- */
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") || "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/* -------------------- HTTP HELPERS -------------------- */
const cors = (h = new Headers()) => {
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-headers", "authorization, apikey, content-type");
  h.set("access-control-allow-methods", "POST,OPTIONS");
  return h;
};
const j = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: cors(new Headers({ "content-type": "application/json" })),
    status,
  });

/* -------------------- OPENAI -------------------- */
async function embedTexts(texts) {
  if (!OPENAI_API_KEY) throw new Error("STEP:embed | OPENAI_API_KEY missing");
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`STEP:embed | ${r.status} | ${body}`);
  const jj = JSON.parse(body);
  return (jj.data || []).map((d) => d.embedding);
}

/* -------------------- HELPERS -------------------- */
const clean = (s) => s.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();

function chunkTextByLength(text, maxLen = 1200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    const slice = text.slice(i, i + maxLen).trim();
    if (slice) chunks.push(slice);
  }
  return chunks;
}

/* -------------------- MAIN -------------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  try {
    // Auth: require service role (or any Bearer, depending on your policy)
    const auth = req.headers.get("authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) {
      return j({ error: "Unauthorized: missing Authorization header" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    // Diagnostics (no external calls)
    if (body && body.__diag__ === true) {
      return j({
        ok: true,
        hasOpenAI:
          OPENAI_API_KEY.startsWith("sk-") || OPENAI_API_KEY.startsWith("sk-proj-"),
        supabaseUrlSet: !!SUPABASE_URL,
        hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY,
      });
    }

    const { bucket, key, overwrite = false, dryRun = false } = body || {};
    if (!bucket || !key) return j({ error: "Provide { bucket, key }" }, 400);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("STEP:init | Supabase env missing");
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Verify object exists & get signed URL
    const signed = await sb.storage.from(bucket).createSignedUrl(key, 60);
    if (signed && signed.error) {
      throw new Error(
        `STEP:download | cannot sign url for ${bucket}/${key} | ${JSON.stringify(
          signed.error
        )}`
      );
    }
    const signedURL = signed?.data?.signedUrl;
    if (!signedURL) throw new Error("STEP:download | no signed URL");

    const pdfResp = await fetch(signedURL);
    if (!pdfResp.ok) {
      throw new Error(`STEP:download | fetch ${bucket}/${key} ${pdfResp.status}`);
    }
    // Uint8Array works fine here
    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());

    // 2) Parse PDF (per page)
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      disableWorker: true,     // important on Edge
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    });

    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (e) {
      throw new Error(`STEP:pdf_parse | ${String(e)}`);
    }

    const pageCount = pdf.numPages;
    const title = key.split("/").pop() || key;

    // 3) Extract text page-by-page
    const pageTexts = [];
    for (let p = 1; p <= pageCount; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const s = clean(
        (content.items || [])
          .map((it) => (typeof it?.str === "string" ? it.str : ""))
          .join(" ")
      );
      if (s) pageTexts.push({ page: p, text: s });
    }

    if (dryRun) {
      const totalChars = pageTexts.reduce((acc, t) => acc + t.text.length, 0);
      const firstSnip = (pageTexts[0]?.text || "").slice(0, 200);
      return j({
        ok: true,
        note: "dryRun",
        file: `${bucket}/${key}`,
        pages: pageCount,
        totalChars,
        firstPageSnippet: firstSnip,
      });
    }

    // 4) Chunk
    const rows = [];
    for (const pt of pageTexts) {
      const chunks = chunkTextByLength(pt.text, 1200);
      for (const c of chunks) {
        rows.push({
          title,
          source: `${title}#p${pt.page}`,
          chunk: c,
          meta: { bucket, key, page: pt.page },
        });
      }
    }

    if (rows.length === 0) {
      return j({
        ok: true,
        note: "no-text",
        file: `${bucket}/${key}`,
        pages: pageCount,
      });
    }

    // Optional overwrite: delete existing rows for these pages first (once per page)
    if (overwrite) {
      const pages = [...new Set(rows.map((r) => r.meta.page))];
      for (const pg of pages) {
        const srcPrefix = `${title}#p${pg}`;
        const del = await sb.from("ai_documents").delete().like("source", `${srcPrefix}%`);
        if (del && del.error) {
          throw new Error(`STEP:db_delete | ${JSON.stringify(del.error)}`);
        }
      }
    }

    // 5) Embed + insert in batches
    const BATCH = 32;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const embeddings = await embedTexts(batch.map((r) => r.chunk));

      const toInsert = batch.map((r, idx) => ({
        title: r.title,
        source: r.source,
        chunk: r.chunk,
        embedding: embeddings[idx],
        meta: r.meta,
      }));

      const ins = await sb.from("ai_documents").insert(toInsert);
      if (ins && ins.error) {
        throw new Error(`STEP:db_insert | ${JSON.stringify(ins.error)}`);
      }
      inserted += toInsert.length;
    }

    return j({
      ok: true,
      file: `${bucket}/${key}`,
      pages: pageCount,
      inserted,
    });
  } catch (err) {
    const msg = String(err || "");
    return j({ error: msg }, 500);
  }
});

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [,, bucket, key, localPath] = process.argv;
if (!bucket || !key || !localPath) {
  console.error('Usage: node tools/upload.mjs <bucket> <key> <localPath>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || "";
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !svc) { console.error("Missing SUPABASE_URL or SERVICE_ROLE"); process.exit(1); }

const sb = createClient(url, svc);
const bytes = await readFile(localPath);

const { data, error } = await sb.storage.from(bucket).upload(key, bytes, {
  contentType: "application/pdf",
  upsert: true
});
if (error) { console.error(error); process.exit(1); }
console.log("✅ uploaded:", data);

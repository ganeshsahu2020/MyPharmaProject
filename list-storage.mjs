import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [, , bucket, prefix=""] = process.argv;
const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, sortBy:{ column:"name", order:"asc" }});
if (error) { console.error(error); process.exit(1); }
for (const o of data) console.log(prefix ? `${prefix}/${o.name}` : o.name);

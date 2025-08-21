// tools/push-qr.mjs
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL) {
  console.error('❌ Missing VITE_SUPABASE_URL (or SUPABASE_URL) in .env');
  process.exit(1);
}
if (!SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE in .env (no VITE_ prefix)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// HTML to upload (keep your page at public/qr/index.html)
const localPath = path.resolve(__dirname, '../public/qr/index.html');
if (!fs.existsSync(localPath)) {
  console.error(`❌ Not found: ${localPath}`);
  console.error('   Create it at public/qr/index.html and try again.');
  process.exit(1);
}

const BUCKET = 'qr';

async function ensureBucket() {
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '10MB',
      allowedMimeTypes: ['text/html'],
    });
    if (createErr && !/already exists/i.test(createErr.message)) throw createErr;
    console.log('🪣 Created bucket:', BUCKET);
    return;
  }
  if (!bucket.public) {
    const { error: updErr } = await supabase.storage.updateBucket(BUCKET, { public: true });
    if (updErr) throw updErr;
    console.log('🔓 Made bucket public:', BUCKET);
  }
}

async function main() {
  await ensureBucket();

  const buf = fs.readFileSync(localPath);
  const { error: upErr } = await supabase
    .storage.from(BUCKET)
    .upload('index.html', buf, { upsert: true, contentType: 'text/html', cacheControl: '60' });

  if (upErr) {
    console.error('❌ Upload failed:', upErr.message || upErr);
    process.exit(1);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/index.html`;
  console.log('✅ Uploaded qr/index.html');
  console.log('🌐 Public URL:', publicUrl);
  console.log('🔗 Example with token:', `${publicUrl}?id=<public_token>`);
}

main().catch((e) => {
  console.error('❌ Error:', e.message || e);
  process.exit(1);
});

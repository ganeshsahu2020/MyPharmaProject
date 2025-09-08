import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ymjnholeztepjnbcbjcr.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'public' },
  global: { headers: { 'x-client-info': 'digitizerx-server' } },
});

const uid = process.argv[2];
if (!uid) { console.error('Usage: node server/getLabelByUid.mjs <UID>'); process.exit(1); }

const selectView = 'uid,grn_no,line_no,item_code,material_code,material_desc,uom,net_qty,num_containers,container_index,item_batch_no,invoice_no,vendor_code,vendor_batch_no,manufacturer,mfg_date,exp_date,next_inspection_date,storage_condition,lr_no,lr_date,transporter_name,vehicle,printed_by,printed_at';

const { data, error } = await admin
  .from('vw_label_prints_latest')
  .select(selectView)
  .eq('uid', uid)
  .maybeSingle();

if (!error && data) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// Fallback to base table (older rows may have sap_batch_no)
const selectBase = 'uid,grn_no,line_no,item_code,material_code,material_desc,uom,net_qty,num_containers,container_index,sap_batch_no,invoice_no,vendor_code,vendor_batch_no,manufacturer,mfg_date,exp_date,next_inspection_date,storage_condition,lr_no,lr_date,transporter_name,vehicle,printed_by,printed_at';

const { data: base, error: e2 } = await admin
  .from('label_prints')
  .select(selectBase)
  .eq('uid', uid)
  .order('printed_at', { ascending: false })
  .limit(1);

if (e2) { console.error('Error:', e2.message); process.exit(2); }
if (!base?.length) { console.log('No record found.'); process.exit(0); }

const row = base[0];
row.item_batch_no = row.item_batch_no ?? row.sap_batch_no ?? null;
console.log(JSON.stringify(row, null, 2));

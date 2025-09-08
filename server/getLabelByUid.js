import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ymjnholeztepjnbcbjcr.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'public' },
  global: { headers: { 'x-client-info': 'digitizerx-server' } },
});

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node server/getLabelByUid.js <UID>');
  process.exit(1);
}

const selectView = 
  uid,grn_no,line_no,item_code,material_code,material_desc,uom,net_qty,
  num_containers,container_index,item_batch_no,invoice_no,vendor_code,
  vendor_batch_no,manufacturer,mfg_date,exp_date,next_inspection_date,
  storage_condition,lr_no,lr_date,transporter_name,vehicle,printed_by,printed_at
.replace(/\s+/g,''); // compact for safety

(async () => {
  // try the view first (works even if column names changed)
  let { data, error } = await admin
    .from('vw_label_prints_latest')
    .select(selectView)
    .eq('uid', uid)
    .maybeSingle();

  if (error || !data) {
    // fallback to base table (older rows may still have sap_batch_no)
    const { data: base, error: e2 } = await admin
      .from('label_prints')
      .select(
        uid,grn_no,line_no,item_code,material_code,material_desc,uom,net_qty,
        num_containers,container_index,sap_batch_no,invoice_no,vendor_code,
        vendor_batch_no,manufacturer,mfg_date,exp_date,next_inspection_date,
        storage_condition,lr_no,lr_date,transporter_name,vehicle,printed_by,printed_at
      )
      .eq('uid', uid)
      .order('printed_at', { ascending: false })
      .limit(1);

    if (e2) {
      console.error('Error:', e2.message);
      process.exit(2);
    }
    if (!base?.length) {
      console.log('No record found.');
      process.exit(0);
    }
    const b = base[0];
    // normalize item_batch_no for consumers
    b.item_batch_no = b.item_batch_no ?? b.sap_batch_no ?? null;
    console.log(JSON.stringify(b, null, 2));
    return;
  }

  console.log(JSON.stringify(data, null, 2));
})();

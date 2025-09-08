// src/api/weightCapture.js
import { supabase } from '../utils/supabaseClient';

/**
 * Persist weight capture for a PO + Invoice.
 * - Upserts header into weight_capture_headers
 * - For each material: upsert item and replace containers
 */
export async function saveWeightCapture({ po_no, invoice_no, invoice_date, materials, finalize, user }) {
  // 1) Upsert header by (po_no, invoice_no)
  const { data: headerArr, error: hErr } = await supabase
    .from('weight_capture_headers')
    .upsert(
      [{
        po_no,
        invoice_no,
        invoice_date: invoice_date || null,
        status: finalize ? 'Released' : 'Submitted',
        updated_by: user?.id || null,
      }],
      { onConflict: 'po_no,invoice_no' }
    )
    .select()
    .limit(1);

  if (hErr) throw hErr;
  const header = Array.isArray(headerArr) ? headerArr[0] : headerArr;

  // 2) For each material: upsert item, then replace containers
  for (const m of (materials || [])) {
    const { data: itemArr, error: iErr } = await supabase
      .from('weight_capture_items')
      .upsert(
        [{
          header_id: header.id,
          material_code: m.material_code,
          material_desc: m.material_desc,
          uom: m.weight_uom || m.uom || null,
          po_qty: m.po_qty,
          recv_qty: m.recv_qty,
          vendor_code: m.vendor_code,
          vendor_batch_no: m.vendor_batch_no,
          manufacturer: m.manufacturer,
          manufacturer_batch_no: m.manufacturer_batch_no,
          po_line_item: m.po_line_item ? Number(m.po_line_item) : null,
          mfg_date: m.mfg_date || null,
          exp_date: m.exp_date || null,
          retest_date: m.retest_date || null,
          weigh_status: finalize ? 'Completed' : (m.weigh_status || 'Draft'),
        }],
        { onConflict: 'header_id,material_code' }
      )
      .select()
      .limit(1);

    if (iErr) throw iErr;
    const item = Array.isArray(itemArr) ? itemArr[0] : itemArr;

    // Replace containers for this item
    const { error: delErr } = await supabase
      .from('weight_capture_containers')
      .delete()
      .eq('item_id', item.id);
    if (delErr) throw delErr;

    const caps = (Array.isArray(m.weight_captures) ? m.weight_captures : []).map((c) => ({
      item_id: item.id,
      entry_type: String(c.type || 'GOOD').toUpperCase(), // GOOD | DAMAGE
      container_no: c.container_no || null,
      gross: c.gross === '' ? null : Number(c.gross || 0),
      tare: c.tare === '' ? null : Number(c.tare || 0),
      net: Number(c.net || 0),
      remarks: c.remarks || null,
      photo: c.photo || null,
    }));

    if (caps.length) {
      const { error: cErr } = await supabase
        .from('weight_capture_containers')
        .insert(caps);
      if (cErr) throw cErr;
    }
  }

  return { ok: true, header_id: header.id };
}

/**
 * Fetch Weight-Capture data for GRN posting.
 * Returns { data: [...rows], headerInvoiceQty }
 * Each row has:
 *   material_code, material_desc, uom (code), po_qty, recv_qty,
 *   manufacturer, manufacturer_batch_no, vendor_code, vendor_batch_no,
 *   po_line_item, mfg_date, exp_date, retest_date,
 *   good_qty, damage_qty, total_qty, good_containers, damage_containers
 */
export async function fetchWeightForGRN(po_no, invoice_no) {
  // Find the header for this PO + Invoice
  const { data: header, error: hErr } = await supabase
    .from('weight_capture_headers')
    .select('id, po_no, invoice_no, invoice_date, status')
    .eq('po_no', po_no)
    .eq('invoice_no', invoice_no)
    .maybeSingle();

  if (hErr) throw hErr;
  if (!header?.id) return { data: [], headerInvoiceQty: 0 };

  // Items under the header
  const { data: items, error: iErr } = await supabase
    .from('weight_capture_items')
    .select([
      'id',
      'material_code',
      'material_desc',
      'uom',
      'po_qty',
      'recv_qty',
      'vendor_code',
      'vendor_batch_no',
      'manufacturer',
      'manufacturer_batch_no',
      'po_line_item',
      'mfg_date',
      'exp_date',
      'retest_date',
    ].join(','))
    .eq('header_id', header.id)
    .order('material_code', { ascending: true });

  if (iErr) throw iErr;

  const itemIds = (items || []).map((r) => r.id);
  let capsByItem = new Map();

  if (itemIds.length) {
    const { data: caps, error: cErr } = await supabase
      .from('weight_capture_containers')
      .select('id,item_id,entry_type,container_no,net')
      .in('item_id', itemIds);

    if (cErr) throw cErr;

    capsByItem = (caps || []).reduce((acc, r) => {
      if (!acc.has(r.item_id)) acc.set(r.item_id, []);
      acc.get(r.item_id).push(r);
      return acc;
    }, new Map());
  }

  const rows = (items || []).map((it) => {
    const rows = capsByItem.get(it.id) || [];
    const goodRows = rows.filter((r) => String(r.entry_type).toUpperCase() === 'GOOD');
    const dmgRows = rows.filter((r) => String(r.entry_type).toUpperCase() === 'DAMAGE');

    const good_qty = goodRows.reduce((a, b) => a + Number(b.net || 0), 0);
    const damage_qty = dmgRows.reduce((a, b) => a + Number(b.net || 0), 0);

    return {
      material_code: it.material_code,
      material_desc: it.material_desc,
      uom: it.uom, // GRNPosting adds a label later; keep the code here
      po_qty: it.po_qty,
      recv_qty: it.recv_qty,
      vendor_code: it.vendor_code,
      vendor_batch_no: it.vendor_batch_no,
      manufacturer: it.manufacturer,
      manufacturer_batch_no: it.manufacturer_batch_no,
      po_line_item: it.po_line_item,
      mfg_date: it.mfg_date,
      exp_date: it.exp_date,
      retest_date: it.retest_date,

      good_qty,
      damage_qty,
      total_qty: good_qty + damage_qty,
      good_containers: goodRows.length,
      damage_containers: dmgRows.length,
    };
  });

  // Header-level invoice qty for your UI (sum of invoice recv_qty)
  const headerInvoiceQty = rows.reduce((a, r) => a + (Number(r.recv_qty || 0) || 0), 0);

  return { data: rows, headerInvoiceQty };
}

// src/data/inboundSafe.js
import { supabase } from '@/utils/supabaseClient';

// Looks
const strip = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const isGE  = (q) => /^ge[\-_]?/i.test(q) || strip(q).startsWith('ge');
const isLR  = (q) => /^lr[\-_]?/i.test(q) || strip(q).startsWith('lr');

// Normalize po_bundle_json to array (handles jsonb or legacy string)
export function normalizePoBundle(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch { return []; }
  }
  return [];
}

/**
 * Get inbound rows for a single PO using the *view* (no JSON filter).
 * view: v_inbound_po_rows (security_invoker = on)
 */
export async function getInboundByPoViaView(poNo) {
  return supabase
    .from('v_inbound_po_rows')
    .select('id, created_at, gate_pass_no, lr_no, vehicle_no, delivery_note, status, po_no, invoice_no, po_bundle_json')
    .eq('po_no', String(poNo))
    .order('created_at', { ascending: false });
}

/**
 * Resolve user input (PO / GE / LR) to a list of distinct PO numbers.
 * - PO → query view by po_no   (no JSON filter)
 * - GE/LR → query inbound_gate_entries by equality and expand po_bundle_json locally
 */
export async function resolvePOsFromInput(input) {
  const q = String(input || '').trim();
  if (!q) return [];

  // PO-looking input → use the view
  if (!isGE(q) && !isLR(q)) {
    const { data, error } = await getInboundByPoViaView(q);
    if (error) throw error;
    const set = new Set();
    (data || []).forEach((row) => {
      if (row.po_no) set.add(row.po_no);
    });
    // If view has no rows yet, still return the typed PO so the
    // step-status pipeline can try downstream tables
    const list = Array.from(set);
    return list.length ? list : [q];
  }

  // GE/LR → *no JSON filter*: just equality on the base table
  const col = isGE(q) ? 'gate_pass_no' : 'lr_no';
  const { data, error } = await supabase
    .from('inbound_gate_entries')
    .select('po_bundle_json')
    .eq(col, q)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw error;

  const set = new Set();
  (data || []).forEach((row) => {
    normalizePoBundle(row.po_bundle_json).forEach((p) => {
      if (p?.po_no) set.add(p.po_no);
    });
  });
  return Array.from(set);
}

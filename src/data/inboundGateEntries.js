// src/data/inboundGateEntries.js
import { supabase } from '@/utils/supabaseClient';

// helpers to recognize GE/LR vs PO
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

/** Get inbound rows for a single PO via the view (no JSON filter from client) */
export async function getInboundByPoViaView(poNo) {
  return supabase
    .from('v_inbound_po_rows')
    .select('id, created_at, gate_pass_no, lr_no, vehicle_no, delivery_note, status, po_no, invoice_no, po_bundle_json')
    .eq('po_no', String(poNo))
    .order('created_at', { ascending: false });
}

/** Resolve arbitrary input (PO / GE / LR) to a distinct list of PO numbers */
export async function resolvePOsFromInput(input) {
  const q = String(input || '').trim();
  if (!q) return [];

  // PO-looking input → use the view; if empty, still return the typed PO
  if (!isGE(q) && !isLR(q)) {
    const { data, error } = await getInboundByPoViaView(q);
    if (error) throw error;
    const set = new Set((data || []).map((r) => r.po_no).filter(Boolean));
    const list = Array.from(set);
    return list.length ? list : [q];
  }

  // GE/LR → equality on base table (no JSON contains), then expand locally
  const col = isGE(q) ? 'gate_pass_no' : 'lr_no';
  const { data, error } = await supabase
    .from('inbound_gate_entries')
    .select('po_bundle_json')
    .eq(col, q)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const set = new Set();
  (data || []).forEach((row) => {
    normalizePoBundle(row.po_bundle_json).forEach((p) => p?.po_no && set.add(String(p.po_no)));
  });
  return Array.from(set);
}

/** High-level helper your UI can call */
export async function fetchInboundSmart(input) {
  const pos = await resolvePOsFromInput(input);
  if (!pos.length) return { data: [], error: null };

  // If you only need inbound rows for those POs, you can fetch the view here.
  // (Most dashboards only need the PO list; the step-status pipeline handles the rest.)
  const { data, error } = await supabase
    .from('v_inbound_po_rows')
    .select('id, created_at, gate_pass_no, lr_no, vehicle_no, delivery_note, status, po_no, invoice_no, po_bundle_json')
    .in('po_no', pos)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
}

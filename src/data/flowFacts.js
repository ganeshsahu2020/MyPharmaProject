// src/data/flowFacts.js
import { supabase } from "../utils/supabaseClient";

const isClosed = (s = "") =>
  /closed|done|posted|accepted|approved|completed/i.test(String(s || ""));

const toStr = (v) => String(v ?? "").trim();

/** Heuristics to decide if token is already a PO */
const looksLikePO = (t) =>
  /\/po\//i.test(t) || /^po[-/]/i.test(t) || /^[A-Z]{2,}\/\d{2}\/po\//i.test(t);

/**
 * Resolve any token (PO/GRN/GE/LR/LBL/Invoice) to a PO number.
 * Adjust table/view names if your schema differs.
 */
export async function resolveAnyToPO(raw) {
  const t = toStr(raw);
  if (!t) throw new Error("Empty token");
  if (looksLikePO(t)) return t;

  // Label → GRN → PO
  if (/^LBL[-_]/i.test(t)) {
    const lp =
      (await supabase
        .from("vw_label_prints_latest")
        .select("grn_no")
        .eq("uid", t)
        .maybeSingle()).data ||
      (await supabase
        .from("vw_label_prints_latest_v3")
        .select("grn_no")
        .eq("uid", t)
        .maybeSingle()).data ||
      null;
    const grn = lp?.grn_no;
    if (grn) {
      const gr = await supabase
        .from("grn_postings")
        .select("po_no")
        .eq("grn_no", grn)
        .maybeSingle();
      if (gr.data?.po_no) return gr.data.po_no;
    }
  }

  // GRN → PO
  if (/^GRN[-_]/i.test(t)) {
    const gr = await supabase
      .from("grn_postings")
      .select("po_no")
      .eq("grn_no", t)
      .maybeSingle();
    if (gr.data?.po_no) return gr.data.po_no;
  }

  // Gate Pass → PO (via JSONB bundle or helper view)
  if (/^GE[-_]/i.test(t)) {
    const viaView = await supabase
      .from("vw_po_gate_links")
      .select("po_no")
      .eq("gate_pass_no", t)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (viaView.data?.po_no) return viaView.data.po_no;

    const ge = await supabase
      .from("inbound_gate_entries")
      .select("po_bundle_json")
      .eq("gate_pass_no", t)
      .maybeSingle();
    const arr = Array.isArray(ge.data?.po_bundle_json)
      ? ge.data.po_bundle_json
      : [];
    const first = arr.find((x) => x?.po_no);
    if (first?.po_no) return first.po_no;
  }

  // LR → PO
  if (/^LR[-_]/i.test(t)) {
    const gr = await supabase
      .from("grn_postings")
      .select("po_no")
      .eq("lr_no", t)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gr.data?.po_no) return gr.data.po_no;

    const ge = await supabase
      .from("inbound_gate_entries")
      .select("po_bundle_json")
      .eq("lr_no", t)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const arr = Array.isArray(ge.data?.po_bundle_json)
      ? ge.data.po_bundle_json
      : [];
    const first = arr.find((x) => x?.po_no);
    if (first?.po_no) return first.po_no;
  }

  // Invoice → PO (if you use invoice_no on GRNs)
  const inv = await supabase
    .from("grn_postings")
    .select("po_no")
    .eq("invoice_no", t)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inv.data?.po_no) return inv.data.po_no;

  // Final fallback: maybe it's already a PO literal saved differently
  const gr2 = await supabase
    .from("grn_postings")
    .select("po_no")
    .eq("po_no", t)
    .limit(1)
    .maybeSingle();
  if (gr2.data?.po_no) return gr2.data.po_no;

  throw new Error("Could not resolve token to a PO");
}

/**
 * Compact “facts” for a PO based on the same RPC used by InboundPOFlow.
 * Also applies business rules:
 *  - If Palletization is completed → Gate Entry = Closed, Weight Capture = Completed
 */
export async function getFlowFactsForPO(poNo) {
  const { data, error } = await supabase.rpc("get_inbound_flow_by_po", {
    p_po_no: poNo,
  });
  if (error) throw error;

  const stages = data?.stages || {};
  const s = (k) => String(stages[k]?.status || "Open");

  const palletDone = isClosed(s("palletization"));
  const labelDone = isClosed(s("label_printing"));
  const grnDone = isClosed(s("grn_posting"));

  const statuses = {
    gateEntry: palletDone || grnDone ? "Closed" : s("gate_entry"),
    vehicleInspection: s("vehicle_inspection"),
    materialInspection: s("material_inspection"),
    weightCapture:
      palletDone || labelDone || grnDone ? "Completed" : s("weight_capture"),
    grnPosting: s("grn_posting"),
    labelPrinting: s("label_printing"),
    palletization: s("palletization"),
  };

  const summary = {
    poNo,
    statuses,
    invoices: data?.summary?.invoices || [],
    grns: data?.summary?.grns || [],
    gate_passes: data?.summary?.gate_passes || [],
  };

  const grnRows = Array.isArray(stages.grn_posting?.rows)
    ? stages.grn_posting.rows
    : [];
  const labelRows = Array.isArray(stages.label_printing?.rows)
    ? stages.label_printing.rows
    : [];
  const palletRows = Array.isArray(stages.palletization?.rows)
    ? stages.palletization.rows
    : [];

  return { summary, details: [], grnRows, labelRows, palletRows };
}

// Legacy name some places expect:
export async function fetchFlowFacts(poNo) {
  return getFlowFactsForPO(poNo);
}

export default getFlowFactsForPO;

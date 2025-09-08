// src/data/fetchPoFlow.jsx
import { supabase } from "../utils/supabaseClient";

/**
 * Get everything related to a single PO number.
 * Returns an object with:
 *   { heads, gateEntries, vehicleInspections, materialInspections, weightCaptures, grnPostings }
 *
 * NOTE: Rename the module table names below if yours differ:
 *   vehicle_inspections, material_inspections, weight_captures, grn_postings
 */
export async function fetchPoFlow(poNo) {
  const po = String(poNo || "").trim();
  if (!po) throw new Error("Missing PO number");

  // 1) Find Gate Entry rows that include this PO in po_bundle_json
  const { data: heads, error: e1 } = await supabase
    .from("inbound_gate_entries")
    .select(
      "id, gate_pass_no, lr_no, vehicle_no, delivery_note, status, created_at, po_bundle_json"
    )
    // JSONB containment: array contains an object with { po_no: "<po>" }
    .contains("po_bundle_json", [{ po_no: po }]);

  if (e1) throw e1;

  if (!heads?.length) {
    return {
      heads: [],
      gateEntries: [],
      vehicleInspections: [],
      materialInspections: [],
      weightCaptures: [],
      grnPostings: [],
    };
  }

  const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];

  const gatePassNos = uniq(heads.map((h) => h.gate_pass_no));
  const lrNos = uniq(heads.map((h) => h.lr_no));

  // 2) Fan-out to module tables (adjust names to match your schema)
  const [
    { data: gateEntries, error: eGE },
    { data: vehicleInspections, error: eVI },
    { data: materialInspections, error: eMI },
    { data: weightCaptures, error: eWC },
    // GRN rows can be keyed by gate_pass_no or lr_no — fetch both and merge.
    { data: grnByGP, error: eGRN1 },
    { data: grnByLR, error: eGRN2 },
  ] = await Promise.all([
    supabase
      .from("inbound_gate_entries")
      .select("*")
      .in("gate_pass_no", gatePassNos),

    supabase
      .from("vehicle_inspections") // <- your real table name
      .select("*")
      .in("gate_pass_no", gatePassNos),

    supabase
      .from("material_inspections") // <- your real table name
      .select("*")
      .in("gate_pass_no", gatePassNos),

    supabase
      .from("weight_captures") // <- your real table name
      .select("*")
      .in("gate_pass_no", gatePassNos),

    supabase
      .from("grn_postings") // <- your real table name
      .select("*")
      .in("gate_pass_no", gatePassNos),

    supabase
      .from("grn_postings") // sometimes keyed on LR
      .select("*")
      .in("lr_no", lrNos),
  ]);

  if (eGE || eVI || eMI || eWC || eGRN1 || eGRN2)
    throw eGE || eVI || eMI || eWC || eGRN1 || eGRN2;

  const grnPostings = [...(grnByGP || []), ...(grnByLR || [])];

  return {
    heads: heads || [],
    gateEntries: gateEntries || [],
    vehicleInspections: vehicleInspections || [],
    materialInspections: materialInspections || [],
    weightCaptures: weightCaptures || [],
    grnPostings,
  };
}

export default fetchPoFlow;

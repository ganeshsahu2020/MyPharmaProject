// src/utils/progress.js
// Stage flags helper stored in inbound_gate_entries.progress_json
import { supabase } from "./supabaseClient";
import { extractUuid } from "./gatepass"; // we exported extractUuid there

// Canonical keys for all stages you asked for
export const STAGES = {
  GATE_ENTRY: "gate_entry_done",
  VEHICLE_INSPECTION: "vehicle_inspection_done",
  MATERIAL_INSPECTION: "material_inspection_done",
  WEIGHT_CAPTURE: "weight_capture_done",
  GRN_POSTING: "grn_posting_done",
  LABEL_PRINT: "label_print_done",
  MATERIAL_IN_LOCATION: "material_in_location_done",
};

// Read progress_json for a GP (by uuid or gate_pass_no)
export async function getProgress(idOrNo) {
  const raw = String(idOrNo || "").trim();
  const uuid = extractUuid(raw);

  let q = supabase
    .from("inbound_gate_entries")
    .select("id,gate_pass_no,progress_json")
    .limit(1);

  q = uuid ? q.eq("id", uuid) : q.eq("gate_pass_no", raw);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Gate pass not found");
  return data.progress_json || {};
}

/**
 * Mark/unmark a single stage key (done=true/false).
 * Adds a timestamp companion key like "<key>_at".
 * Only selects safe columns -> no 400s if optional columns are absent.
 */
export async function setStage(idOrNo, stageKey, done = true) {
  if (!stageKey) throw new Error("stageKey required");

  const raw = String(idOrNo || "").trim();
  const uuid = extractUuid(raw);

  // 1) fetch current progress_json
  let sel = supabase
    .from("inbound_gate_entries")
    .select("id,gate_pass_no,progress_json")
    .limit(1);
  sel = uuid ? sel.eq("id", uuid) : sel.eq("gate_pass_no", raw);

  const { data, error } = await sel.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Gate pass not found");

  const nowIso = new Date().toISOString();
  const next = {
    ...(data.progress_json || {}),
    [stageKey]: !!done,
  };

  if (done) next[`${stageKey}_at`] = nowIso;
  else delete next[`${stageKey}_at`];

  // 2) update only progress_json (no .limit(), no unsafe selects)
  let upd = supabase
    .from("inbound_gate_entries")
    .update({ progress_json: next });

  upd = uuid ? upd.eq("id", data.id) : upd.eq("gate_pass_no", data.gate_pass_no);

  const { error: e2 } = await upd;
  if (e2) throw e2;

  return next;
}
